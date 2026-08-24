// Database writes — takes the [ts, value] rows a fetcher returned and stores them.
//
//  ★ `pg` is imported dynamically: the contract test must run without a database or a
//    network, and `node run.mjs list` should work before `npm install`.
//  ★ A table name is an identifier, so it cannot be a bound parameter. That is why it goes
//    through a **whitelist**: fetchers are contributed by other people, and this is the border.

const TABLE_RE = /^[a-z][a-z0-9_]{0,60}$/

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
    await c.query(`CREATE TABLE IF NOT EXISTS ${table} (ts bigint PRIMARY KEY, v numeric NOT NULL)`)
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500)
      const values = chunk.map((_, k) => `($${k * 2 + 1},$${k * 2 + 2})`).join(',')
      await c.query(
        `INSERT INTO ${table} (ts, v) VALUES ${values} ON CONFLICT (ts) DO UPDATE SET v = EXCLUDED.v`,
        chunk.flat())
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
 * @returns {Promise<{table:string, state:'ok'|'missing'|'error', rows?:number,
 *   first?:number, last?:number, lastValue?:number, note?:string}>}
 */
export async function tableStats(url, table) {
  assertTable(table)
  const { default: pg } = await import('pg')
  const c = new pg.Client({ connectionString: url })
  await c.connect()
  try {
    const { rows: [t] } = await c.query('SELECT to_regclass($1) AS r', [table])
    if (!t || !t.r) return { table, state: 'missing', note: 'table does not exist — this fetcher has never run here' }
    const { rows: [s] } = await c.query(
      `SELECT count(*)::int n, min(ts) f, max(ts) l,
              (SELECT v FROM ${table} ORDER BY ts DESC LIMIT 1) AS lastv FROM ${table}`)
    return { table, state: 'ok', rows: s.n, first: Number(s.f), last: Number(s.l), lastValue: Number(s.lastv) }
  } catch (e) {
    return { table, state: 'error', note: (e && e.message) || String(e) }
  } finally {
    try { await c.end() } catch { /* already closed */ }
  }
}
