// Wake-up channel, Redis flavour — "there is something new", nothing more. (#225)
//
//  ══ ★★★ 값은 절대 여기로 다니지 않는다 (notify.mjs 와 **같은 규칙**) ═══════════
//  PUBLISH 는 **깨우기**다. 값의 진실은 언제나 DB 조회다(SIGNALS §8-k 2).
//  그리고 pub/sub 는 **전달 보장이 없다** — 에이전트가 재시작 중이면 그 메시지는 사라진다.
//  ⇒ 페이로드에 값을 실으면 놓친 순간 값이 틀린다. 커서 힌트만 싣고, 듣는 쪽은 그걸로
//    값을 정하지 않는다(깨어나서 자기 쿼리를 다시 돌린다). 그래서 **Redis 를 껐다 켜도
//    데이터가 안 틀린다** — 그게 이 축을 켜고 끌 수 있게 만드는 조건이다.
//
//  ══ ★★ 왜 여기는 env 가 있고 NOTIFY 는 없나 ══════════════════════════════════
//  NOTIFY 는 **이미 열려 있는 그 연결**로 공짜로 나간다 — 그래서 "항상 보낸다"가 가능했다.
//  Redis 는 **다른 서버**라 주소를 모르면 아예 보낼 수가 없다. 없는 걸 있는 척할 수 없으니
//  env 로 받되, **안 보낸 이유를 결과에 담는다**(조용한 null 금지 — §0.5 "0 은 세 가지 뜻").
//
//  ══ ★★ 채널 규칙은 **에이전트 사본과 같아야 한다** ═══════════════════════════
//  soritrading-agent/agent/lib/datachannel.js 의 redisChannelFor 와 같은 문자열을 내야 한다.
//  갈리면 에러 없이 조용히 안 만난다(§0.5 ⑥ — kis.js ymd/kstEpoch 와 같은 자리).
//  ★★★ 그리고 **기관은 우리 코드를 안 쓴다** — 문서만 보고 자기 스크립트로 PUBLISH 한다.
//    그래서 계약(채널명·페이로드)이 SIGNALS §8-k 2 에 박혀 있고, 여기는 그 사본이다.

/** 채널 접두 — postgres 와 **다른 이름공간**이라 길어도 된다. 버전이 이름에 있다(아래 ★). */
export const REDIS_CHANNEL_PREFIX = 'sori:data:v1:'

/**
 * 표 이름 → Redis 채널 이름.
 *  ★ 표 규칙·스키마 제거는 notify.mjs 와 **같다**: 페처는 `fear_greed` 로만 아는데
 *    유저 선언은 `public.fear_greed` 일 수 있다. 양쪽 다 표 부분만 쓴다.
 *  ★ `v1` 이 이름에 있는 이유: 페이로드 모양을 바꿔야 하면 **채널을 바꾼다.** 같은 채널에서
 *    모양만 바꾸면 옛 구독자가 조용히 오해한다.
 * @returns {string|null} null = 표 이름이 규칙에 안 맞음(채널을 지어내지 않는다)
 */
export function redisChannelFor(table) {
  const s = String(table == null ? '' : table).toLowerCase().trim()
  if (!/^[a-z_][a-z0-9_]{0,62}(\.[a-z_][a-z0-9_]{0,62})?$/.test(s)) return null
  const bare = s.includes('.') ? s.slice(s.indexOf('.') + 1) : s
  return REDIS_CHANNEL_PREFIX + bare
}

/**
 * 페이로드 — **커서 힌트만**. 듣는 쪽은 이걸로 값을 정하지 않는다(위 ★★★).
 *  ★ notify.mjs 의 notifyPayload 와 같은 모양을 쓴다. 전송마다 다른 모양을 내면
 *    읽는 쪽이 전송을 알아야 하고, 그 순간 두 경로가 갈리기 시작한다.
 */
export function redisPayload({ last = null, n = 0 } = {}) {
  return JSON.stringify({ v: 1, last: last == null ? null : Number(last), n: Number(n) || 0 })
}

/**
 * 한 번 PUBLISH 하고 끊는다.
 *
 *  ★★ 연결을 들고 있지 않는 이유: 페처는 **cron 으로 잠깐 뜨는 프로세스**다. 상주 풀을
 *    만들면 쓰지도 않는 연결이 남고, 그 수명은 프로세스 수명과 다르다(§0.5 ⑦).
 *  ★ 실패해도 던지지 않는다 — 깨우기는 지연의 문제이지 값의 문제가 아니다. 대신
 *    **왜 안 됐는지**를 돌려준다. 조용히 넘기면 "안 켠 것"과 "못 켠 것"이 같아진다.
 *
 * @param {{url?:string|null, table:string, last?:number|null, n?:number}} o
 * @returns {Promise<{ok:boolean, channel?:string, skipped?:string, error?:string}>}
 */
export async function publishWake({ url = null, table, last = null, n = 0 } = {}) {
  //  ★ 3상태: 주소 없음(안 씀) / 모듈 없음(쓰려는데 못 씀) / 실패(썼는데 안 됨).
  //    셋을 같은 false 로 접으면 유저가 무엇을 고쳐야 하는지 모른다.
  if (!url) return { ok: false, skipped: 'no-url' }
  const ch = redisChannelFor(table)
  if (!ch) return { ok: false, skipped: 'bad-table', error: `table name does not fit the channel rule: ${table}` }
  let redis
  try { redis = await import('redis') }
  catch {
    return { ok: false, channel: ch, skipped: 'no-module',
      error: "the 'redis' package is not installed — run: npm install redis" }
  }
  const client = redis.createClient({ url })
  //  ★ createClient 는 'error' 리스너가 없으면 연결 오류를 **unhandled 로 던진다**
  //    (node-redis 는 EventEmitter 다). 여기서 수집 전체가 죽으면 깨우기가 값을 망치는 셈이다.
  client.on('error', () => { /* 아래 catch 가 사실을 담는다 */ })
  try {
    await client.connect()
    await client.publish(ch, redisPayload({ last, n }))
    return { ok: true, channel: ch }
  } catch (e) {
    return { ok: false, channel: ch, error: String((e && e.message) || e).slice(0, 200) }
  } finally {
    try { await client.quit() } catch { /* already closed */ }
  }
}
