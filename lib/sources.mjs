// Shared fetch + parsers for source families — one per wire format, not one per fetcher.
//
//  ★★ Why fetch is wrapped (real failure 2026-08-24): `stablecoin-mcap` died with
//    "Unexpected end of JSON input". That message names the SYMPTOM (the body did not parse)
//    and hides every fact needed to fix it — what status came back, from which URL, and what
//    the first bytes actually were. It was an empty 200 from a wrong host, and the error
//    could not say so. A fetcher that fails must say enough to be fixed without a debugger.
//
//  ★ Four fetchers read FRED CSV and three read the blockchain.com chart JSON. Copying the
//    parser into each folder would mean fixing a bug in one place and leaving it in three
//    (that is how the same value ends up different depending on which path produced it).
//    A fetcher folder still owns its `meta` — only the wire format is shared.

/** Response guard shared by every fetcher — turns a bad response into a readable sentence. */
async function ok(res, url) {
  const status = Number(res && res.status)
  //  ★ Some injected test doubles have no `status`; treat "no status" as fine rather than
  //    failing a parse-only test. Real fetch always has one.
  if (Number.isFinite(status) && (status < 200 || status >= 300)) {
    throw new Error(`HTTP ${status} from ${url}`)
  }
  return res
}

/** GET → JSON, with the body's first bytes in the error when it is not JSON. */
export async function fetchJson(fetchImpl, url) {
  const res = await ok(await fetchImpl(url), url)
  const text = await (res.text ? res.text() : Promise.resolve(null))
  //  A double that only implements json() (the contract test) is used as-is.
  if (text == null) return res.json()
  if (!text.trim()) throw new Error(`empty body from ${url} — the endpoint answered with nothing`)
  try {
    return JSON.parse(text)
  } catch (e) {
    throw new Error(`not JSON from ${url} — first bytes: ${JSON.stringify(text.slice(0, 120))}`)
  }
}

/** GET → text, refusing an empty body (a silent empty CSV would look like "no rows"). */
export async function fetchText(fetchImpl, url) {
  const res = await ok(await fetchImpl(url), url)
  const text = await res.text()
  if (!String(text || '').trim()) throw new Error(`empty body from ${url} — the endpoint answered with nothing`)
  return text
}

/**
 * FRED CSV: `DATE,SERIES` with one row per observation.
 *
 *  ★★ FRED writes `.` (or leaves the cell empty) for a missing observation (market holidays in daily series such as
 *    VIXCLS or DGS10). `Number('.')` is NaN, and a NaN row inserted as a "value" is worse
 *    than a gap: a strategy reading it cannot tell "no data that day" from a real number.
 *    Missing observations are therefore DROPPED — the series keeps a hole, which is honest.
 *  ★ Date-only values are pinned to UTC midnight. Parsing them in local time shifts the
 *    entire series by a day depending on where the collector happens to run.
 *
 * @param {string} csv
 * @returns {[number, number][]}
 */
export function parseFredCsv(csv) {
  return splitFredCsv(csv).rows
}

/**
 * Dates the FRED CSV **lists but leaves without a number** (`.` · empty · `ND`) — UTC-midnight seconds.
 *  ★ This is the evidence the repair uses (see repairTs). A date the CSV does not list at all is
 *    NOT a hole here: absence from the file says nothing, a listed blank says "no value that day".
 * @returns {number[]}
 */
export function parseFredHoles(csv) {
  return splitFredCsv(csv).holes
}

function splitFredCsv(csv) {
  const rows = []
  const holes = []
  for (const line of String(csv).trim().split('\n').slice(1)) {
    const [d, raw] = line.split(',')
    if (!d) continue
    const ts = Math.floor(new Date(d.trim() + 'T00:00:00Z').getTime() / 1000)
    if (!Number.isFinite(ts)) continue
    //  ★★ Missing is `.` **or an empty cell**. `Number('')` is 0, not NaN — an empty cell read with
    //    Number() silently becomes a real-looking 0 (a 0% yield, a 0 VIX). Only a literal number counts.
    const v = num(String(raw == null ? '' : raw).trim())
    if (Number.isFinite(v)) rows.push([ts, v])
    else holes.push(ts)   // '.' · '' · 'ND' = not published that day
  }
  return { rows, holes }
}

/**
 * A number only when the source actually wrote one: a finite JS number, or a numeric string.
 *  ★★ `Number(null)` and `Number('')` are both **0**, and `Number.isFinite(0)` is true — so the
 *    usual `Number(x)` + isFinite filter turns a source's "no value" into a real-looking zero.
 *    That is exactly how the FRED tables collected their 0 rows (2026-10-30: VIX 302, DXY 213).
 * @returns {number} NaN when the source did not give a number
 */
export function num(x) {
  if (typeof x === 'number') return Number.isFinite(x) ? x : NaN
  if (typeof x !== 'string') return NaN
  const s = x.trim()
  return /^-?\d+(\.\d+)?([eE][-+]?\d+)?$/.test(s) ? Number(s) : NaN
}

