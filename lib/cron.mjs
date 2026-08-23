// crontab 등록 — 페처가 **자기 주기를 선언**하고(meta.cron) 여기서 그대로 옮긴다.
//
//  ★ 주기를 러너가 정하면(예: 전부 매일 0시) 원본 갱신 시각과 어긋난 채 굳는다.
//    "이 데이터가 언제 바뀌나"는 페처만 아는 사실이다 — 아는 쪽이 선언한다.
//  ★ 블록을 마커로 감싼다: 다시 실행해도 **덮어쓰기**라 줄이 쌓이지 않고,
//    유저가 손으로 넣은 다른 cron 은 건드리지 않는다.

export const BEGIN = '# >>> soritrading-fetchers >>>'
export const END = '# <<< soritrading-fetchers <<<'

/**
 * 기존 crontab 문자열에 우리 블록을 넣거나 갈아끼운다.
 * @param {string} current  현재 crontab 전문('' 가능)
 * @param {string[]} lines  우리 블록 안에 들어갈 줄들
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
 * 페처 목록 → crontab 줄. 로그는 파일로 남긴다(무음 실패 방지 — cron 은 조용히 죽는다).
 * @param {{key:string, meta:{cron:string}}[]} items
 * @param {{ dir:string, node:string }} env
 */
export function cronLines(items, { dir, node }) {
  return items.map(({ key, meta }) =>
    `${meta.cron} cd ${dir} && ${node} run.mjs ${key} >> ${dir}/logs/${key}.log 2>&1`)
}
