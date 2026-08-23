// Bitcoin daily unique active addresses — an on-chain usage axis.
//  If hash rate is "miners", this is "users". The two diverge often enough to be worth
//  keeping apart: one table is one series, never several metrics mixed together.

export const meta = {
  key: 'btc-active-addresses',
  table: 'btc_active_addresses',
  title: 'BTC active addresses',
  source: 'blockchain.com',
  url: 'https://api.blockchain.info/charts/n-unique-addresses?timespan=all&format=json',
  cron: '45 1 * * *',
  license: 'Free public charts API (blockchain.com); check the original terms before commercial redistribution.',
}

export async function fetchRows(fetchImpl = fetch) {
  const r = await fetchImpl(meta.url)
  const j = await r.json()
  return (j.values || []).map((p) => [Number(p.x), Number(p.y)])
}
