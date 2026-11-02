#!/usr/bin/env bash
set -euo pipefail
[[ "${GITHUB_EVENT_NAME:-}" == workflow_dispatch ]]
[[ "${GITHUB_REF:-}" == refs/heads/feat/minimax-admin-* ]]
[[ "${APPROVED_STAGING_SHA:-}" =~ ^[a-f0-9]{40}$ ]]
[[ "${APPROVED_STAGING_SHA}" == "${GITHUB_SHA:-}" ]]
[[ "${APPROVED_STAGING_SHA}" == "$(git rev-parse HEAD)" ]]
[[ "${DEPLOY_PRODUCTION:-false}" != true ]]
