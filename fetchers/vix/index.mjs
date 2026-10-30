// CBOE Volatility Index (VIX, daily close) — how much movement the equity options market
// is pricing in for the next 30 days. The classic "risk on / risk off" switch.
//
//  ★ Crypto has no VIX of its own that goes back far; this one starts in 1990, so it is the
//    longest-running fear axis you can put next to a backtest. For crypto-native implied
//    volatility use the `btc-dvol` fetcher instead — they disagree often, and that is the point.
//  ★ Equities close on US holidays. The series has HOLES, not zeros (see parseFredCsv).
//    Read it as-of in a strategy; do not assume one row per calendar day.

import { fredRows, fredUrl, fetchText } from '../../lib/sources.mjs'

export const meta = {
  key: 'vix',
  table: 'macro_vix',
  title: 'CBOE Volatility Index (VIX)',
  describe: 'CBOE VIX (FRED VIXCLS), equity 30-day implied volatility, index points, daily close, trading days, since 1990. Stored by observation date with no release lag, so a backtest can see the future; in strategies use SoriTrading base collection ctx.data("base_vix") (same series, release lag applied).',
  //  ★ Same FRED series the agent's base collection already holds (with avail_ts = obs + release lag).
  //    `list` shows this; the fetcher is kept so existing crontabs do not break.
  overlaps: 'base_vix',
  source: 'FRED (VIXCLS)',
  url: fredUrl('VIXCLS'),
  //  FRED publishes after the US close — early Asian morning is safely after it.
  cron: '15 7 * * *',
  license: 'FRED (St. Louis Fed) redistribution of CBOE data; confirm CBOE terms before commercial use.',
}

export async function fetchRows(fetchImpl = fetch) {
  //  ★ fredRows attaches the dates FRED lists without a value; the runner deletes stored rows on
  //    those dates (old-parser zeros). See repairTs in lib/sources.mjs.
  return fredRows(await fetchText(fetchImpl, meta.url))
}
