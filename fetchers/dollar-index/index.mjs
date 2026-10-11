// Broad trade-weighted US dollar index (daily) — dollar strength against a basket.
//
//  ★ Why it belongs next to crypto: a rising dollar tightens global liquidity, and risk
//    assets priced in dollars tend to feel it. Whether that holds in YOUR window is exactly
//    the kind of thing to test rather than assume.
//  ★ This is the Fed's broad index (Jan 2006 = 100), NOT the ICE "DXY" futures index.
//    They correlate but are not the same series — do not label a chart "DXY" from this.

import { parseFredCsv, fredUrl, fetchText } from '../../lib/sources.mjs'

export const meta = {
  key: 'dollar-index',
  table: 'macro_dollar_index',
  title: 'US dollar index, broad (Fed)',
  describe: 'Fed broad trade-weighted US dollar index (FRED DTWEXBGS), Jan 2006 = 100, daily, business days only. NOT the ICE DXY.',
  source: 'FRED (DTWEXBGS)',
  url: fredUrl('DTWEXBGS'),
  cron: '35 7 * * *',
  license: 'FRED (St. Louis Fed), Federal Reserve H.10 release. Free to reuse.',
}

export async function fetchRows(fetchImpl = fetch) {
  return parseFredCsv(await fetchText(fetchImpl, meta.url))
}
