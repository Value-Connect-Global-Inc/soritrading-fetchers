// US effective federal funds rate (DFF, daily) — the classic macro regime filter.
//
//  ★★ SoriTrading's base collection (the agent's own FRED pull) already carries DFF as
//    `base_fedfunds`, timestamped by when it was PUBLISHED (avail_ts). This table is keyed by the
//    observation date, so a backtest reading it sees each value a day or two early. Use
//    ctx.data('base_fedfunds') in strategies; this fetcher stays for crontabs that already call it.

import { fredRows, fredUrl, fetchText } from '../../lib/sources.mjs'

export const meta = {
  key: 'fed-funds',
  table: 'macro_fed_funds',
  title: 'US federal funds rate',
  describe: 'US effective federal funds rate, percent, daily (FRED DFF). Stored by observation date with no release lag, so a backtest can see the future; in strategies use SoriTrading base collection ctx.data("base_fedfunds") (same series, release lag applied).',
  //  ★ Same FRED series the agent's base collection already holds (with avail_ts = obs + release lag).
  //    `list` shows this; the fetcher is kept so existing crontabs do not break.
  overlaps: 'base_fedfunds',
  source: 'FRED (DFF)',
  url: fredUrl('DFF'),
  //  FRED updates during US business hours — fetch in the early Asian morning.
  cron: '10 7 * * *',
  license: 'FRED (St. Louis Fed). Most series are free to reuse; confirm per-series terms.',
}

export async function fetchRows(fetchImpl = fetch) {
  //  ★ The CSV parser is shared with the other FRED series (lib/sources.mjs): date-only rows
  //    are pinned to UTC midnight, '.' / empty rows are dropped (and listed as holes so the
  //    runner can delete old-parser zeros on those dates). Keeping a private copy here is how
  //    one of them ends up fixed and the other not.
  return fredRows(await fetchText(fetchImpl, meta.url))
}
