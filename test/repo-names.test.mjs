//  scripts/lib/repo-names.sh — 표 값과 sori_find_repo 판정. 표는 네 리포에서 글자 그대로 같아야 하므로
//  기대값을 문자열로 직접 적는다.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const LIB = new URL('../scripts/lib/repo-names.sh', import.meta.url).pathname
const sh = (body) => execFileSync('bash', ['-c', `. "${LIB}"; ${body}`], { encoding: 'utf8' }).trim()

test('repo-names: table values', () => {
  assert.equal(sh('echo "$SORI_GH_ORG"'), 'Value-Connect-Global-Inc')
  assert.equal(sh('echo "$SORI_REPO_ROLES"'), 'frontend agent backend fetchers')
  assert.equal(sh('echo "$SORI_SERVER_ROOT"'), '/opt/sori')
  const want = {
    frontend: ['sori-frontend', 'coinsori-prototype'],
    agent: ['soritrading-agent', 'coinsori-trading'],
    backend: ['sori-backend', 'coinsori-community'],
    fetchers: ['soritrading-fetchers', ''],
  }
  for (const [role, [name, old]] of Object.entries(want)) {
    assert.equal(sh(`sori_repo_name ${role}`), name)
    assert.equal(sh(`sori_repo_old ${role}`), old)
  }
  assert.equal(sh('sori_repo_name nope; echo "rc=$?"'), 'rc=1')
})

test('repo-names: sori_find_repo new → old → alias → ambiguous', () => {
  const find = (parent) => sh(`sori_find_repo agent "${parent}"; echo "$? $SORI_FOUND_VIA $SORI_FOUND_DIR"`)
  const p = mkdtempSync(join(tmpdir(), 'sori-'))
  assert.equal(find(p), '1 none')
  mkdirSync(join(p, 'coinsori-trading'))
  assert.equal(find(p), `0 old ${p}/coinsori-trading`)
  mkdirSync(join(p, 'soritrading-agent'))
  assert.equal(find(p), '2 ambiguous')

  const q = mkdtempSync(join(tmpdir(), 'sori-'))
  mkdirSync(join(q, 'soritrading-agent'))
  assert.equal(find(q), `0 new ${q}/soritrading-agent`)
  symlinkSync(join(q, 'soritrading-agent'), join(q, 'coinsori-trading'))
  assert.equal(find(q), `0 new+alias ${q}/soritrading-agent`)
})
