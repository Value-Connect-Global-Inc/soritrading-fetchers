// Database writes — takes the [ts, value] rows a fetcher returned and stores them.
//
//  ★ `pg` is imported dynamically: the contract test must run without a database or a
//    network, and `node run.mjs list` should work before `npm install`.
//  ★ A table name is an identifier, so it cannot be a bound parameter. That is why it goes
//    through a **whitelist**: fetchers are contributed by other people, and this is the border.

const TABLE_RE = /^[a-z][a-z0-9_]{0,60}$/

//  ══ ★★★ 시각 컬럼이 **둘**인 이유 (2026-09-07) ═══════════════════════════════
//  `ctx.data` 비콘이 "이 값은 4.7일 됐다"고 말할 때, 그 뒤엔 **셋**이 섞여 있었다:
//      ① 소스가 새 날짜를 안 줬다(정상)  ② cron 이 죽었다  ③ 돌았는데 실패했다
//  화면에는 셋이 똑같이 보였고, 가르려면 cron 로그와 max(ts) 를 **손으로 대조**해야 했다.
//  실제로 그렇게 갈랐고(2026-09-07), 유저는 그걸 못 한다. 그리고 이 값은 거래에 쓰인다.
//
//  ⇒ 두 질문은 **다른 질문**이고, 한 컬럼에 접으면 언젠가 한쪽이 조용히 틀린다:
//      checked_at   … 우리가 이 행을 **마지막으로 확인한** 시각. 충돌마다 갱신.
//                     → "수집이 살아있나"에 답한다. 값이 안 바뀌어도 갱신된다.
//      ingested_at  … 이 행이 **처음 들어온** 시각. 절대 갱신하지 않는다.
//                     → "그때 알 수 있었던 값"(PIT)에 답한다.
//
//  ★ ingested_at 은 **지금 안 적으면 영영 못 만든다** — "언제 처음 봤나"는 소급이 안 된다.
//    (같은 이유로 OANDA 스왑 스냅샷을 오늘 시작한다는 결정이 있었다.)
//  ★★ 기존 행에는 둘 다 **NULL 로 남긴다**. now() 로 채우면 "오늘 처음 봤다"는 **거짓**이 된다.
//    NULL = 모른다. 그게 사실이다.

/** 표 생성 DDL. ★ 이미 있는 표는 CREATE IF NOT EXISTS 가 **안 건드린다** — ALTER 가 필요하다. */
export function createSql(table) {
  return `CREATE TABLE IF NOT EXISTS ${table} (`
    + 'ts bigint PRIMARY KEY, v numeric NOT NULL, '
    + 'ingested_at timestamptz, checked_at timestamptz)'
}

/** 구버전 표에 컬럼을 붙인다. ★ DEFAULT 를 주지 않는다 — 과거 행의 시각을 지어내지 않는다. */
export function alterSql(table) {
  return [
    `ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ingested_at timestamptz`,
    `ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS checked_at timestamptz`,
  ]
}

/**
 * upsert 문. `now()` 는 **DB 시계**를 쓴다 — 수집기 호스트의 시계가 틀어져도 표는 일관된다.
 *  ★ 충돌 시 `ingested_at` 을 건드리지 않는다. COALESCE 로 채우고 싶어지지만, 그러면
 *    옛 행이 "오늘 처음 들어왔다"고 말하게 된다. 모르는 건 모르는 채로 둔다.
 */
export function upsertSql(table, values) {
  return `INSERT INTO ${table} (ts, v, ingested_at, checked_at) VALUES ${values}`
    + ' ON CONFLICT (ts) DO UPDATE SET v = EXCLUDED.v, checked_at = EXCLUDED.checked_at'
}

export function assertTable(name) {
  if (!TABLE_RE.test(String(name || ''))) {
    throw new Error(`invalid identifier: ${name} (lowercase start, [a-z0-9_], max 61 chars)`)
  }
  return name
}

/**
 * @param {string} url  postgres:// connection string (write account)
 * @param {string} table
 * @param {[number, number][]} rows  [epoch seconds, value]
 * @param {{ readRole?: string|null }} [opt]
 * @returns {Promise<{ inserted:number, total:number, first:number, last:number }>}
 */
