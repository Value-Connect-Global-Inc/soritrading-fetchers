// Old-parser zero repair (2026-10-30) — which stored rows get deleted.
//  ★ The rule is "the source listed that date WITHOUT a number", never "the stored value is 0".
//    Timestamps are written out (UTC midnight), not derived from the code under test.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseFredHoles, repairTs, fredRows, parseChartValues, parseLlamaSeries, num } from '../lib/sources.mjs'
import { loadFetcher } from '../lib/registry.mjs'
import { repairNote } from '../lib/db.mjs'

//  2024-01-01 1704067200 · 01-02 1704153600 · 01-03 1704240000 · 01-04 1704326400
//  01-05 1704412800 · 01-08 1704672000 · 01-09 1704758400
const CSV = 'observation_date,T10Y2Y\n'
  + '2024-01-01,.\n'      // hole
  + '2024-01-02,\n'       // hole
  + '2024-01-03,0.00\n'   // a REAL zero — must stay
  + '2024-01-04,1.23\n'
  + '2024-01-05, \n'      // hole
  + '2024-01-09,ND\n'     // hole

test('holes are the dates listed with ".", "", " " or "ND" — not "0.00"', () => {
  assert.deepEqual(parseFredHoles(CSV), [1704067200, 1704153600, 1704412800, 1704758400])
})

test('delete = stored rows on hole dates; real 0.00 and dates the CSV does not list stay', () => {
  //  table holds the old-parser zeros on 01-01, 01-02, 01-05, the real 0 on 01-03, 1.23 on 01-04,
  //  and 01-08 which the CSV does not mention at all (absence is not evidence → keep).
  const tableTs = [1704067200, 1704153600, 1704240000, 1704326400, 1704412800, 1704672000]
  assert.deepEqual(repairTs(parseFredHoles(CSV), tableTs), [1704067200, 1704153600, 1704412800])
})

test('repairTs: nothing in the table, or nothing missing → nothing deleted', () => {
  assert.deepEqual(repairTs([1704067200], []), [])
  assert.deepEqual(repairTs([], [1704067200]), [])
  assert.deepEqual(repairTs(undefined, undefined), [])
  //  pg returns bigint as strings — still matched
  assert.deepEqual(repairTs([1704067200], ['1704067200']), [1704067200])
})

test('fredRows: rows unchanged, holes attached but invisible to deepEqual/JSON', () => {
  const r = fredRows(CSV)
  assert.deepEqual(r, [[1704240000, 0], [1704326400, 1.23]])
  assert.deepEqual(r.holes, [1704067200, 1704153600, 1704412800, 1704758400])
  assert.equal(JSON.stringify(r), '[[1704240000,0],[1704326400,1.23]]')
})

test('num(): null / "" / "." are not numbers (Number() would say 0)', () => {
  for (const x of [null, undefined, '', ' ', '.', 'ND', NaN, Infinity, {}, []]) assert.ok(Number.isNaN(num(x)), String(x))
  assert.equal(num('0'), 0); assert.equal(num(0), 0); assert.equal(num(' -1.5e2 '), -150); assert.equal(num('7'), 7)
})

test('other sources: a null/blank value is a hole, not 0', async () => {
  const c = parseChartValues({ values: [{ x: 1700000000, y: null }, { x: 1700086400, y: 5 }, { x: 1700172800, y: '' }] })
  assert.deepEqual(c, [[1700086400, 5]])
  assert.deepEqual(c.holes, [1700000000, 1700172800])

  const l = parseLlamaSeries([{ date: '1700000000', tvl: null }, { date: '1700086400', tvl: 4 }], 'tvl')
  assert.deepEqual(l, [[1700086400, 4]])
  assert.deepEqual(l.holes, [1700000000])

  const fg = await (await loadFetcher('fear-greed')).fetchRows(async () => ({
    json: async () => ({ data: [{ timestamp: '1700000000', value: '' }, { timestamp: '1700086400', value: '0' }] }) }))
  assert.deepEqual(fg, [[1700086400, 0]])
  assert.deepEqual(fg.holes, [1700000000])

  const dv = await (await loadFetcher('btc-dvol')).fetchRows(async () => ({
    json: async () => ({ result: { data: [[1700000000000, 1, 1, 1, null], [1700086400000, 1, 1, 1, 50]], continuation: null } }) }))
  assert.deepEqual(dv, [[1700086400, 50]])
  assert.deepEqual(dv.holes, [1700000000])
})

test('every FRED fetcher hands its holes to the runner', async () => {
  for (const k of ['dollar-index', 'vix', 'yield-curve', 'fed-funds']) {
    const r = await (await loadFetcher(k)).fetchRows(async () => ({ text: async () => CSV }))
    assert.deepEqual(r.holes, [1704067200, 1704153600, 1704412800, 1704758400], k)
  }
})

test('a failed fetch throws before any repair can run', async () => {
  await assert.rejects(() => loadFetcher('vix').then((m) => m.fetchRows(async () => ({ status: 503, text: async () => '' }))), /HTTP 503/)
})

test('repairNote prints 0 deletions too, and nothing when no repair ran', () => {
  assert.equal(repairNote(null), '')
  assert.match(repairNote({ deleted: 0, zeros: 0 }), /deleted 0 /)
  assert.match(repairNote({ deleted: 302, zeros: 302 }), /deleted 302 .*302 of them were 0/)
})
