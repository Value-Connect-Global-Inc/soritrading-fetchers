#!/usr/bin/env node
// Runner — fetches one source (or all of them) into your database and prints the values you
// need to register the dataset in SoriTrading.
//
//   node run.mjs list                 what is available
//   node run.mjs fear-greed           fetch one
//   node run.mjs all                  fetch everything
//   node run.mjs --install-cron       install each fetcher's own schedule (idempotent)
//   node run.mjs --show-cron          print the lines without installing
//   node run.mjs --check              what is in the database right now (no fetching)
//
//  DATABASE_URL comes from .env or the environment. ★ Use a **write account** — a read-only
//  account is supposed to reject the INSERT.

import { readFile, mkdir } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { listKeys, loadFetcher, loadAll } from './lib/registry.mjs'
import { upsertRows, tableStats } from './lib/db.mjs'
import { mergeCrontab, cronLines } from './lib/cron.mjs'

const DIR = path.dirname(fileURLToPath(import.meta.url))
//  ★ Below this, assume the source changed shape — do not leave a half-filled table behind.
const MIN_ROWS = 50

/** Read DATABASE_URL from .env unless the environment already has it. */
async function loadEnv() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL
  try {
    const txt = await readFile(path.join(DIR, '.env'), 'utf8')
    const m = /^\s*DATABASE_URL\s*=\s*(.+?)\s*$/m.exec(txt)
    if (m) return m[1].replace(/^['"]|['"]$/g, '')
  } catch { /* no .env */ }
  return null
}

const day = (s) => new Date(Number(s) * 1000).toISOString().slice(0, 10)

async function runOne(key, url) {
  const { meta, fetchRows } = await loadFetcher(key)
  const rows = (await fetchRows()).filter(([t, v]) => Number.isFinite(t) && Number.isFinite(v))
  if (rows.length < MIN_ROWS) {
    throw new Error(`${key}: only ${rows.length} usable rows (minimum ${MIN_ROWS}) — check whether the source response changed`)
  }
  const s = await upsertRows(url, meta.table, rows, { describe: meta.describe })
  console.log(`[${new Date().toISOString()}] ${key} -> ${meta.table}: ${s.total} rows, ${day(s.first)} to ${day(s.last)} (${s.inserted} sent this run)`)
  return { meta, stat: s }
}

function printDecl(meta) {
  console.log(`  Register: tell the AI "Register the ${meta.table} table in my DB as a dataset"`)
  console.log(`  Manual — query: SELECT ts, v FROM ${meta.table} WHERE ts BETWEEN $1 AND $2 | tsCol: ts | valCol: v | dbAlias: main`)
}

const arg = process.argv[2]

if (!arg || arg === 'list' || arg === '--help' || arg === '-h') {
  const items = await loadAll()
  console.log('Available fetchers:')
  for (const { key, meta } of items) {
    console.log(`  ${key.padEnd(22)} -> ${meta.table.padEnd(22)} ${meta.cron.padEnd(14)} ${meta.source}`)
  }
  console.log('\nUsage: node run.mjs <name>|all   ·   node run.mjs --install-cron')
  process.exit(0)
}

if (arg === '--show-cron' || arg === '--install-cron') {
  const items = await loadAll()
  const lines = cronLines(items, { dir: DIR, node: process.execPath })
  if (arg === '--show-cron') { console.log(lines.join('\n')); process.exit(0) }
  await mkdir(path.join(DIR, 'logs'), { recursive: true })
  let current = ''
  try { current = execFileSync('crontab', ['-l'], { encoding: 'utf8' }) } catch { /* empty crontab */ }
  execFileSync('crontab', ['-'], { input: mergeCrontab(current, lines) })
  console.log(`crontab updated — ${lines.length} fetchers. Verify with: crontab -l`)
  console.log(`Logs: ${DIR}/logs/<fetcher>.log  (cron fails silently, so failures land there)`)
  process.exit(0)
}

const url = await loadEnv()
if (!url) {
  console.error('DATABASE_URL is not set — create .env (see .env.example) or pass it in the environment.')
  console.error('★ Use a write account. A read-only account (readonly_bot) is supposed to reject the INSERT.')
  process.exit(1)
}

//  ★ --check reads the DATABASE, not the sources. After a collection run this is the only
//    thing that proves what landed: row counts, the covered range, and the newest value.
//    A fetch that "succeeded" and a table that has data are different claims.
if (arg === '--check') {
  const items = await loadAll()
  let bad = 0
  for (const { key, meta } of items) {
    const st = await tableStats(url, meta.table)
    if (st.state === 'ok') {
      const age = Math.floor((Date.now() / 1000 - st.last) / 86400)
      //  ★ Staleness is reported, not judged: a weekly series is 6 days old on purpose,
      //    and only the person who knows the source can say whether that is wrong.
      //
      //  ★★ 2026-09-07: `(4d old)` 하나로는 **세 가지가 구별되지 않았다** —
      //    소스가 안 줬다 / cron 이 죽었다 / 돌았는데 실패했다.
      //    실제로 그걸 가르려고 cron 로그와 max(ts) 를 손으로 대조해야 했다.
      //    ⇒ **언제 확인했는지**를 함께 적는다. 그러면 한 줄로 갈린다:
      //       값이 4일 됐는데 오늘 확인함  → 소스가 안 준 것(정상)
      //       값도 4일, 확인도 4일 전      → 수집이 멈춘 것
      const chk = !st.hasChecked
        ? 'checked=?(old table — runs once and the column appears)'
        : st.checkedAt
          ? `checked ${Math.floor((Date.now() - Date.parse(st.checkedAt)) / 3600e3)}h ago`
          : 'checked=never(column exists, no run yet)'
      console.log(`  ${key.padEnd(22)} ${String(st.rows).padStart(7)} rows  ${day(st.first)} → ${day(st.last)}`
        + `  last=${st.lastValue}  (${age}d old, ${chk})`)
    } else {
      bad++
      console.log(`  ${key.padEnd(22)} ${st.state.toUpperCase()} — ${st.note}`)
    }
  }
  process.exit(bad ? 1 : 0)
}

const keys = arg === 'all' ? await listKeys() : [arg]
let failed = 0
for (const k of keys) {
  try {
    const { meta } = await runOne(k, url)
    if (keys.length === 1) printDecl(meta)
  } catch (e) {
    failed++
    //  ★ One failure does not stop the rest — but the fact that it failed survives in the exit code.
    console.error(`FAILED ${k}: ${(e && e.message) || e}`)
  }
}
process.exit(failed ? 1 : 0)
