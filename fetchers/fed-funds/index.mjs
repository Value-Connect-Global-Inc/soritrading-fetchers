// US effective federal funds rate (DFF, daily) — the classic macro regime filter.
//
//  ★★ SoriTrading already exposes a similar axis through `ctx.macro`. Feeding the same value
//    through two paths leaves a result unable to say which one it used, so treat this fetcher
//    as practice for the integration; prefer ctx.macro in real strategies.

import { parseFredCsv, fredUrl, fetchText } from '../../lib/sources.mjs'

export const meta = {
  key: 'fed-funds',
  table: 'macro_fed_funds',
  title: 'US federal funds rate (practice)',
  describe: 'US effective federal funds rate, percent, daily (FRED DFF). Practice series: ctx.macro carries the same axis.',
  source: 'FRED (DFF)',
  url: fredUrl('DFF'),
  //  FRED updates during US business hours — fetch in the early Asian morning.
  cron: '10 7 * * *',
  license: 'FRED (St. Louis Fed). Most series are free to reuse; confirm per-series terms.',
}

export async function fetchRows(fetchImpl = fetch) {
  //  ★ The CSV parser is shared with the other FRED series (lib/sources.mjs): date-only rows
  //    are pinned to UTC midnight, and '.' (not published) rows are dropped rather than
  //    stored as NaN. Keeping a private copy here is how one of them ends up fixed and the
  //    other not.
  return parseFredCsv(await fetchText(fetchImpl, meta.url))
}
