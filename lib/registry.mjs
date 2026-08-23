// 페처 레지스트리 — **디렉토리가 곧 목록**이다.
//
//  ★ 목록을 코드에 또 적지 않는다: 폴더를 추가하고 목록에 등록하는 걸 잊으면
//    "있는데 안 도는 페처"가 생긴다. 여기서 읽으면 그 상태가 존재할 수 없다.

import { readdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'fetchers')

/** 폴더 이름 목록(정렬) */
export async function listKeys() {
  const ents = await readdir(ROOT, { withFileTypes: true })
  return ents.filter((e) => e.isDirectory() && !e.name.startsWith('.')).map((e) => e.name).sort()
}

/** 페처 모듈 하나 — { meta, fetchRows } */
export async function loadFetcher(key) {
  if (!/^[a-z0-9-]{1,40}$/.test(String(key || ''))) throw new Error(`페처 이름 형식 오류: ${key}`)
  const mod = await import(path.join(ROOT, key, 'index.mjs'))
  if (!mod.meta || typeof mod.fetchRows !== 'function') {
    throw new Error(`${key}: meta 와 fetchRows 를 내보내야 한다 (README 참조)`)
  }
  //  ★ 폴더 이름과 meta.key 가 갈리면 cron 등록·로그·안내가 서로 다른 이름을 말한다.
  if (mod.meta.key !== key) throw new Error(`${key}: meta.key('${mod.meta.key}') 가 폴더 이름과 다르다`)
  return mod
}

/** 전부 로드 — 목록 출력·계약 테스트가 쓴다 */
export async function loadAll() {
  const keys = await listKeys()
  return Promise.all(keys.map(async (k) => ({ key: k, ...(await loadFetcher(k)) })))
}
