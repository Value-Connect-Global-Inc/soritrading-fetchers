// CBOE Volatility Index (VIX, daily close) — how much movement the equity options market
// is pricing in for the next 30 days. The classic "risk on / risk off" switch.
//
//  ★ Crypto has no VIX of its own that goes back far; this one starts in 1990, so it is the
//    longest-running fear axis you can put next to a backtest. For crypto-native implied
//    volatility use the `btc-dvol` fetcher instead — they disagree often, and that is the point.
//  ★ Equities close on US holidays. The series has HOLES, not zeros (see parseFredCsv).
//    Read it as-of in a strategy; do not assume one row per calendar day.

import { parseFredCsv, fredUrl, fetchText } from '../../lib/sources.mjs'

export const meta = {
  key: 'vix',
  table: 'macro_vix',
  title: 'CBOE Volatility Index (VIX)',
  describe: 'CBOE Volatility Index (FRED VIXCLS): equity 30-day implied volatility, index points, daily close, trading days only, since 1990.',
  source: 'FRED (VIXCLS)',
  url: fredUrl('VIXCLS'),
  //  FRED publishes after the US close — early Asian morning is safely after it.
  cron: '15 7 * * *',
  license: 'FRED (St. Louis Fed) redistribution of CBOE data; confirm CBOE terms before commercial use.',
}

export async function fetchRows(fetchImpl = fetch) {
  return parseFredCsv(await fetchText(fetchImpl, meta.url))
}
