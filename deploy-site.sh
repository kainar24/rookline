#!/bin/bash
# Publishes Rookline: runs the tests locally and pushes main.
# GitHub Actions (.github/workflows/pages.yml) then builds and deploys https://kainar24.github.io/rookline/
set -euo pipefail
cd "$(dirname "$0")"
GH="${GH:-$(command -v gh || echo "$HOME/Developer/gh/bin/gh")}"

npm test
git -c credential.helper= -c "credential.helper=!$GH auth git-credential" push origin main
echo "Pushed. The site updates in 1-2 minutes: https://github.com/kainar24/rookline/actions"
