// Total value locked across all DeFi chains (USD, daily) — on-chain risk appetite.
//
//  ★ TVL is denominated in USD and measured on assets whose price moves, so it goes UP when
//    prices go up even if no new capital arrived. It is closer to a co-moving confirmation
//    than to an independent signal — a strategy that trades on TVL alone is usually trading
//    on price with extra steps. Compare it against price before believing it adds anything.
//  ★ Liquid staking and double-counted TVL are excluded by this endpoint (DefiLlama's v2
//    definition). A different endpoint gives a different number for the same day.

import { parseLlamaSeries, fetchJson } from '../../lib/sources.mjs'

export const meta = {
  key: 'defi-tvl',
  table: 'defi_tvl',
  title: 'DeFi TVL, all chains',
  source: 'DefiLlama',
  url: 'https://api.llama.fi/v2/historicalChainTvl',
  cron: '15 2 * * *',
  license: 'DefiLlama free API (no key). Open data; attribution appreciated.',
}

export async function fetchRows(fetchImpl = fetch) {
  return parseLlamaSeries(await fetchJson(fetchImpl, meta.url), 'tvl')
}