/**
 * Rows to delete: timestamps that are in the table **and** that the source, in this response,
 * explicitly lists as having no value.
 *
 *  ★★ Why (2026-10-30): the old parser stored FRED's blank/`.` cells as 0, and upsert never removes
 *    a row — fixing the parser left the 0s in place (VIX 302 rows, DXY 213, T10Y2Y 583).
 *  ★★ The test is "did the source give a number for that date", NOT "is the stored value 0".
 *    T10Y2Y really prints 0.00 on some days; those rows must stay. A value of 0 proves nothing.
 *  ★ Pure, so the rule can be checked with written-out numbers (test/repair.test.mjs).
 * @param {number[]} holeTs   dates the source lists without a value
 * @param {number[]} tableTs  dates currently in the table
 * @returns {number[]} sorted ascending
 */
export function repairTs(holeTs, tableTs) {
  const holes = new Set((holeTs || []).map(Number))
  return [...new Set((tableTs || []).map(Number))].filter((t) => holes.has(t)).sort((a, b) => a - b)
}

/**
 * Attach the hole list to the rows a fetcher returns (`rows.holes`). The runner deletes table rows on
 * those dates after the upsert. A fetcher that does not attach holes repairs nothing.
 * @param {[number, number][]} rows
 * @param {number[]} holes
 */
export function withHoles(rows, holes) {
  //  Non-enumerable: the rows still compare/print as a plain [ts, v][] everywhere else.
  return Object.defineProperty(rows, 'holes', { value: holes, enumerable: false })
}

/** FRED CSV → rows with `.holes` attached — one call for the four FRED fetchers. */
export function fredRows(csv) {
  const { rows, holes } = splitFredCsv(csv)
  return withHoles(rows, holes)
}

/** FRED series URL — the id is the only thing that varies between these fetchers. */
export const fredUrl = (id) => `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${id}`

/**
 * blockchain.com charts JSON: `{ values: [{ x: epoch seconds, y: number }] }`.
 * @returns {[number, number][]}
 */
export function parseChartValues(json) {
  const rows = []
  const holes = []
  for (const p of (json && json.values) || []) {
    const t = num(p && p.x)
    if (!Number.isFinite(t)) continue
    //  ★ `y: null` would have been `Number(null)` = 0 — a 0 hash rate. It is a hole.
    const v = num(p.y)
    if (Number.isFinite(v)) rows.push([t, v])
    else holes.push(t)
  }
  return withHoles(rows, holes)
}

/**
 * blockchain.com chart URL — full history, **unsampled**.
 *
 *  ★★ `sampled` defaults to TRUE, which caps the response at ~1.5k points "for performance".
 *    Measured 2026-08-24: 17 years of daily data came back as 1,608 rows — roughly every
 *    4th day — and nothing in the response says so. The series looked complete: sane values,
 *    right start date, right end date. A strategy reading it as-of would have held each value
 *    for four days and called it daily data.
 *  ★ This is the failure mode this project keeps meeting from the other side: the source
 *    answered a different question than the one asked, and answered it successfully.
 *    `sampled=false` asks for what we actually meant.
 */
export const chartUrl = (name) => `https://api.blockchain.info/charts/${name}?timespan=all&sampled=false&format=json`

/**
 * DefiLlama daily series: `[{ date, <field> }]` where date is epoch SECONDS as a string.
 *
 *  ★ `totalCirculating` is sometimes an object (`{ peggedUSD: n }`) and sometimes a plain
 *    number, depending on the endpoint. Both are accepted; anything else is dropped rather
 *    than coerced, because a silently coerced 0 reads as "no stablecoins in circulation".
 * @param {any[]} arr
 * @param {string} field
 * @returns {[number, number][]}
 */
export function parseLlamaSeries(arr, field) {
  const out = []
  const holes = []
  for (const row of Array.isArray(arr) ? arr : []) {
    const ts = Math.floor(num(row && row.date))
    let v = row && row[field]
    if (v && typeof v === 'object') {
      //  ★★ Buckets are per PEG CURRENCY (peggedUSD, peggedEUR, peggedJPY…), each denominated
      //    in ITS OWN currency. Summing them adds euros to dollars — the total would be a
      //    number with no unit, which is worse than a smaller correct one. Take the USD peg
      //    and leave the rest: one table is one series, in one unit.
      //    (First written as a sum on 2026-08-24; corrected the same day before it was used.)
      v = v.peggedUSD
    }
    //  ★ `tvl: null` was `Number(null)` = 0 — "no capital locked". It is a hole.
    const n = num(v)
    if (!Number.isFinite(ts)) continue
    if (Number.isFinite(n)) out.push([ts, n])
    else holes.push(ts)
  }
  return withHoles(out, holes)
}
