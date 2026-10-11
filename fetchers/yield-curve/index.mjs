// 10-year minus 2-year Treasury spread (percentage points) — the yield curve in one number.
//
//  ★ Below zero = inverted, historically a recession lead indicator. It moves on a scale of
//    months, so it is a REGIME filter, not a trade signal: use it to decide which strategy
//    should be running, not when to enter.
//  ★ The value can be NEGATIVE. If a strategy assumes ctx.data() is positive, this series
//    is where that assumption breaks.

import { parseFredCsv, fredUrl, fetchText } from '../../lib/sources.mjs'

export const meta = {
  key: 'yield-curve',
  table: 'macro_yield_curve',
  title: 'US 10y-2y Treasury spread',
  describe: 'US 10-year minus 2-year Treasury spread, percentage points, daily, business days only (FRED T10Y2Y). Can be negative (inverted curve).',
  source: 'FRED (T10Y2Y)',
  url: fredUrl('T10Y2Y'),
  cron: '25 7 * * *',
  license: 'FRED (St. Louis Fed), US Treasury data. Free to reuse; confirm per-series terms.',
}

export async function fetchRows(fetchImpl = fetch) {
  return parseFredCsv(await fetchText(fetchImpl, meta.url))
}
