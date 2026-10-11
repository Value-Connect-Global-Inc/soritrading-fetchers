// Bitcoin miner revenue (USD per day) — block subsidy plus fees paid to miners.
//
//  ★ Miner economics are a supply-side axis: when revenue falls hard, weaker miners sell
//    inventory and switch off, which shows up in hash rate a few weeks later. Pair it with
//    `btc-hashrate` rather than reading either alone.
//  ★ It is denominated in USD, so a large part of its movement is just the BTC price.
//    Dividing by price (or by hash rate) is usually what you actually mean.

import { parseChartValues, chartUrl, fetchJson } from '../../lib/sources.mjs'

export const meta = {
  key: 'btc-miner-revenue',
  table: 'btc_miner_revenue',
  title: 'BTC miner revenue (USD/day)',
  describe: 'Bitcoin miner revenue, USD per day (block subsidy + fees), daily, blockchain.com. USD-denominated, so much of its movement is BTC price.',
  source: 'blockchain.com',
  url: chartUrl('miners-revenue'),
  cron: '55 1 * * *',
  license: 'Free public charts API (blockchain.com); check the original terms before commercial redistribution.',
}

export async function fetchRows(fetchImpl = fetch) {
  return parseChartValues(await fetchJson(fetchImpl, meta.url))
}
