#!/usr/bin/env bash
set -euo pipefail

# Inputs are passed through the environment, never interpolated into shell code.
[[ "${GITHUB_EVENT_NAME:-}" == workflow_dispatch ]]
[[ "${GITHUB_REF:-}" == refs/heads/main ]]
[[ "${APPROVED_SHA:-}" =~ ^[0-9a-f]{40}$ ]]
[[ "$APPROVED_SHA" == "${GITHUB_SHA:-}" ]]
[[ "$(git rev-parse HEAD)" == "$APPROVED_SHA" ]]
CURRENT_MAIN=$(git ls-remote --exit-code origin refs/heads/main | cut -f1)
[[ "$CURRENT_MAIN" == "$APPROVED_SHA" ]]
printf 'Approved current main revision: %s\n' "$APPROVED_SHA"
