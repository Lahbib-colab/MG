#!/usr/bin/env bash
# Installe le moteur de lecture optique (Tesseract.js) et la langue française dans vendor/tesseract/
# pour que les photos de factures soient lues 100 % en local, sans réseau, une fois l'app installée.
# Prérequis : Node.js (npm). À lancer une seule fois depuis la racine du dépôt : bash scripts/fetch-ocr-assets.sh
set -euo pipefail
VER=5.1.1
DEST="$(cd "$(dirname "$0")/.." && pwd)/vendor/tesseract"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
mkdir -p "$DEST/core" "$DEST/lang"
cd "$TMP"
npm pack "tesseract.js@$VER" "tesseract.js-core@$VER" "@tesseract.js-data/fra" >/dev/null
for t in *.tgz; do d="${t%.tgz}"; mkdir "$d"; tar xzf "$t" -C "$d"; done
cp "$(find tesseract.js-$VER -name tesseract.min.js | head -1)" "$DEST/tesseract.min.js"
cp "$(find tesseract.js-$VER -name worker.min.js | head -1)" "$DEST/worker.min.js"
find tesseract.js-core-* \( -name 'tesseract-core*.js' -o -name 'tesseract-core*.wasm' \) -exec cp {} "$DEST/core/" \;
LANGF="$(find tesseract.js-data-fra-* -path '*4.0.0_best_int*' -name fra.traineddata.gz | head -1)"
[ -z "$LANGF" ] && LANGF="$(find tesseract.js-data-fra-* -name fra.traineddata.gz | head -1)"
cp "$LANGF" "$DEST/lang/fra.traineddata.gz"
echo "Moteur OCR installé dans $DEST :"; du -sh "$DEST"/* | sed 's/^/  /'
echo "Publie ensuite le dossier vendor/ avec le reste de l'application."
