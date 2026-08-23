// 비트코인 해시레이트 (TH/s) — 체인 자체의 지표라 가격과 다른 축이다.
//  ★ 값이 크고 추세가 완만하다: 원값 임계보다 **이동평균 대비 비율**로 쓰는 편이 낫다
//    (전략에서 ctx.data 로 읽은 뒤 직접 계산하면 된다).

export const meta = {
  key: 'btc-hashrate',
  table: 'btc_hashrate',
  title: 'BTC 해시레이트',
  source: 'blockchain.com',
  url: 'https://api.blockchain.info/charts/hash-rate?timespan=all&format=json',
  cron: '35 1 * * *',
  license: '무료 공개 차트 API(blockchain.com). 상업적 재배포 전 원문 확인 권장.',
}

export async function fetchRows(fetchImpl = fetch) {
  const r = await fetchImpl(meta.url)
  const j = await r.json()
  //  values: [{ x: 초 단위 epoch, y: 값 }]
  return (j.values || []).map((p) => [Number(p.x), Number(p.y)])
}
