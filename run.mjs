#!/usr/bin/env node
// 러너 — 페처 하나(또는 전부)를 돌려 내 DB 에 넣고, 등록 값을 알려준다.
//
//   node run.mjs list                 어떤 페처가 있나
//   node run.mjs fear-greed           하나 수집
//   node run.mjs all                  전부 수집
//   node run.mjs --install-cron       페처가 선언한 주기로 crontab 등록(덮어쓰기, 반복 안전)
//   node run.mjs --show-cron          등록될 줄만 출력(설치 안 함)
//
//  DATABASE_URL 은 .env 또는 환경변수. ★ **쓰기 계정**으로 — 읽기 전용은 INSERT 가 막힌다.

import { readFile, mkdir } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { listKeys, loadFetcher, loadAll } from './lib/registry.mjs'
import { upsertRows } from './lib/db.mjs'
import { mergeCrontab, cronLines } from './lib/cron.mjs'

const DIR = path.dirname(fileURLToPath(import.meta.url))
const MIN_ROWS = 50   // ★ 이보다 적으면 원본이 바뀐 것으로 본다 — 절반짜리 테이블을 만들지 않는다

/** .env 를 읽어 DATABASE_URL 을 채운다(없으면 환경변수 그대로) */
async function loadEnv() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL
  try {
    const txt = await readFile(path.join(DIR, '.env'), 'utf8')
    const m = /^\s*DATABASE_URL\s*=\s*(.+?)\s*$/m.exec(txt)
    if (m) return m[1].replace(/^['"]|['"]$/g, '')
  } catch { /* .env 없음 */ }
  return null
}

const day = (s) => new Date(Number(s) * 1000).toISOString().slice(0, 10)

async function runOne(key, url) {
  const { meta, fetchRows } = await loadFetcher(key)
  const rows = (await fetchRows()).filter(([t, v]) => Number.isFinite(t) && Number.isFinite(v))
  if (rows.length < MIN_ROWS) {
    //  ★ 조용히 적게 넣지 않는다. 원본 포맷이 바뀌면 여기서 멈추는 게 맞다.
    throw new Error(`${key}: 받은 행이 ${rows.length}개뿐이다(하한 ${MIN_ROWS}) — 원본 응답이 바뀌었는지 확인`)
  }
  const s = await upsertRows(url, meta.table, rows)
  console.log(`[${new Date().toISOString()}] ${key} → ${meta.table}: ${s.total}행 · ${day(s.first)} ~ ${day(s.last)} (이번에 ${s.inserted}행 반영)`)
  return { meta, stat: s }
}

function printDecl(meta) {
  console.log(`  등록: AI 에게 "내 DB 의 ${meta.table} 테이블을 데이터셋으로 등록해줘"`)
  console.log(`  직접 넣을 때 — query: SELECT ts, v FROM ${meta.table} WHERE ts BETWEEN $1 AND $2 · tsCol: ts · valCol: v · dbAlias: main`)
}

const arg = process.argv[2]

if (!arg || arg === 'list' || arg === '--help' || arg === '-h') {
  const items = await loadAll()
  console.log('페처 목록:')
  for (const { key, meta } of items) {
    console.log(`  ${key.padEnd(22)} → ${meta.table.padEnd(22)} ${meta.cron.padEnd(14)} ${meta.source}`)
  }
  console.log('\n사용: node run.mjs <이름>|all  ·  node run.mjs --install-cron')
  process.exit(0)
}

if (arg === '--show-cron' || arg === '--install-cron') {
  const items = await loadAll()
  const lines = cronLines(items, { dir: DIR, node: process.execPath })
  if (arg === '--show-cron') { console.log(lines.join('\n')); process.exit(0) }
  await mkdir(path.join(DIR, 'logs'), { recursive: true })
  let current = ''
  try { current = execFileSync('crontab', ['-l'], { encoding: 'utf8' }) } catch { /* 비어 있음 */ }
  const next = mergeCrontab(current, lines)
  execFileSync('crontab', ['-'], { input: next })
  console.log(`crontab 등록 완료 — ${lines.length}개 페처. 확인: crontab -l`)
  console.log(`로그: ${DIR}/logs/<페처>.log  (cron 은 조용히 죽으므로 실패는 여기 남는다)`)
  process.exit(0)
}

const url = await loadEnv()
if (!url) {
  console.error('DATABASE_URL 이 없다 — .env 를 만들거나(.env.example 참조) 환경변수로 주세요.')
  console.error('★ 쓰기 계정으로. 읽기 전용 계정(readonly_bot)은 INSERT 가 거부되는 게 정상입니다.')
  process.exit(1)
}

const keys = arg === 'all' ? await listKeys() : [arg]
let failed = 0
for (const k of keys) {
  try {
    const { meta } = await runOne(k, url)
    if (keys.length === 1) printDecl(meta)
  } catch (e) {
    failed++
    //  ★ all 에서 하나가 죽어도 나머지는 돈다 — 다만 **죽었다는 사실은 종료코드에 남긴다**.
    console.error(`✗ ${k}: ${(e && e.message) || e}`)
  }
}
process.exit(failed ? 1 : 0)
