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
  const out = []
  for (const line of String(csv).trim().split('\n').slice(1)) {
    const [d, raw] = line.split(',')
    if (!d) continue
    //  ★★ Missing is `.` **or an empty cell**. `Number('')` is 0, not NaN — an empty cell read with
    //    Number() silently becomes a real-looking 0 (a 0% yield, a 0 VIX). Only a literal number counts.
    const s = String(raw == null ? '' : raw).trim()
    if (!/^-?\d+(\.\d+)?([eE][-+]?\d+)?$/.test(s)) continue   // '.' · '' · 'ND' = not published that day
    const v = Number(s)
    const ts = Math.floor(new Date(d.trim() + 'T00:00:00Z').getTime() / 1000)
    if (!Number.isFinite(ts)) continue
    out.push([ts, v])
  }
  return out
}

/** FRED series URL — the id is the only thing that varies between these fetchers. */
export const fredUrl = (id) => `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${id}`

/**
 * blockchain.com charts JSON: `{ values: [{ x: epoch seconds, y: number }] }`.
 * @returns {[number, number][]}
 */
export function parseChartValues(json) {
  return ((json && json.values) || [])
    .map((p) => [Number(p.x), Number(p.y)])
    .filter(([t, v]) => Number.isFinite(t) && Number.isFinite(v))
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
  for (const row of Array.isArray(arr) ? arr : []) {
    const ts = Math.floor(Number(row && row.date))
    let v = row && row[field]
    if (v && typeof v === 'object') {
      //  ★★ Buckets are per PEG CURRENCY (peggedUSD, peggedEUR, peggedJPY…), each denominated
      //    in ITS OWN currency. Summing them adds euros to dollars — the total would be a
      //    number with no unit, which is worse than a smaller correct one. Take the USD peg
      //    and leave the rest: one table is one series, in one unit.
      //    (First written as a sum on 2026-08-24; corrected the same day before it was used.)
      v = v.peggedUSD
    }
    const n = Number(v)
    if (Number.isFinite(ts) && Number.isFinite(n)) out.push([ts, n])
  }
  return out
}
