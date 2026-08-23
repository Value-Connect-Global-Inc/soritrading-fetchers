// 미국 실효 연방기금금리(DFF, 일별) — 거시 국면 필터의 대표값.
//
//  ★★ 소리트레이딩은 비슷한 축을 **이미 ctx.macro 로** 준다. 같은 값을 두 경로로 넣으면
//    결과만 보고 어느 쪽을 썼는지 못 가른다(§0.5 — 경로가 둘이면 값도 둘이 된다).
//    그래서 이 페처는 **연동 연습용**이다. 실전 전략에서는 ctx.macro 를 쓰는 편이 낫다.

export const meta = {
  key: 'fed-funds',
  table: 'macro_fed_funds',
  title: '미국 기준금리 (연습용)',
  source: 'FRED (DFF)',
  url: 'https://fred.stlouisfed.org/graph/fredgraph.csv?id=DFF',
  //  FRED 는 미 동부 업무시간에 갱신된다 — 한국 새벽에 받는다.
  cron: '10 7 * * *',
  license: '세인트루이스 연준 FRED. 대부분 시리즈가 재배포 자유이나 시리즈별 조건 확인 권장.',
}

export async function fetchRows(fetchImpl = fetch) {
  const r = await fetchImpl(meta.url)
  const csv = await r.text()
  return csv.trim().split('\n').slice(1).map((line) => {
    const [d, v] = line.split(',')
    //  ★ 날짜만 오는 CSV — UTC 자정으로 고정한다. 로컬 시간대로 파싱하면 서버마다
    //    하루가 밀린다(빗썸 to= 사고와 같은 계열: 시간대를 안 정하면 누가 대신 정한다).
    return [Math.floor(new Date(d + 'T00:00:00Z').getTime() / 1000), Number(v)]
  })
}
