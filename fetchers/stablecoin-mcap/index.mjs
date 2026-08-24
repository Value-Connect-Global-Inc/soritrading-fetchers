// Total stablecoin market cap (USD, daily) — the dry powder sitting inside crypto.
//
//  ★ Reads as a liquidity axis: money entering stablecoins has already left the banking
//    system for crypto but has not chosen an asset yet. Expansions and contractions of this
//    aggregate are slow, which makes it a regime input rather than a trade trigger.
//  ★ It is a SUM of issuers. A single issuer's redemption wave can move it without any
//    change in "how much money is in crypto" — check the shape before reading a story into it.

import { parseLlamaSeries, fetchJson } from '../../lib/sources.mjs'

export const meta = {
  key: 'stablecoin-mcap',
  table: 'stablecoin_mcap',
  title: 'Total stablecoin market cap',
  source: 'DefiLlama',
  //  ★★ NOT api.llama.fi. DefiLlama's own docs say "base URL for ALL free endpoints is
  //    api.llama.fi", and that host answers this path with an EMPTY 200 — the stablecoin
  //    endpoints live on their own host. Measured 2026-08-24 after the first run failed.
  //    (The doc sentence was true about most endpoints; it did not apply to this one.)
  url: 'https://stablecoins.llama.fi/stablecoincharts/all',
  cron: '5 2 * * *',
  license: 'DefiLlama free API (no key). Open data; attribution appreciated.',
}

export async function fetchRows(fetchImpl = fetch) {
  //  `totalCirculating` arrives as an object of pegged buckets ({ peggedUSD: n }) on this
  //  endpoint and as a plain number elsewhere — the shared parser accepts both.
  return parseLlamaSeries(await fetchJson(fetchImpl, meta.url), 'totalCirculating')
}
