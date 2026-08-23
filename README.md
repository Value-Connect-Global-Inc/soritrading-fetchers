# soritrading-fetchers

무료 공개 데이터를 **내 Postgres** 에 넣어두고, 소리트레이딩 전략에서 `ctx.data()` 로 읽기 위한
가벼운 수집기 모음. 디렉토리 하나가 페처 하나다.

- 데이터는 **내 DB 에만** 있다. 소리트레이딩 서버로 값이 가지 않는다(연결 문자열도 안 간다).
- 백테스트는 내 에이전트가 돌리면서 그때그때 DB 를 읽는다.
- 페처를 추가하는 건 **폴더 하나 + `index.mjs` 하나**다.

## 빠른 시작

```sh
git clone <이 리포> ~/soritrading-fetchers && cd ~/soritrading-fetchers
npm install                      # pg 하나뿐이다
cp .env.example .env             # DATABASE_URL 을 쓰기 계정으로 채운다
node run.mjs list                # 어떤 페처가 있나
node run.mjs fear-greed          # 한 번 수집
node run.mjs all                 # 전부 한 번씩
node run.mjs --install-cron      # 페처마다 선언한 주기로 crontab 등록
```

★ **쓰기 계정**(보통 `postgres`)으로 수집하고, 소리트레이딩에는 **읽기 전용 계정**을 준다.
읽기 전용 계정으로 수집하면 INSERT 가 거부되는 게 정상이다.

## 수집 후 — 전략에서 쓰기

수집이 끝나면 러너가 등록 값을 그대로 출력한다. AI 에게 이렇게 말하면 된다:

> "내 DB 의 `fear_greed` 테이블을 `fg` 로 등록해줘"

값을 직접 넣고 싶으면: `query: SELECT ts, v FROM fear_greed WHERE ts BETWEEN $1 AND $2`,
`tsCol: ts`, `valCol: v`, `dbAlias: main`.

## 페처 추가하기

`fetchers/<이름>/index.mjs` 하나를 만들고 아래를 내보낸다. 계약은 `test/contract.test.mjs`
가 검사하므로, 규격을 어기면 커밋 전에 빨개진다.

```js
export const meta = {
  key: 'my-source',                  // 폴더 이름과 같아야 한다
  table: 'my_table',                 // 만들 테이블(ts bigint PK, v numeric)
  title: '사람이 읽는 이름',
  source: 'example.com',             // 출처(사람이 확인할 수 있게)
  cron: '17 * * * *',                // 이 페처의 갱신 주기 — crontab 에 그대로 들어간다
  license: '출처의 이용 조건 한 줄',   // ★ 재배포 조건이 있는 데이터가 있다
}

/** @returns {Promise<[number, number][]>} [초 단위 epoch, 값] 배열 */
export async function fetchRows(fetchImpl = fetch) {
  const j = await (await fetchImpl('https://example.com/api')).json()
  return j.items.map((d) => [Number(d.t), Number(d.v)])
}
```

규칙 세 가지:

1. **시각은 초 단위 epoch** 로 정규화해서 돌려준다(ms·ISO 를 쓰는 원본이면 여기서 바꾼다).
   전략 쪽에서 단위를 유추하게 두면 조용히 틀린다.
2. **값은 숫자 하나**다. 여러 지표를 주는 원본이면 페처를 나눈다(한 테이블 = 한 시계열).
3. 원본이 이상하면 **적게 넣지 말고 실패**한다 — 러너가 행수 하한(50)으로 막는다.
   "절반만 들어간 테이블"은 백테스트를 조용히 틀리게 만든다.

## 지금 있는 페처

| 폴더 | 테이블 | 출처 | 주기 |
|---|---|---|---|
| `fear-greed` | `fear_greed` | alternative.me | 매일 |
| `btc-hashrate` | `btc_hashrate` | blockchain.com | 매일 |
| `btc-active-addresses` | `btc_active_addresses` | blockchain.com | 매일 |
| `fed-funds` | `macro_fed_funds` | FRED (DFF) | 매일 |

★ `fed-funds` 는 소리트레이딩의 `ctx.macro` 와 겹치는 축이다. 같은 값을 두 경로로 넣으면
결과에서 어느 쪽을 썼는지 갈리지 않으니, 연동 연습용으로만 쓰는 걸 권한다.

## 라이선스·이용 조건

이 리포의 코드는 MIT. **데이터는 각 출처의 조건을 따른다** — 각 페처의 `meta.license` 를
보고, 상업적 재배포 전에 원문을 확인할 것. 우리는 데이터를 재배포하지 않는다(내 DB 에 넣을 뿐).
