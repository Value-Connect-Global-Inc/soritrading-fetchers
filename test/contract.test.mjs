// Fetcher contract tests — a contributed folder that breaks the rules fails here first.
//
//  ★ No network: fetchRows takes an injected fetch, so this checks parsing only.
//    (Real data is verified by a human running `node run.mjs <name>`. A test that depends on
//     someone else's server turns their bad day into our red CI.)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadAll, listKeys, loadFetcher } from '../lib/registry.mjs'
import { assertTable } from '../lib/db.mjs'
import { mergeCrontab, cronLines, BEGIN, END } from '../lib/cron.mjs'

const CRON_RE = /^(\S+\s+){4}\S+$/   // five fields

test('every fetcher satisfies the meta contract (the directory is the list)', async () => {
  const all = await loadAll()
  assert.ok(all.length >= 11, 'fetchers are missing — fetchers/ was not read')
  for (const { key, meta } of all) {
    assert.equal(meta.key, key, `${key}: meta.key mismatch`)
    assertTable(meta.table)                                     // identifier whitelist
    assert.ok(meta.title && meta.source, `${key}: title and source are required`)
    assert.ok(/^https:\/\//.test(meta.url), `${key}: url must be https`)
    assert.match(meta.cron, CRON_RE, `${key}: cron must have five fields`)
    //  ★ An empty license makes "not checked" indistinguishable from "no restrictions",
    //    so a sentence is mandatory.
    assert.ok(meta.license && meta.license.length > 5, `${key}: a one-line license note is required`)
  }
})

test('table names do not collide — two fetchers sharing a table silently interleave', async () => {
  const all = await loadAll()
  const tables = all.map((a) => a.meta.table)
  assert.equal(new Set(tables).size, tables.length, 'duplicate tables: ' + tables.join(', '))
})

/** Minimal stand-in for fetch. */
const fake = (body, text = false) => async () => (text
  ? { text: async () => body }
  : { json: async () => body })

test('parsed rows are [epoch SECONDS, number] — the unit is never left to be guessed', async () => {
  const cases = {
    'fear-greed': [fake({ data: [{ timestamp: '1700000000', value: '42' }] }), [[1700000000, 42]]],
    'btc-hashrate': [fake({ values: [{ x: 1700000000, y: 5.5e8 }] }), [[1700000000, 5.5e8]]],
    'btc-active-addresses': [fake({ values: [{ x: 1700000000, y: 900000 }] }), [[1700000000, 900000]]],
    //  ★ Date-only CSV must land on UTC midnight (local parsing shifts by a day depending on
    //    the host). 2023-11-15T00:00:00Z = 1700006400 — written out, not derived from the code
    //    under test, so a change in behaviour fails this line.
    'fed-funds': [fake('DATE,DFF\n2023-11-15,5.33\n', true), [[1700006400, 5.33]]],
    'btc-miner-revenue': [fake({ values: [{ x: 1700000000, y: 4.2e7 }] }), [[1700000000, 4.2e7]]],
    //  ★ FRED writes '.' on days a market was closed. The row is DROPPED, not stored as NaN
    //    or 0 — "no observation" and "the index printed zero" are different facts, and a
    //    strategy that cannot tell them apart will trade on the wrong one.
    vix: [fake('DATE,VIXCLS\n2023-11-15,14.16\n2023-11-23,.\n', true), [[1700006400, 14.16]]],
    //  ★ The spread goes NEGATIVE when the curve inverts — a parser that filtered
    //    "invalid" values by sign would erase exactly the regime this series exists for.
    'yield-curve': [fake('DATE,T10Y2Y\n2023-11-15,-0.45\n', true), [[1700006400, -0.45]]],
    'dollar-index': [fake('DATE,DTWEXBGS\n2023-11-15,119.85\n', true), [[1700006400, 119.85]]],
    //  ★ DefiLlama sends `date` as a STRING of epoch seconds, and totalCirculating as an
    //    object of pegged buckets. ★★ The buckets are NOT summed: peggedEUR is denominated in
    //    euros, so adding it to dollars produces a number with no unit. USD peg only.
    'stablecoin-mcap': [fake([{ date: '1700000000', totalCirculating: { peggedUSD: 120e9, peggedEUR: 1e9 } }]),
      [[1700000000, 120e9]]],
    'defi-tvl': [fake([{ date: 1700000000, tvl: 45e9 }]), [[1700000000, 45e9]]],
    //  ★ DVOL candles are [tsMs, o, h, l, c] — we keep the CLOSE and convert ms → seconds.
    //    `continuation: null` ends the walk; without that the loop would page forever.
    'btc-dvol': [fake({ result: { data: [[1700000000000, 50, 56, 49, 55.5]], continuation: null } }),
      [[1700000000, 55.5]]],
  }
  const all = await loadAll()
  for (const { key, fetchRows } of all) {
    const c = cases[key]
    assert.ok(c, `${key}: no case here — a new fetcher needs one added to this test`)
    assert.deepEqual(await fetchRows(c[0]), c[1], key)
  }
})

test('crontab merge is idempotent and leaves other entries alone', async () => {
  const items = (await loadAll()).map(({ key, meta }) => ({ key, meta }))
  const lines = cronLines(items, { dir: '/home/u/f', node: '/usr/bin/node' })
  assert.equal(lines.length, items.length)
  assert.match(lines[0], /cd \/home\/u\/f && \/usr\/bin\/node run\.mjs \S+ >> /)

  const mine = '0 5 * * * /usr/bin/backup.sh\n'
  const once = mergeCrontab(mine, lines)
  const twice = mergeCrontab(once, lines)
  assert.equal(once, twice, 'installing twice would leave two blocks')
  assert.ok(twice.includes('/usr/bin/backup.sh'), "the user's own entry was dropped")
  assert.equal(twice.split(BEGIN).length - 1, 1)
  assert.equal(twice.split(END).length - 1, 1)
})

test('table identifiers are whitelisted even though a fetcher supplied them', () => {
  for (const bad of ['DROP', 'a; drop table x', '1abc', 'a'.repeat(70), '']) {
    assert.throws(() => assertTable(bad), /invalid identifier/, String(bad))
  }
  assert.equal(assertTable('fear_greed'), 'fear_greed')
})

test('folder names stay [a-z0-9-] — the runner uses them as a path', async () => {
  for (const k of await listKeys()) assert.match(k, /^[a-z0-9-]{1,40}$/, k)
})

// ── Failure messages (real failure 2026-08-24) ────────────────────────────────
//
//  ★ `stablecoin-mcap` failed with "Unexpected end of JSON input". That sentence names the
//    symptom and hides every fact needed to fix it: which URL, what status, what came back.
//    The cause was an EMPTY 200 from the wrong host — the fetcher had the fact and threw it
//    away. These tests lock the facts into the message.
import { fetchJson, fetchText } from '../lib/sources.mjs'

const res = (body, status = 200) => async () => ({ status, text: async () => body })

test('an empty body says "empty", not "Unexpected end of JSON input"', async () => {
  await assert.rejects(() => fetchJson(res(''), 'https://x.test/a'),
    (e) => { assert.match(e.message, /empty body from https:\/\/x\.test\/a/); return true })
  await assert.rejects(() => fetchText(res('   '), 'https://x.test/b'), /empty body/)
})

test('an HTML error page names the URL and shows the first bytes', async () => {
  await assert.rejects(() => fetchJson(res('<!DOCTYPE html><title>404</title>'), 'https://x.test/c'),
    (e) => {
      assert.match(e.message, /not JSON from https:\/\/x\.test\/c/)
      assert.match(e.message, /DOCTYPE/, 'the body is hidden — that is the whole failure being repeated')
      return true
    })
})

test('a non-2xx status fails before parsing — a 500 page is not "no data"', async () => {
  await assert.rejects(() => fetchJson(res('{}', 503), 'https://x.test/d'), /HTTP 503 from https:\/\/x\.test\/d/)
})

test('★ blockchain.com charts ask for sampled=false — the default silently returns ~1.5k points', async () => {
  //  실측 2026-08-24: 17년치가 1,608행(약 4일 간격)으로 왔고 응답 어디에도 그 사실이 없었다.
  for (const k of ['btc-hashrate', 'btc-active-addresses', 'btc-miner-revenue']) {
    const { meta } = await loadFetcher(k)
    assert.match(meta.url, /sampled=false/, k + ': the source will downsample and not say so')
  }
})

test('★ stablecoin-mcap points at the stablecoins host — api.llama.fi answers it EMPTY', async () => {
  const { meta } = await loadFetcher('stablecoin-mcap')
  assert.match(meta.url, /^https:\/\/stablecoins\.llama\.fi\//,
    'measured 2026-08-24: the documented api.llama.fi base returns an empty 200 for this path')
})

// ── 수집 시각 (2026-09-07) ───────────────────────────────────────────────────
//
//  실사고: `ctx.data` 비콘이 "값이 4.7일 됐다"고 말했는데, 그 뒤엔 셋이 섞여 있었다 —
//  ① 소스가 안 줬다(정상) ② cron 이 죽었다 ③ 돌았는데 실패했다.
//  가르려면 cron 로그와 max(ts) 를 **손으로** 대조해야 했다. 유저는 그걸 못 하고,
//  이 값은 거래에 쓰인다(§0.5 "0 은 세 가지 뜻이다").
import { createSql, alterSql, upsertSql } from '../lib/db.mjs'

test('★★★ 충돌 때 ingested_at 을 건드리지 않는다 — 옛 행이 "오늘 처음 봤다"고 말하면 안 된다', () => {
  const sql = upsertSql('t', '($1,$2,now(),now())')
  //  ★ 손잡이: 이 문장이 실제로 upsert 인지 먼저 본다(빈 문자열이면 아래가 다 통과한다)
  assert.match(sql, /ON CONFLICT \(ts\) DO UPDATE/)

  const set = sql.split('DO UPDATE SET')[1]
  assert.match(set, /checked_at = EXCLUDED\.checked_at/, 'checked_at 은 매번 갱신해야 한다')
  assert.equal(/ingested_at/.test(set), false,
    '★★★ 충돌 절에 ingested_at 이 있다 — 과거 행의 최초 관측 시각을 오늘로 덮어쓴다: ' + set)
})

test('★★ 두 시각은 **다른 질문**이다 — 한 컬럼으로 접지 않는다 (§0.5 ⑤)', () => {
  const c = createSql('t')
  assert.match(c, /ingested_at timestamptz/, 'PIT — 그때 알 수 있었던 값')
  assert.match(c, /checked_at timestamptz/, '수집 생존 — 마지막으로 확인한 시각')
})

test('★★ 이미 있던 표에도 컬럼을 붙인다 — CREATE IF NOT EXISTS 는 기존 표를 안 고친다', () => {
  const alters = alterSql('t')
  //  ★ 이게 없으면 **새 표에만** 시각이 생기고, 정작 오래 돌던 표엔 영영 안 생긴다.
  assert.equal(alters.length, 2)
  for (const q of alters) assert.match(q, /ADD COLUMN IF NOT EXISTS/)
  //  ★★★ DEFAULT 를 주면 과거 행이 전부 "지금" 수집된 것으로 채워진다 — 그게 위조다.
  for (const q of alters) {
    assert.equal(/DEFAULT/i.test(q), false, '★ DEFAULT 는 과거 행의 시각을 지어낸다: ' + q)
  }
})

test('★ 시각은 DB 시계(now())로 찍는다 — 수집기 호스트 시계가 틀어져도 표는 일관된다', () => {
  //  ★ 파라미터로 넘기면 호스트 시계를 믿는 것이고, 그건 시간대 사고의 단골 자리다.
  assert.match(upsertSql('t', '($1,$2,now(),now())'), /VALUES \(\$1,\$2,now\(\),now\(\)\)/)
})

// ══ 깨우기(NOTIFY) — 듣는 쪽과 **같은 이름**에 보내는가 (#228) ═══════════════════
//
//  ★★★ 이 채널 이름은 **다른 리포(coinsori-trading/agent/lib/datachannel.js)** 가 LISTEN 한다.
//    두 쪽이 서로를 모른 채 각자 규칙을 고르면 **에러 없이 조용히 안 만난다** —
//    kis.js 의 ymd/kstEpoch 가 정확히 그랬다. 그래서 기대값을 **문자열로 직접 적는다**
//    (구현 함수로 기대값을 만들면 무엇을 비교하든 통과한다).

test('★★★ 채널 이름 — 듣는 쪽과 같은 문자열이어야 한다', async () => {
  const { channelFor, CHANNEL_PREFIX } = await import('../lib/notify.mjs')
  assert.equal(CHANNEL_PREFIX, 'sori1_')
  assert.equal(channelFor('fear_greed'), 'sori1_fear_greed')
  assert.equal(channelFor('public.fear_greed'), 'sori1_fear_greed',
    '★ 스키마는 뗀다 — 우리는 표 이름만 알고, 유저 선언은 public. 이 붙어 있을 수 있다')
  assert.equal(channelFor('PUBLIC.Fear_Greed'), 'sori1_fear_greed')
})

test('★★ 규칙에 안 맞으면 null — 채널을 지어내지 않는다', async () => {
  const { channelFor } = await import('../lib/notify.mjs')
  for (const v of ['a.b.c', 'x; DROP TABLE y', 'a b', '1table', '', null, undefined, 42])
    assert.equal(channelFor(v), null, JSON.stringify(v))
})

test('★★★ NOTIFY 문 — 채널은 식별자(인용), 페이로드는 **바인드**한다', async () => {
  const { notifySql, notifyPayload } = await import('../lib/notify.mjs')
  assert.equal(notifySql('sori1_fear_greed'), 'NOTIFY "sori1_fear_greed", $1')
  //  ★ 페이로드를 문자열로 이어붙이면 그게 주입 자리다. $1 이 아니면 실패해야 한다.
  assert.match(notifySql('x'), /\$1$/)
  assert.equal(notifyPayload({ last: 1700000000, n: 3 }), '{"v":1,"last":1700000000,"n":3}')
  assert.equal(notifyPayload(), '{"v":1,"last":null,"n":0}')
})

test('★★ 우리가 실제로 쓰는 표들이 전부 채널을 만들 수 있다', async () => {
  const { channelFor } = await import('../lib/notify.mjs')
  const all = await loadAll()
  for (const { key, meta } of all) {
    assert.ok(channelFor(meta.table), `${key}: 표 '${meta.table}' 로 채널을 못 만든다 — `
      + '이 페처의 데이터는 실시간 깨우기를 못 쓴다(값은 정상, 지연만 김)')
  }
})

test('★★★ 값은 페이로드로 다니지 않는다 — 경로가 둘이면 숫자가 갈린다(§0.5 ④)', async () => {
  const { notifyPayload } = await import('../lib/notify.mjs')
  //  ★ 실제 값(v 컬럼)을 실을 자리가 **없어야** 한다. 있으면 듣는 쪽이 언젠가 그걸 쓴다.
  const p = JSON.parse(notifyPayload({ last: 1, n: 1, value: 73, v: 73 }))
  assert.deepEqual(Object.keys(p).sort(), ['last', 'n', 'v'])
  assert.equal(p.v, 1, "★ 'v' 는 페이로드 **버전**이지 값이 아니다 — 값을 실을 수 있게 두지 않는다")
  assert.equal(p.value, undefined)
})
