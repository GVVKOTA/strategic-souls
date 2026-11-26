#!/usr/bin/env bash
set -euo pipefail

# Sites discovers its managed installer at this fixed path.
project_root="$(cd "$(dirname "$0")/.." && pwd)"
exec bash "$project_root/tooling/install-pnpm.sh" "$@"
