// Bitcoin hash rate (TH/s) — a chain-native metric, on a different axis from price.
//  ★ The values are large and slow-moving: a ratio to a moving average works better than a
//    threshold on the raw level. Compute that in the strategy after reading ctx.data().

import { parseChartValues, chartUrl, fetchJson } from '../../lib/sources.mjs'

export const meta = {
  key: 'btc-hashrate',
  table: 'btc_hashrate',
  title: 'BTC hash rate',
  describe: 'Bitcoin network hash rate, TH/s, daily, blockchain.com. Large slow-moving level: compare it to its own moving average, not a fixed threshold.',
  source: 'blockchain.com',
  url: chartUrl('hash-rate'),
  cron: '35 1 * * *',
  license: 'Free public charts API (blockchain.com); check the original terms before commercial redistribution.',
}

export async function fetchRows(fetchImpl = fetch) {
  //  values: [{ x: epoch seconds, y: value }] — parser shared with the other chart series.
  return parseChartValues(await fetchJson(fetchImpl, meta.url))
}
