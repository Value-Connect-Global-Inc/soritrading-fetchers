// Broad trade-weighted US dollar index (daily) — dollar strength against a basket.
//
//  ★ Why it belongs next to crypto: a rising dollar tightens global liquidity, and risk
//    assets priced in dollars tend to feel it. Whether that holds in YOUR window is exactly
//    the kind of thing to test rather than assume.
//  ★ This is the Fed's broad index (Jan 2006 = 100), NOT the ICE "DXY" futures index.
//    They correlate but are not the same series — do not label a chart "DXY" from this.

import { fredRows, fredUrl, fetchText } from '../../lib/sources.mjs'

export const meta = {
  key: 'dollar-index',
  table: 'macro_dollar_index',
  title: 'US dollar index, broad (Fed)',
  describe: 'Fed broad trade-weighted USD index (FRED DTWEXBGS), Jan 2006 = 100, business days, NOT ICE DXY. Stored by observation date with no release lag, so a backtest can see the future; in strategies use SoriTrading base collection ctx.data("base_usd_broad") (same series, release lag applied).',
  //  ★ Same FRED series the agent's base collection already holds (with avail_ts = obs + release lag).
  //    `list` shows this; the fetcher is kept so existing crontabs do not break.
  overlaps: 'base_usd_broad',
  source: 'FRED (DTWEXBGS)',
  url: fredUrl('DTWEXBGS'),
  cron: '35 7 * * *',
  license: 'FRED (St. Louis Fed), Federal Reserve H.10 release. Free to reuse.',
}

export async function fetchRows(fetchImpl = fetch) {
  //  ★ fredRows attaches the dates FRED lists without a value; the runner deletes stored rows on
  //    those dates (old-parser zeros). See repairTs in lib/sources.mjs.
  return fredRows(await fetchText(fetchImpl, meta.url))
}
