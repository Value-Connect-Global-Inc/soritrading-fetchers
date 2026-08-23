// DB 쓰기 — 페처가 돌려준 [ts, v] 를 테이블에 넣는다.
//
//  ★ pg 는 **동적 import** 다: 계약 테스트(test/contract.test.mjs)는 네트워크도 DB 도
//    없이 돌아야 하고, npm install 전에도 `node run.mjs list` 가 동작해야 한다.
//  ★ 테이블 이름은 식별자라 파라미터로 못 넣는다 — 그래서 **화이트리스트 정규식**으로 막는다.
//    페처가 주는 값이지만, 페처는 남이 PR 로 추가하는 것이다(경계는 여기다).

const TABLE_RE = /^[a-z][a-z0-9_]{0,60}$/

export function assertTable(name) {
  if (!TABLE_RE.test(String(name || ''))) {
    throw new Error(`테이블 이름이 규격을 벗어났다: ${name} (영문 소문자로 시작, [a-z0-9_] 최대 61자)`)
  }
  return name
}

/**
 * @param {string} url  postgres:// 연결 문자열(쓰기 계정)
 * @param {string} table
 * @param {[number, number][]} rows  [초 단위 epoch, 값]
 * @param {{ readRole?: string|null }} [opt]
 * @returns {Promise<{ inserted:number, total:number, first:number, last:number }>}
 */
export async function upsertRows(url, table, rows, opt = {}) {
  assertTable(table)
  const { default: pg } = await import('pg')
  const c = new pg.Client({ connectionString: url })
  await c.connect()
  try {
    await c.query(`CREATE TABLE IF NOT EXISTS ${table} (ts bigint PRIMARY KEY, v numeric NOT NULL)`)
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500)
      const values = chunk.map((_, k) => `($${k * 2 + 1},$${k * 2 + 2})`).join(',')
      await c.query(
        `INSERT INTO ${table} (ts, v) VALUES ${values} ON CONFLICT (ts) DO UPDATE SET v = EXCLUDED.v`,
        chunk.flat())
    }
    //  읽기 전용 계정이 **새로 만든 테이블**도 읽게 한다. 가이드의 default privileges 가
    //  있으면 이미 되지만, 없는 DB 도 있어 명시한다. 롤이 없으면 조용히 넘긴다(에러 아님).
    const role = opt.readRole === undefined ? 'readonly_bot' : opt.readRole
    if (role) { try { await c.query(`GRANT SELECT ON ${table} TO ${assertTable(role)}`) } catch { /* 롤 없음 */ } }
    const { rows: [s] } = await c.query(`SELECT count(*)::int n, min(ts) f, max(ts) l FROM ${table}`)
    return { total: s.n, first: Number(s.f), last: Number(s.l), inserted: rows.length }
  } finally {
    try { await c.end() } catch { /* 이미 닫힘 */ }
  }
}
