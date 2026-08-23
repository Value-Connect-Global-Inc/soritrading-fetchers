// 공포탐욕 지수 (Crypto Fear & Greed Index) — 0(극단적 공포) ~ 100(극단적 탐욕), 일 1회.
//  2018-02 부터 전 기간을 한 번에 준다(limit=0). 가격만으로는 안 보이는 심리 축이라
//  첫 연동 테스트로 가장 좋다.

export const meta = {
  key: 'fear-greed',
  table: 'fear_greed',
  title: '공포탐욕 지수',
  source: 'alternative.me',
  url: 'https://api.alternative.me/fng/?limit=0',
  //  원본은 UTC 자정 갱신 — 조금 지나서 받는다(정각에 몰리면 남의 서버도 우리도 손해).
  cron: '20 0 * * *',
  license: '무료 공개 API. 출처 표기 요청(alternative.me).',
}

export async function fetchRows(fetchImpl = fetch) {
  const r = await fetchImpl(meta.url)
  const j = await r.json()
  //  timestamp 는 문자열 초 단위 epoch — Number 로 바꿔 계약(초)을 맞춘다.
  return (j.data || []).map((d) => [Number(d.timestamp), Number(d.value)])
}
