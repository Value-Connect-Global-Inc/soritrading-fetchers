#!/usr/bin/env bash
#  리포 이름 정의처 — 네 리포(sori-frontend · sori-backend · soritrading-agent · soritrading-fetchers)가
#  같은 표를 갖는다. 옆 리포를 이름으로 찾는 코드는 여기를 source 해서 쓴다.
#  (이 리포에는 현재 옆 리포를 찾는 실행 경로가 없다 — 정의처만 둔다.)
#
#  사용:  . scripts/lib/repo-names.sh
#         sori_repo_name agent           # → soritrading-agent
#         sori_repo_old agent            # → coinsori-trading
#         sori_find_repo agent "$HOME"   # → SORI_FOUND_DIR / SORI_FOUND_VIA

#  ── 표 시작 (이 아래 SORI_ 줄은 네 리포에서 같아야 한다) ──
SORI_GH_ORG="Value-Connect-Global-Inc"
SORI_REPO_ROLES="frontend agent backend fetchers"
SORI_REPO_frontend="sori-frontend"
SORI_REPO_OLD_frontend="coinsori-prototype"
SORI_REPO_agent="soritrading-agent"
SORI_REPO_OLD_agent="coinsori-trading"
SORI_REPO_backend="sori-backend"
SORI_REPO_OLD_backend="coinsori-community"
SORI_REPO_fetchers="soritrading-fetchers"
SORI_REPO_OLD_fetchers=""
SORI_SERVER_ROOT="/opt/coinsori"
#  ── 표 끝 ──

#  모르는 역할이면 반환 1.
sori_repo_name() {
  case " $SORI_REPO_ROLES " in *" $1 "*) ;; *) return 1 ;; esac
  local v="SORI_REPO_$1"
  printf '%s\n' "${!v}"
}

#  옛 이름이 없으면 빈 줄.
sori_repo_old() {
  case " $SORI_REPO_ROLES " in *" $1 "*) ;; *) return 1 ;; esac
  local v="SORI_REPO_OLD_$1"
  printf '%s\n' "${!v}"
}

#  sori_find_repo ROLE PARENT — PARENT 아래에서 새 이름 먼저, 없으면 옛 이름.
#  SORI_FOUND_VIA: new | old | new+alias(둘이 같은 곳, 예: 링크) | none | ambiguous(서로 다른 곳 → 반환 2)
sori_find_repo() {
  SORI_FOUND_DIR=""; SORI_FOUND_VIA="none"
  local new old parent="${2:-.}"
  new="$(sori_repo_name "$1")" || return 1
  old="$(sori_repo_old "$1")"
  local nd="$parent/$new" od=""
  [ -n "$old" ] && od="$parent/$old"
  if [ -d "$nd" ] && [ -n "$od" ] && [ -d "$od" ]; then
    if [ "$(cd "$nd" && pwd -P)" = "$(cd "$od" && pwd -P)" ]; then
      SORI_FOUND_DIR="$nd"; SORI_FOUND_VIA="new+alias"; return 0
    fi
    SORI_FOUND_VIA="ambiguous"; return 2
  fi
  if [ -d "$nd" ]; then SORI_FOUND_DIR="$nd"; SORI_FOUND_VIA="new"; return 0; fi
  if [ -n "$od" ] && [ -d "$od" ]; then SORI_FOUND_DIR="$od"; SORI_FOUND_VIA="old"; return 0; fi
  return 1
}
