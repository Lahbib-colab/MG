#!/usr/bin/env bash
# Signe un pass Apple Wallet exporté par MG iS et produit un fichier .pkpass.
#
# Prérequis : macOS ou Linux avec openssl, zip, python3 et curl, plus un certificat
# « Pass Type ID » (.p12) créé dans ton compte Apple Developer.
#
# Usage :
#   ./sign-pkpass.sh <dossier pass> <certificat.p12> <mot de passe .p12> <Pass Type ID> <Team ID> [sortie.pkpass]
# Exemple :
#   ./sign-pkpass.sh pass MonCertificat.p12 motdepasse pass.com.exemple.mgehs ABCDE12345 permis.pkpass
#
# Variable facultative : WWDR=/chemin/AppleWWDRCAG4.pem (sinon le certificat Apple est téléchargé).
set -euo pipefail

DIR="${1:?dossier du pass}"; P12="${2:?certificat .p12}"; PW="${3:?mot de passe du .p12}"
PTID="${4:?Pass Type ID (ex. pass.com.exemple.mgehs)}"; TEAM="${5:?Team ID (10 caractères)}"
OUT="${6:-$(basename "$DIR").pkpass}"
OUT_ABS="$(cd "$(dirname "$OUT")" && pwd)/$(basename "$OUT")"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
mkdir -p "$TMP/pass"; cp -R "$DIR"/. "$TMP/pass/"

# 1) identifiants + manifest (empreintes SHA-1 de chaque fichier)
python3 - "$TMP/pass" "$PTID" "$TEAM" <<'PY'
import sys, json, hashlib, os
d, pt, tm = sys.argv[1:4]
p = json.load(open(d + '/pass.json', encoding='utf-8'))
p['passTypeIdentifier'] = pt
p['teamIdentifier'] = tm
json.dump(p, open(d + '/pass.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
m = {}
for root, _, files in os.walk(d):
    for f in files:
        if f in ('manifest.json', 'signature'):
            continue
        fp = os.path.join(root, f)
        m[os.path.relpath(fp, d)] = hashlib.sha1(open(fp, 'rb').read()).hexdigest()
json.dump(m, open(d + '/manifest.json', 'w'), indent=2)
PY

# 2) certificat Apple WWDR
WWDR="${WWDR:-}"
if [ -z "$WWDR" ]; then
  curl -fsSL https://www.apple.com/certificateauthority/AppleWWDRCAG4.cer -o "$TMP/wwdr.cer"
  openssl x509 -inform der -in "$TMP/wwdr.cer" -out "$TMP/wwdr.pem"
  WWDR="$TMP/wwdr.pem"
fi

# 3) extraction du certificat et de la clé (OpenSSL 3 : option -legacy pour les anciens .p12)
p12() { openssl pkcs12 -in "$P12" -passin "pass:$PW" "$@" 2>/dev/null || openssl pkcs12 -legacy -in "$P12" -passin "pass:$PW" "$@"; }
p12 -clcerts -nokeys -out "$TMP/cert.pem"
p12 -nocerts -passout "pass:$PW" -out "$TMP/key.pem"

# 4) signature détachée du manifest
openssl smime -binary -sign -certfile "$WWDR" -signer "$TMP/cert.pem" -inkey "$TMP/key.pem" \
  -passin "pass:$PW" -in "$TMP/pass/manifest.json" -out "$TMP/pass/signature" -outform DER

# 5) archive .pkpass
rm -f "$OUT_ABS"
( cd "$TMP/pass" && zip -q -r -X "$OUT_ABS" . )
echo "OK : $OUT_ABS créé. Envoie-le sur l'iPhone (AirDrop, Mail, Fichiers) puis ouvre-le pour l'ajouter à Wallet."
