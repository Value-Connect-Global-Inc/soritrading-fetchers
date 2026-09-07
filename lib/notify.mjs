// Wake-up channel — "there is something new", nothing more.
//
//  ══ ★★★ 값은 절대 여기로 다니지 않는다 ═══════════════════════════════════════
//  NOTIFY 는 **깨우기**다. 값의 진실은 언제나 DB 조회다(SIGNALS §8-k).
//  페이로드에 값을 실으면 경로가 둘이 되고, 그러면 백테스트(조회)와 라이브(페이로드)가
//  다른 숫자를 낼 수 있다 — §0.5 ④ 그대로다. 그래서 페이로드는 **로그용 사실**만 담고,
//  듣는 쪽은 그걸 읽고 값을 정하지 않는다(깨어나서 자기 쿼리를 다시 돌린다).
//
//  ══ ★★ 왜 표 이름에서 유도하나 (key 가 아니라) ════════════════════════════════
//  SIGNALS §8-k 0-c 는 처음에 "채널명 = 데이터셋 key" 라고 적었다. **틀렸다** —
//  key 는 유저가 자기 전략에서 쓰는 이름(`ctx.data('fg')`)이라 **페처는 그걸 모른다.**
//  왕복의 양쪽이 아는 유일한 이름은 **표 이름**이다. 그래서 163 으로 그 축을 열었다.
//  (양쪽이 서로 모르는 채 각자 이름을 고르면 §0.5 ⑥ — 에러 없이 조용히 안 만난다.)
//
//  ══ ★★ 스키마는 뗀다 — 그리고 그건 **안전한 방향**이다 ═══════════════════════
//  postgres 의 채널 이름공간은 **데이터베이스 단위**라 스키마가 없다. 그리고 페처는
//  `public` 에 쓰면서 `fear_greed` 라고만 알고, 유저 선언은 `public.fear_greed` 일 수 있다.
//  ⇒ 양쪽 다 **표 부분만** 쓴다. 다른 스키마의 동명 표는 같은 채널을 공유하게 되는데,
//    그 방향은 **헛깨움**(듣는 쪽이 자기 쿼리를 한 번 더 돌린다)이라 값이 틀리지 않는다.
//    반대 방향(놓친 깨움)이 위험하다 — 조용한 침묵은 "미구현"과 화면상 똑같이 보인다.
//
//  ★ 길이: postgres 식별자는 63바이트에서 **조용히 잘린다**. 양쪽이 같은 문자열을 넣으니
//    잘려도 서로 만난다(아주 긴 표 이름 둘이 겹치면 위와 같은 헛깨움). 그래서 막지 않는다.

/** 채널 접두 — 남의 채널과 안 섞이게. 짧게 두는 게 63바이트 예산에 이롭다. */
export const CHANNEL_PREFIX = 'sori1_'

/**
 * 표 이름 → 깨우기 채널 이름.
 *  ★ **양쪽 리포가 같은 규칙을 써야 한다**(agent/lib/datachannel.js). 갈리면 조용히 안 만난다.
 * @param {string} table  'fear_greed' 또는 'public.fear_greed'
 * @returns {string|null} null = 표 이름이 규칙에 안 맞음(채널을 지어내지 않는다)
 */
export function channelFor(table) {
  const s = String(table == null ? '' : table).toLowerCase().trim()
  if (!/^[a-z_][a-z0-9_]{0,62}(\.[a-z_][a-z0-9_]{0,62})?$/.test(s)) return null
  const bare = s.includes('.') ? s.slice(s.indexOf('.') + 1) : s
  return CHANNEL_PREFIX + bare
}

/**
 * 깨우기 SQL 한 줄. 채널은 **식별자**라 바인드 파라미터가 될 수 없다 —
 * 그래서 `channelFor` 를 통과한 값만 여기 온다(화이트리스트가 경계다).
 * 페이로드는 바인드한다(값이 아니라 사실: 마지막 ts · 이번에 쓴 행 수).
 */
export function notifySql(channel) {
  return `NOTIFY "${channel}", $1`
}

/**
 * 페이로드 — **로그용 사실만**. 듣는 쪽은 이걸로 값을 정하지 않는다(위 ★★★).
 *  ★ 8000바이트 상한이 있지만 이건 수십 바이트다.
 */
export function notifyPayload({ last = null, n = 0 } = {}) {
  return JSON.stringify({ v: 1, last: last == null ? null : Number(last), n: Number(n) || 0 })
}
