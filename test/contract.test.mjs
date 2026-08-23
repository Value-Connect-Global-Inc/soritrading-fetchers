// 페처 계약 테스트 — 폴더를 추가한 사람이 규격을 어기면 **여기서 먼저 빨개진다**.
//
//  ★ 네트워크를 타지 않는다: fetchRows 에 가짜 fetch 를 주입해 파싱만 검사한다.
//    (실데이터 확인은 사람이 `node run.mjs <이름>` 으로 한다 — 테스트가 남의 서버에
//     의존하면 그 서버가 느린 날 우리 CI 가 빨개진다.)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadAll, listKeys } from '../lib/registry.mjs'
import { assertTable } from '../lib/db.mjs'
import { mergeCrontab, cronLines, BEGIN, END } from '../lib/cron.mjs'

const CRON_RE = /^(\S+\s+){4}\S+$/   // 5필드

test('★ 모든 페처가 meta 규격을 지킨다 (폴더 = 목록)', async () => {
  const all = await loadAll()
  assert.ok(all.length >= 4, '페처가 없다 — fetchers/ 를 읽지 못했다')
  for (const { key, meta } of all) {
    assert.equal(meta.key, key, `${key}: meta.key 불일치`)
    assertTable(meta.table)                                   // 식별자 화이트리스트
    assert.ok(meta.title && meta.source, `${key}: title·source 필수`)
    assert.ok(/^https:\/\//.test(meta.url), `${key}: url 은 https 여야 한다`)
    assert.match(meta.cron, CRON_RE, `${key}: cron 은 5필드여야 한다`)
    //  ★ 라이선스를 비워두면 "확인 안 함"과 "제한 없음"이 구별되지 않는다 — 문장을 강제한다.
    assert.ok(meta.license && meta.license.length > 5, `${key}: license 한 줄이 필요하다`)
  }
})

test('★ 테이블 이름이 겹치지 않는다 — 두 페처가 한 테이블을 덮어쓰면 조용히 섞인다', async () => {
  const all = await loadAll()
  const tables = all.map((a) => a.meta.table)
  assert.equal(new Set(tables).size, tables.length, '중복 테이블: ' + tables.join(', '))
})

/** 응답을 흉내내는 fetch */
const fake = (body, text = false) => async () => (text
  ? { text: async () => body }
  : { json: async () => body })

test('★★ 파싱 결과는 [초 단위 epoch, 숫자] 다 — 단위를 유추하게 두지 않는다', async () => {
  const cases = {
    'fear-greed': [fake({ data: [{ timestamp: '1700000000', value: '42' }] }), [[1700000000, 42]]],
    'btc-hashrate': [fake({ values: [{ x: 1700000000, y: 5.5e8 }] }), [[1700000000, 5.5e8]]],
    'btc-active-addresses': [fake({ values: [{ x: 1700000000, y: 900000 }] }), [[1700000000, 900000]]],
    //  ★ 날짜만 오는 CSV — UTC 자정으로 고정돼야 한다(로컬 파싱이면 서버마다 하루가 밀린다).
    //    2023-11-15T00:00:00Z = 1700006400. 숫자를 직접 적는다(구현으로 기대값을 만들지 않는다).
    'fed-funds': [fake('DATE,DFF\n2023-11-15,5.33\n', true), [[1700006400, 5.33]]],
  }
  const all = await loadAll()
  for (const { key, fetchRows } of all) {
    const c = cases[key]
    assert.ok(c, `${key}: 이 테스트에 케이스가 없다 — 페처를 추가했으면 여기도 추가하라`)
    assert.deepEqual(await fetchRows(c[0]), c[1], key)
  }
})

test('★ crontab 병합 — 다시 실행해도 줄이 쌓이지 않고, 남의 줄은 안 건드린다', async () => {
  const items = (await loadAll()).map(({ key, meta }) => ({ key, meta }))
  const lines = cronLines(items, { dir: '/home/u/f', node: '/usr/bin/node' })
  assert.equal(lines.length, items.length)
  assert.match(lines[0], /cd \/home\/u\/f && \/usr\/bin\/node run\.mjs \S+ >> /)

  const mine = '0 5 * * * /usr/bin/backup.sh\n'
  const once = mergeCrontab(mine, lines)
  const twice = mergeCrontab(once, lines)
  assert.equal(once, twice, '두 번 등록하면 블록이 두 개가 된다')
  assert.ok(twice.includes('/usr/bin/backup.sh'), '유저가 넣은 줄이 사라졌다')
  assert.equal(twice.split(BEGIN).length - 1, 1)
  assert.equal(twice.split(END).length - 1, 1)
})

test('★ 테이블 이름 화이트리스트 — 페처가 준 값이라도 식별자는 검사한다', () => {
  for (const bad of ['DROP', 'a; drop table x', '1abc', 'a'.repeat(70), '']) {
    assert.throws(() => assertTable(bad), /규격을 벗어났다/, String(bad))
  }
  assert.equal(assertTable('fear_greed'), 'fear_greed')
})

test('폴더 이름 규칙 — 러너가 경로로 쓰므로 [a-z0-9-] 만', async () => {
  for (const k of await listKeys()) assert.match(k, /^[a-z0-9-]{1,40}$/, k)
})
