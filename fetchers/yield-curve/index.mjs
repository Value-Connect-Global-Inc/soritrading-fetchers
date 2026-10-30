// 10-year minus 2-year Treasury spread (percentage points) — the yield curve in one number.
//
//  ★ Below zero = inverted, historically a recession lead indicator. It moves on a scale of
//    months, so it is a REGIME filter, not a trade signal: use it to decide which strategy
//    should be running, not when to enter.
//  ★ The value can be NEGATIVE. If a strategy assumes ctx.data() is positive, this series
//    is where that assumption breaks.

import { fredRows, fredUrl, fetchText } from '../../lib/sources.mjs'

export const meta = {
  key: 'yield-curve',
  table: 'macro_yield_curve',
  title: 'US 10y-2y Treasury spread',
  describe: 'US 10y minus 2y Treasury spread, percentage points, business days (FRED T10Y2Y), can be negative. Stored by observation date with no release lag, so a backtest can see the future; in strategies use SoriTrading base collection ctx.data("base_t10y2y") (same series, release lag applied).',
  //  ★ Same FRED series the agent's base collection already holds (with avail_ts = obs + release lag).
  //    `list` shows this; the fetcher is kept so existing crontabs do not break.
  overlaps: 'base_t10y2y',
  source: 'FRED (T10Y2Y)',
  url: fredUrl('T10Y2Y'),
  cron: '25 7 * * *',
  license: 'FRED (St. Louis Fed), US Treasury data. Free to reuse; confirm per-series terms.',
}

export async function fetchRows(fetchImpl = fetch) {
  //  ★ fredRows attaches the dates FRED lists without a value; the runner deletes stored rows on
  //    those dates (old-parser zeros). See repairTs in lib/sources.mjs.
  return fredRows(await fetchText(fetchImpl, meta.url))
}
