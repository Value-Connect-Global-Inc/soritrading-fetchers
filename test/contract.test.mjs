// Fetcher contract tests — a contributed folder that breaks the rules fails here first.
//
//  ★ No network: fetchRows takes an injected fetch, so this checks parsing only.
//    (Real data is verified by a human running `node run.mjs <name>`. A test that depends on
//     someone else's server turns their bad day into our red CI.)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadAll, listKeys, loadFetcher } from '../lib/registry.mjs'
import { assertTable } from '../lib/db.mjs'
import { mergeCrontab, cronLines, BEGIN, END } from '../lib/cron.mjs'

const CRON_RE = /^(\S+\s+){4}\S+$/   // five fields

test('every fetcher satisfies the meta contract (the directory is the list)', async () => {
  const all = await loadAll()
  assert.ok(all.length >= 11, 'fetchers are missing — fetchers/ was not read')
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
    'btc-miner-revenue': [fake({ values: [{ x: 1700000000, y: 4.2e7 }] }), [[1700000000, 4.2e7]]],
    //  ★ FRED writes '.' on days a market was closed. The row is DROPPED, not stored as NaN
    //    or 0 — "no observation" and "the index printed zero" are different facts, and a
    //    strategy that cannot tell them apart will trade on the wrong one.
    vix: [fake('DATE,VIXCLS\n2023-11-15,14.16\n2023-11-23,.\n', true), [[1700006400, 14.16]]],
    //  ★ The spread goes NEGATIVE when the curve inverts — a parser that filtered
    //    "invalid" values by sign would erase exactly the regime this series exists for.
    'yield-curve': [fake('DATE,T10Y2Y\n2023-11-15,-0.45\n', true), [[1700006400, -0.45]]],
    'dollar-index': [fake('DATE,DTWEXBGS\n2023-11-15,119.85\n', true), [[1700006400, 119.85]]],
    //  ★ DefiLlama sends `date` as a STRING of epoch seconds, and totalCirculating as an
    //    object of pegged buckets. ★★ The buckets are NOT summed: peggedEUR is denominated in
    //    euros, so adding it to dollars produces a number with no unit. USD peg only.
    'stablecoin-mcap': [fake([{ date: '1700000000', totalCirculating: { peggedUSD: 120e9, peggedEUR: 1e9 } }]),
      [[1700000000, 120e9]]],
    'defi-tvl': [fake([{ date: 1700000000, tvl: 45e9 }]), [[1700000000, 45e9]]],
    //  ★ DVOL candles are [tsMs, o, h, l, c] — we keep the CLOSE and convert ms → seconds.
    //    `continuation: null` ends the walk; without that the loop would page forever.
    'btc-dvol': [fake({ result: { data: [[1700000000000, 50, 56, 49, 55.5]], continuation: null } }),
      [[1700000000, 55.5]]],
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

// ── Failure messages (real failure 2026-08-24) ────────────────────────────────
//
//  ★ `stablecoin-mcap` failed with "Unexpected end of JSON input". That sentence names the
//    symptom and hides every fact needed to fix it: which URL, what status, what came back.
//    The cause was an EMPTY 200 from the wrong host — the fetcher had the fact and threw it
//    away. These tests lock the facts into the message.
import { fetchJson, fetchText } from '../lib/sources.mjs'

const res = (body, status = 200) => async () => ({ status, text: async () => body })

test('an empty body says "empty", not "Unexpected end of JSON input"', async () => {
  await assert.rejects(() => fetchJson(res(''), 'https://x.test/a'),
    (e) => { assert.match(e.message, /empty body from https:\/\/x\.test\/a/); return true })
  await assert.rejects(() => fetchText(res('   '), 'https://x.test/b'), /empty body/)
})

test('an HTML error page names the URL and shows the first bytes', async () => {
  await assert.rejects(() => fetchJson(res('<!DOCTYPE html><title>404</title>'), 'https://x.test/c'),
    (e) => {
      assert.match(e.message, /not JSON from https:\/\/x\.test\/c/)
      assert.match(e.message, /DOCTYPE/, 'the body is hidden — that is the whole failure being repeated')
      return true
    })
})

test('a non-2xx status fails before parsing — a 500 page is not "no data"', async () => {
  await assert.rejects(() => fetchJson(res('{}', 503), 'https://x.test/d'), /HTTP 503 from https:\/\/x\.test\/d/)
})

test('★ blockchain.com charts ask for sampled=false — the default silently returns ~1.5k points', async () => {
  //  실측 2026-08-24: 17년치가 1,608행(약 4일 간격)으로 왔고 응답 어디에도 그 사실이 없었다.
  for (const k of ['btc-hashrate', 'btc-active-addresses', 'btc-miner-revenue']) {
    const { meta } = await loadFetcher(k)
    assert.match(meta.url, /sampled=false/, k + ': the source will downsample and not say so')
  }
})

test('★ stablecoin-mcap points at the stablecoins host — api.llama.fi answers it EMPTY', async () => {
  const { meta } = await loadFetcher('stablecoin-mcap')
  assert.match(meta.url, /^https:\/\/stablecoins\.llama\.fi\//,
    'measured 2026-08-24: the documented api.llama.fi base returns an empty 200 for this path')
})
