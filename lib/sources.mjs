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
 *  ★★ FRED writes `.` for a missing observation (market holidays in daily series such as
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
    const v = Number(raw)
    if (!Number.isFinite(v)) continue                       // '.' = not published that day
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

/** blockchain.com chart URL — `timespan=all` returns the full history in one response. */
export const chartUrl = (name) => `https://api.blockchain.info/charts/${name}?timespan=all&format=json`

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
      //  Sum the pegged buckets present (peggedUSD, peggedEUR, …) — the caller asked for a
      //  total, and taking only the first key would quietly drop the rest.
      v = Object.values(v).reduce((a, b) => a + (Number.isFinite(Number(b)) ? Number(b) : 0), 0)
    }
    const n = Number(v)
    if (Number.isFinite(ts) && Number.isFinite(n)) out.push([ts, n])
  }
  return out
}
