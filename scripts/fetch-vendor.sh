#!/bin/bash
# Re-downloads the vendored Mermaid build (web/vendor/mermaid.min.js).
# Usage: scripts/fetch-vendor.sh [version]
set -euo pipefail

VERSION="${1:-11.17.2}"
DIR="$(cd "$(dirname "$0")/.." && pwd)/web/vendor"

curl -fsSL "https://cdn.jsdelivr.net/npm/mermaid@${VERSION}/dist/mermaid.min.js" -o "${DIR}/mermaid.min.js"
curl -fsSL "https://cdn.jsdelivr.net/npm/mermaid@${VERSION}/LICENSE" -o "${DIR}/mermaid.LICENSE"
echo "Mermaid ${VERSION} -> ${DIR}/mermaid.min.js"
shasum -a 256 "${DIR}/mermaid.min.js" 2>/dev/null || sha256sum "${DIR}/mermaid.min.js"
