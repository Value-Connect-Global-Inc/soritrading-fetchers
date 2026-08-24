// Bitcoin daily unique active addresses — an on-chain usage axis.
//  If hash rate is "miners", this is "users". The two diverge often enough to be worth
//  keeping apart: one table is one series, never several metrics mixed together.

import { parseChartValues, chartUrl, fetchJson } from '../../lib/sources.mjs'

export const meta = {
  key: 'btc-active-addresses',
  table: 'btc_active_addresses',
  title: 'BTC active addresses',
  source: 'blockchain.com',
  url: chartUrl('n-unique-addresses'),
  cron: '45 1 * * *',
  license: 'Free public charts API (blockchain.com); check the original terms before commercial redistribution.',
}

export async function fetchRows(fetchImpl = fetch) {
  //  values: [{ x: epoch seconds, y: value }] — parser shared with the other chart series.
  return parseChartValues(await fetchJson(fetchImpl, meta.url))
}
