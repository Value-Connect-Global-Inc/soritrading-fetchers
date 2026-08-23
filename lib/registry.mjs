// Fetcher registry — **the directory is the list**.
//
//  ★ The list is not written down twice: if adding a folder also required registering it
//    somewhere, someone would forget, and a fetcher would exist without ever running.
//    Reading the directory makes that state impossible.

import { readdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'fetchers')

/** Folder names, sorted. */
export async function listKeys() {
  const ents = await readdir(ROOT, { withFileTypes: true })
  return ents.filter((e) => e.isDirectory() && !e.name.startsWith('.')).map((e) => e.name).sort()
}

/** One fetcher module — { meta, fetchRows } */
export async function loadFetcher(key) {
  if (!/^[a-z0-9-]{1,40}$/.test(String(key || ''))) throw new Error(`invalid fetcher name: ${key}`)
  const mod = await import(path.join(ROOT, key, 'index.mjs'))
  if (!mod.meta || typeof mod.fetchRows !== 'function') {
    throw new Error(`${key}: must export "meta" and "fetchRows" (see README)`)
  }
  //  ★ If the folder name and meta.key drift apart, cron entries, logs and instructions
  //    start naming different things.
  if (mod.meta.key !== key) throw new Error(`${key}: meta.key ('${mod.meta.key}') does not match the folder name`)
  return mod
}

/** Load everything — used by the listing and the contract test. */
export async function loadAll() {
  const keys = await listKeys()
  return Promise.all(keys.map(async (k) => ({ key: k, ...(await loadFetcher(k)) })))
}
