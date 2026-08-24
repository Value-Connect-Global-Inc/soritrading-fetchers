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

import { fetchJson } from '../../lib/sources.mjs'

const API = 'https://www.deribit.com/api/v2/public/get_volatility_index_data'
const START_MS = Date.parse('2021-01-01T00:00:00Z')   // before BTC DVOL history begins
const MAX_PAGES = 40

export const meta = {
  key: 'btc-dvol',
  table: 'btc_dvol',
  title: 'BTC implied volatility (Deribit DVOL)',
  source: 'Deribit',
  url: `${API}?currency=BTC&resolution=1D`,
  //  Deribit's daily candle closes at 00:00 UTC — fetch after it is sealed.
  cron: '25 0 * * *',
  license: 'Deribit public API (no key). Check Deribit terms before commercial redistribution.',
}

/** One page → [[tsSec, close], …] plus the continuation cursor (null when done). */
function parsePage(json) {
  const res = (json && json.result) || {}
  const rows = (Array.isArray(res.data) ? res.data : []).map((c) => {
    //  candle = [tsMs, open, high, low, close] — we store the CLOSE, like a daily bar.
    const ts = Math.floor(Number(c && c[0]) / 1000)
    const close = Number(c && c[4])
    return [ts, close]
  }).filter(([t, v]) => Number.isFinite(t) && Number.isFinite(v))
  const cont = Number(res.continuation)
  return { rows, continuation: Number.isFinite(cont) && cont > 0 ? cont : null }
}

export async function fetchRows(fetchImpl = fetch, now = Date.now()) {
  const seen = new Map()   // ts → value; pages can overlap at the boundary
  let end = now
  for (let page = 0; page < MAX_PAGES; page++) {
    const url = `${API}?currency=BTC&resolution=1D&start_timestamp=${START_MS}&end_timestamp=${end}`
    const { rows, continuation } = parsePage(await fetchJson(fetchImpl, url))
    for (const [t, v] of rows) seen.set(t, v)
    //  Stop when the source says there is no more, or when it stops moving backwards
    //  (a continuation that does not advance would spin forever).
    if (!continuation || continuation >= end || continuation <= START_MS) break
    end = continuation
  }
  return [...seen.entries()].sort((a, b) => a[0] - b[0])
}
