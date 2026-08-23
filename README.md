# soritrading-fetchers

Lightweight fetchers that pull **free public data** into **your own Postgres**, so your
SoriTrading strategies can read it with `ctx.data()`.

One directory = one fetcher. Adding a source is a folder and a single `index.mjs`.

- The data lives **in your database only**. Nothing is uploaded to SoriTrading — not the values,
  not the connection string.
- Backtests read it through your own agent, on your own machine.
- Each fetcher declares its own schedule; the runner installs it into `crontab` for you.

## Quick start

```sh
git clone https://github.com/valueconnectinc/soritrading-fetchers ~/soritrading-fetchers
cd ~/soritrading-fetchers
npm install                      # one dependency: pg
cp .env.example .env             # DATABASE_URL — use a WRITE account
node run.mjs list                # what is available
node run.mjs fear-greed          # fetch once
node run.mjs all                 # fetch everything once
node run.mjs --install-cron      # install each fetcher's own schedule into crontab
```

★ Load with a **write account** (usually `postgres`), and give SoriTrading a **read-only
account**. If a read-only account rejects the INSERT, that is working as intended.

## After loading — use it in a strategy

The runner prints the declaration values when it finishes. Just tell the AI:

> "Register the `fear_greed` table in my DB as `fg`"

Or enter them yourself: `query: SELECT ts, v FROM fear_greed WHERE ts BETWEEN $1 AND $2`,
`tsCol: ts`, `valCol: v`, `dbAlias: main`.

## Add a fetcher

Create `fetchers/<name>/index.mjs` and export the two things below. The contract is enforced by
`test/contract.test.mjs`, so a fetcher that breaks the rules fails before it is merged.

```js
export const meta = {
  key: 'my-source',                  // must match the folder name
  table: 'my_table',                 // created as (ts bigint PK, v numeric)
  title: 'Human readable name',
  source: 'example.com',             // where it comes from, so a human can verify it
  url: 'https://example.com/api',
  cron: '17 * * * *',                // this fetcher's own schedule — copied into crontab as is
  license: 'One line about the source terms.',
}

/** @returns {Promise<[number, number][]>} [epoch SECONDS, value] */
export async function fetchRows(fetchImpl = fetch) {
  const j = await (await fetchImpl(meta.url)).json()
  return j.items.map((d) => [Number(d.t), Number(d.v)])
}
```

Three rules:

1. **Normalize timestamps to epoch seconds** here. If the source uses milliseconds or ISO
   strings, convert in the fetcher. Leaving the unit to be guessed downstream fails silently.
2. **One value per row.** If a source exposes several metrics, write several fetchers —
   one table is one series.
3. **Fail instead of loading a partial table.** The runner refuses anything under 50 rows,
   because a half-filled table makes backtests quietly wrong.

`fetchRows` takes an injectable `fetchImpl` so the contract test can verify parsing without
touching the network. Run `npm test` before opening a pull request.

## Included fetchers

| Folder | Table | Source | Schedule |
|---|---|---|---|
| `fear-greed` | `fear_greed` | alternative.me | daily |
| `btc-hashrate` | `btc_hashrate` | blockchain.com | daily |
| `btc-active-addresses` | `btc_active_addresses` | blockchain.com | daily |
| `fed-funds` | `macro_fed_funds` | FRED (DFF) | daily |

★ `fed-funds` overlaps with SoriTrading's built-in `ctx.macro`. Feeding the same value through
two paths makes a result ambiguous about which one it used, so treat that one as practice for
the integration rather than something to build on.

## Scheduling

`node run.mjs --install-cron` writes one crontab line per fetcher, wrapped in a marker block:

```
# >>> soritrading-fetchers >>>
20 0 * * * cd /home/you/soritrading-fetchers && /usr/bin/node run.mjs fear-greed >> .../logs/fear-greed.log 2>&1
# <<< soritrading-fetchers <<<
```

Running it again replaces the block instead of appending, and anything you added to crontab
yourself is left alone. Output goes to `logs/<fetcher>.log` — cron fails silently, so failures
need somewhere to land. Use `--show-cron` to preview without installing.

## License and terms

The code is MIT. **The data is not ours** — each fetcher's `meta.license` points at the source's
terms, and you should read the original before any commercial redistribution. This project does
not redistribute data; it copies it into a database you own.
