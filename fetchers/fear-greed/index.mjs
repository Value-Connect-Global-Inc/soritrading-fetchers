// Crypto Fear & Greed Index — 0 (extreme fear) to 100 (extreme greed), once per day.
//  `limit=0` returns the full history (since Feb 2018) in one response. It is a sentiment
//  axis that price alone cannot show, which makes it the best first integration test.

export const meta = {
  key: 'fear-greed',
  table: 'fear_greed',
  title: 'Crypto Fear & Greed Index',
  source: 'alternative.me',
  url: 'https://api.alternative.me/fng/?limit=0',
  //  The source updates at UTC midnight — fetch a little after, not on the dot.
  cron: '20 0 * * *',
  license: 'Free public API; attribution requested (alternative.me).',
}

export async function fetchRows(fetchImpl = fetch) {
  const r = await fetchImpl(meta.url)
  const j = await r.json()
  //  `timestamp` is epoch seconds as a string — cast it so the contract (seconds) holds.
  return (j.data || []).map((d) => [Number(d.timestamp), Number(d.value)])
}
