// Fetcher contract tests — a contributed folder that breaks the rules fails here first.
//
//  ★ No network: fetchRows takes an injected fetch, so this checks parsing only.
//    (Real data is verified by a human running `node run.mjs <name>`. A test that depends on
//     someone else's server turns their bad day into our red CI.)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadAll, listKeys } from '../lib/registry.mjs'
import { assertTable } from '../lib/db.mjs'
import { mergeCrontab, cronLines, BEGIN, END } from '../lib/cron.mjs'

const CRON_RE = /^(\S+\s+){4}\S+$/   // five fields

test('every fetcher satisfies the meta contract (the directory is the list)', async () => {
  const all = await loadAll()
  assert.ok(all.length >= 4, 'no fetchers found — fetchers/ was not read')
  for (const { key, meta } of all) {
    assert.equal(meta.key, key, `${key}: meta.key mismatch`)
    assertTable(meta.table)                                     // identifier whitelist
    assert.ok(meta.title && meta.source, `${key}: title and source are required`)
    assert.ok(/^https:\/\//.test(meta.url), `${key}: url must be https`)
    assert.match(meta.cron, CRON_RE, `${key}: cron must have five fields`)
    //  ★ An empty license makes "not checked" indistinguishable from "no restrictions",
    //    so a sentence is mandatory.
    assert.ok(meta.license && meta.license.length > 5, `${key}: a one-line license note is required`)
  }
})

test('table names do not collide — two fetchers sharing a table silently interleave', async () => {
  const all = await loadAll()
  const tables = all.map((a) => a.meta.table)
  assert.equal(new Set(tables).size, tables.length, 'duplicate tables: ' + tables.join(', '))
})

/** Minimal stand-in for fetch. */
const fake = (body, text = false) => async () => (text
  ? { text: async () => body }
  : { json: async () => body })

test('parsed rows are [epoch SECONDS, number] — the unit is never left to be guessed', async () => {
  const cases = {
    'fear-greed': [fake({ data: [{ timestamp: '1700000000', value: '42' }] }), [[1700000000, 42]]],
    'btc-hashrate': [fake({ values: [{ x: 1700000000, y: 5.5e8 }] }), [[1700000000, 5.5e8]]],
    'btc-active-addresses': [fake({ values: [{ x: 1700000000, y: 900000 }] }), [[1700000000, 900000]]],
    //  ★ Date-only CSV must land on UTC midnight (local parsing shifts by a day depending on
    //    the host). 2023-11-15T00:00:00Z = 1700006400 — written out, not derived from the code
    //    under test, so a change in behaviour fails this line.
    'fed-funds': [fake('DATE,DFF\n2023-11-15,5.33\n', true), [[1700006400, 5.33]]],
  }
  const all = await loadAll()
  for (const { key, fetchRows } of all) {
    const c = cases[key]
    assert.ok(c, `${key}: no case here — a new fetcher needs one added to this test`)
    assert.deepEqual(await fetchRows(c[0]), c[1], key)
  }
})

test('crontab merge is idempotent and leaves other entries alone', async () => {
  const items = (await loadAll()).map(({ key, meta }) => ({ key, meta }))
  const lines = cronLines(items, { dir: '/home/u/f', node: '/usr/bin/node' })
  assert.equal(lines.length, items.length)
  assert.match(lines[0], /cd \/home\/u\/f && \/usr\/bin\/node run\.mjs \S+ >> /)

  const mine = '0 5 * * * /usr/bin/backup.sh\n'
  const once = mergeCrontab(mine, lines)
  const twice = mergeCrontab(once, lines)
  assert.equal(once, twice, 'installing twice would leave two blocks')
  assert.ok(twice.includes('/usr/bin/backup.sh'), "the user's own entry was dropped")
  assert.equal(twice.split(BEGIN).length - 1, 1)
  assert.equal(twice.split(END).length - 1, 1)
})

test('table identifiers are whitelisted even though a fetcher supplied them', () => {
  for (const bad of ['DROP', 'a; drop table x', '1abc', 'a'.repeat(70), '']) {
    assert.throws(() => assertTable(bad), /invalid identifier/, String(bad))
  }
  assert.equal(assertTable('fear_greed'), 'fear_greed')
})

test('folder names stay [a-z0-9-] — the runner uses them as a path', async () => {
  for (const k of await listKeys()) assert.match(k, /^[a-z0-9-]{1,40}$/, k)
})
