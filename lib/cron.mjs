// crontab installation — each fetcher **declares its own schedule** (meta.cron) and this
// module copies it over verbatim.
//
//  ★ If the runner picked the schedule (say, everything at midnight), it would drift away
//    from when the source actually updates and then stay wrong. "When does this data change"
//    is something only the fetcher knows — the one who knows declares it.
//  ★ The block is wrapped in markers so re-running **replaces** it instead of stacking lines,
//    and whatever the user put in crontab by hand is left untouched.

export const BEGIN = '# >>> soritrading-fetchers >>>'
export const END = '# <<< soritrading-fetchers <<<'

/**
 * Insert or replace our block inside an existing crontab.
 * @param {string} current  current crontab contents (may be empty)
 * @param {string[]} lines  lines to put inside our block
 */
export function mergeCrontab(current, lines) {
  const block = [BEGIN, ...lines, END].join('\n')
  const src = String(current || '')
  const i = src.indexOf(BEGIN)
  const j = src.indexOf(END)
  if (i >= 0 && j > i) {
    return (src.slice(0, i) + block + src.slice(j + END.length)).replace(/\n{3,}/g, '\n\n').trimEnd() + '\n'
  }
  return (src.trimEnd() + (src.trim() ? '\n\n' : '') + block).trimEnd() + '\n'
}

/**
 * Fetchers → crontab lines. Output is redirected to a log file: cron fails silently, so
 * failures need somewhere to land.
 * @param {{key:string, meta:{cron:string}}[]} items
 * @param {{ dir:string, node:string }} env
 */
export function cronLines(items, { dir, node }) {
  return items.map(({ key, meta }) =>
    `${meta.cron} cd ${dir} && ${node} run.mjs ${key} >> ${dir}/logs/${key}.log 2>&1`)
}
