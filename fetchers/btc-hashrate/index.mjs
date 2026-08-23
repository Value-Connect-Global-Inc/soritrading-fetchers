// Bitcoin hash rate (TH/s) — a chain-native metric, on a different axis from price.
//  ★ The values are large and slow-moving: a ratio to a moving average works better than a
//    threshold on the raw level. Compute that in the strategy after reading ctx.data().

export const meta = {
  key: 'btc-hashrate',
  table: 'btc_hashrate',
  title: 'BTC hash rate',
  source: 'blockchain.com',
  url: 'https://api.blockchain.info/charts/hash-rate?timespan=all&format=json',
  cron: '35 1 * * *',
  license: 'Free public charts API (blockchain.com); check the original terms before commercial redistribution.',
}

export async function fetchRows(fetchImpl = fetch) {
  const r = await fetchImpl(meta.url)
  const j = await r.json()
  //  values: [{ x: epoch seconds, y: value }]
  return (j.values || []).map((p) => [Number(p.x), Number(p.y)])
}
