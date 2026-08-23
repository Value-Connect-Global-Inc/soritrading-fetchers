// 비트코인 일별 활성 주소 수 — 온체인 사용량 축.
//  해시레이트가 '채굴자'라면 이쪽은 '사용자'다. 두 축은 갈릴 때가 있어 따로 넣는다
//  (한 테이블에 여러 지표를 섞지 않는다 — 한 테이블 = 한 시계열).

export const meta = {
  key: 'btc-active-addresses',
  table: 'btc_active_addresses',
  title: 'BTC 활성 주소 수',
  source: 'blockchain.com',
  url: 'https://api.blockchain.info/charts/n-unique-addresses?timespan=all&format=json',
  cron: '45 1 * * *',
  license: '무료 공개 차트 API(blockchain.com). 상업적 재배포 전 원문 확인 권장.',
}

export async function fetchRows(fetchImpl = fetch) {
  const r = await fetchImpl(meta.url)
  const j = await r.json()
  return (j.values || []).map((p) => [Number(p.x), Number(p.y)])
}
