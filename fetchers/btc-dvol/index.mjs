// Deribit DVOL — BTC implied volatility index (daily close), crypto's own "VIX".
//
//  ★ Why this and not the equity VIX: DVOL is priced off BTC options, so it reacts to crypto
//    events the equity market does not care about. Having BOTH lets a strategy ask whether a
//    move is crypto-specific or part of a wider risk-off — one number cannot answer that.
//  ★ The value is an annualised volatility in PERCENT (e.g. 55 = 55%/yr), not a price.
//  ★ History starts around 2021-03 for BTC. Before that the table simply has no rows — that
//    is a real hole, not a fetch failure. Do not backfill it with a guess.
//
//  ★★ Pagination: the endpoint requires start/end and answers with the most recent chunk
//    plus a `continuation` timestamp to use as the NEXT end. So the walk goes backwards.
//    The loop is capped: a source that keeps handing back continuations must not turn a
//    daily cron into an infinite request loop against someone else's server.

import { fetchJson, num, withHoles } from '../../lib/sources.mjs'

const API = 'https://www.deribit.com/api/v2/public/get_volatility_index_data'
const START_MS = Date.parse('2021-01-01T00:00:00Z')   // before BTC DVOL history begins
const MAX_PAGES = 40

export const meta = {
  key: 'btc-dvol',
  table: 'btc_dvol',
  title: 'BTC implied volatility (Deribit DVOL)',
  describe: 'Deribit DVOL: BTC 30-day implied volatility, annualised percent (55 = 55%/yr), daily close, since 2021-03.',
  source: 'Deribit',
  url: `${API}?currency=BTC&resolution=1D`,
  //  Deribit's daily candle closes at 00:00 UTC — fetch after it is sealed.
  cron: '25 0 * * *',
  license: 'Deribit public API (no key). Check Deribit terms before commercial redistribution.',
}

/** One page → [[tsSec, close], …] plus the continuation cursor (null when done). */
function parsePage(json) {
  const res = (json && json.result) || {}
  const rows = []
  const holes = []
  for (const c of Array.isArray(res.data) ? res.data : []) {
    //  candle = [tsMs, open, high, low, close] — we store the CLOSE, like a daily bar.
    //  ★ num(), not Number(): a null close would have been 0 — a 0% implied volatility.
    const ts = Math.floor(num(c && c[0]) / 1000)
    if (!Number.isFinite(ts)) continue
    const close = num(c[4])
    if (Number.isFinite(close)) rows.push([ts, close])
    else holes.push(ts)
  }
  const cont = Number(res.continuation)
  return { rows, holes, continuation: Number.isFinite(cont) && cont > 0 ? cont : null }
}

export async function fetchRows(fetchImpl = fetch, now = Date.now()) {
  const seen = new Map()   // ts → value; pages can overlap at the boundary
  const holes = new Set()
  let end = now
  for (let page = 0; page < MAX_PAGES; page++) {
    const url = `${API}?currency=BTC&resolution=1D&start_timestamp=${START_MS}&end_timestamp=${end}`
    const { rows, holes: h, continuation } = parsePage(await fetchJson(fetchImpl, url))
    for (const [t, v] of rows) seen.set(t, v)
    for (const t of h) holes.add(t)
    //  Stop when the source says there is no more, or when it stops moving backwards
    //  (a continuation that does not advance would spin forever).
    if (!continuation || continuation >= end || continuation <= START_MS) break
    end = continuation
  }
  //  A date one page gave a number for is not a hole, even if an overlapping page left it blank.
  return withHoles([...seen.entries()].sort((a, b) => a[0] - b[0]), [...holes].filter((t) => !seen.has(t)))
}
