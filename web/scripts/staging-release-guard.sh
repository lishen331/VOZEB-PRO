#!/usr/bin/env bash
set -euo pipefail
fail() { printf 'Shared staging blocked: %s\n' "$1" >&2; exit 1; }
[ "${RELEASE_REF:-}" = refs/heads/develop ] || fail 'only refs/heads/develop may deploy to the shared test environment; use an isolated environment for production candidates'
[[ "${CANDIDATE_SHA:-}" =~ ^[0-9a-f]{40}$ ]] || fail 'candidate SHA missing or invalid'
[ "$CANDIDATE_SHA" = "${DEVELOP_SHA:-}" ] || fail 'candidate is not the latest origin/develop; a newer test version must not be overwritten'
[[ "${DEPLOYED_IMAGE:-}" =~ ^ghcr.io/lishen331/vozeb-pro:sha-([0-9a-f]{40})$ ]] || fail 'deployed image identity is unknown; investigate rather than guessing'
deployed_sha="${BASH_REMATCH[1]}"
git cat-file -e "$deployed_sha^{commit}" || fail 'deployed commit is not in the inspected repository history'
git merge-base --is-ancestor "$deployed_sha" "$CANDIDATE_SHA" || fail 'candidate does not contain the currently deployed history; reconcile both sides before deployment'
printf 'Shared staging baseline verified: %s -> %s\n' "$deployed_sha" "$CANDIDATE_SHA"
