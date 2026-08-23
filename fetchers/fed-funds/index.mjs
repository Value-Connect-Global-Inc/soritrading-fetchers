// US effective federal funds rate (DFF, daily) — the classic macro regime filter.
//
//  ★★ SoriTrading already exposes a similar axis through `ctx.macro`. Feeding the same value
//    through two paths leaves a result unable to say which one it used, so treat this fetcher
//    as practice for the integration; prefer ctx.macro in real strategies.

export const meta = {
  key: 'fed-funds',
  table: 'macro_fed_funds',
  title: 'US federal funds rate (practice)',
  source: 'FRED (DFF)',
  url: 'https://fred.stlouisfed.org/graph/fredgraph.csv?id=DFF',
  //  FRED updates during US business hours — fetch in the early Asian morning.
  cron: '10 7 * * *',
  license: 'FRED (St. Louis Fed). Most series are free to reuse; confirm per-series terms.',
}

export async function fetchRows(fetchImpl = fetch) {
  const r = await fetchImpl(meta.url)
  const csv = await r.text()
  return csv.trim().split('\n').slice(1).map((line) => {
    const [d, v] = line.split(',')
    //  ★ The CSV carries dates without a time — pin them to UTC midnight. Parsing in local
    //    time shifts the whole series by a day depending on where the server runs.
    return [Math.floor(new Date(d + 'T00:00:00Z').getTime() / 1000), Number(v)]
  })
}
