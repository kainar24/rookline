#!/bin/bash
# Builds Rookline and publishes it to GitHub Pages (branch gh-pages) of kainar24/rookline.
# Usage: bash deploy-site.sh [--build-only]
set -euo pipefail
cd "$(dirname "$0")"

OWNER=kainar24
REPO=rookline
GH="${GH:-$(command -v gh || echo "$HOME/Developer/gh/bin/gh")}"
NAME="$(git config --global user.name)"
EMAIL="$(git config --global user.email)"

npm test
npm run build
touch dist/.nojekyll
[ "${1:-}" = "--build-only" ] && { echo "Build is ready in dist/"; exit 0; }

push() { git -c credential.helper= -c "credential.helper=!$GH auth git-credential" push "$@"; }

"$GH" repo view "$OWNER/$REPO" >/dev/null 2>&1 || "$GH" repo create "$OWNER/$REPO" --public \
  --description "Rookline: chess game review in the browser with Stockfish (WASM)" --homepage "https://$OWNER.github.io/$REPO/"
git remote get-url origin >/dev/null 2>&1 || git remote add origin "https://github.com/$OWNER/$REPO.git"
push -u origin main

PUB="$(mktemp -d)"
cp -R dist/. "$PUB/"
(
  cd "$PUB"
  git init -q -b gh-pages
  git add -A
  git -c user.name="$NAME" -c user.email="$EMAIL" commit -q -m "Publish site"
  git remote add origin "https://github.com/$OWNER/$REPO.git"
  push -f origin gh-pages
)
rm -rf "$PUB"

"$GH" api "repos/$OWNER/$REPO/pages" >/dev/null 2>&1 || "$GH" api -X POST "repos/$OWNER/$REPO/pages" -f "source[branch]=gh-pages" -f "source[path]=/" >/dev/null
echo "Done: https://$OWNER.github.io/$REPO/ (the first deploy takes 1-2 minutes)"