export async function upsertRows(url, table, rows, opt = {}) {
  assertTable(table)
  const { default: pg } = await import('pg')
  const c = new pg.Client({ connectionString: url })
  await c.connect()
  try {
    await c.query(createSql(table))
    //  ★ 이미 있던 표에도 컬럼을 붙인다. CREATE IF NOT EXISTS 는 기존 표를 안 고친다 —
    //    이 두 줄이 없으면 새 표에만 시각이 생기고 **정작 오래 돌던 표엔 안 생긴다.**
    for (const q of alterSql(table)) await c.query(q)
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500)
      const values = chunk.map((_, k) => `($${k * 2 + 1},$${k * 2 + 2},now(),now())`).join(',')
      await c.query(upsertSql(table, values), chunk.flat())
    }
    //  Let the read-only account read a table that was just created. Default privileges
    //  usually cover this, but not every database has them set. If the role does not exist,
    //  that is not an error here.
    const role = opt.readRole === undefined ? 'readonly_bot' : opt.readRole
    if (role) { try { await c.query(`GRANT SELECT ON ${table} TO ${assertTable(role)}`) } catch { /* no such role */ } }
    const { rows: [s] } = await c.query(`SELECT count(*)::int n, min(ts) f, max(ts) l FROM ${table}`)
    return { total: s.n, first: Number(s.f), last: Number(s.l), inserted: rows.length }
  } finally {
    try { await c.end() } catch { /* already closed */ }
  }
}

/**
 * What is actually in a table right now — used by `run.mjs --check`.
 *
 *  ★ "Not loaded yet" and "loaded but empty" and "the query blew up" are three different
 *    facts. A check that folds them into one line teaches you to distrust the check.
 *
 *  ★★ `checkedAt` 도 **3상태**다 (2026-09-07):
 *      값     … 그때 확인했다
 *      null   … 컬럼은 있는데 아직 한 번도 안 썼다(이 표는 그 뒤로 수집이 안 돌았다)
 *      undefined + hasChecked:false … **컬럼 자체가 없다**(구버전 표 — 한 번 수집하면 생긴다)
 *    셋을 뭉개면 "수집이 죽었다"와 "이 기능이 아직 없다"가 같은 화면이 된다.
 * @returns {Promise<{table:string, state:'ok'|'missing'|'error', rows?:number,
 *   first?:number, last?:number, lastValue?:number, checkedAt?:string|null,
 *   hasChecked?:boolean, note?:string}>}
 */
export async function tableStats(url, table) {
  assertTable(table)
  const { default: pg } = await import('pg')
  const c = new pg.Client({ connectionString: url })
  await c.connect()
  try {
    const { rows: [t] } = await c.query('SELECT to_regclass($1) AS r', [table])
    if (!t || !t.r) return { table, state: 'missing', note: 'table does not exist — this fetcher has never run here' }
    //  ★ 컬럼이 있는지 **먼저 묻는다.** 없는 컬럼을 SELECT 하면 표 전체 조회가 죽고,
    //    그러면 '구버전 표'가 'error' 로 둔갑한다 — 그건 다른 사실이다.
    const { rows: [col] } = await c.query(
      `SELECT count(*)::int n FROM information_schema.columns
        WHERE table_name = $1 AND column_name = 'checked_at'`, [table])
    const hasChecked = col.n > 0
    const { rows: [s] } = await c.query(
      `SELECT count(*)::int n, min(ts) f, max(ts) l,
              (SELECT v FROM ${table} ORDER BY ts DESC LIMIT 1) AS lastv
              ${hasChecked ? `, max(checked_at) AS chk` : ''} FROM ${table}`)
    return { table, state: 'ok', rows: s.n, first: Number(s.f), last: Number(s.l),
      lastValue: Number(s.lastv), hasChecked,
      //  ★ 컬럼이 없으면 키를 안 만든다 — undefined('물어본 적 없음')와 null('비어 있음')을 가른다.
      ...(hasChecked ? { checkedAt: s.chk ? new Date(s.chk).toISOString() : null } : {}) }
  } catch (e) {
    return { table, state: 'error', note: (e && e.message) || String(e) }
  } finally {
    try { await c.end() } catch { /* already closed */ }
  }
}
