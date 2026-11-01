#!/usr/bin/env bash
# Prépare les fichiers PEM pour le service de signature, sans Trousseau d'accès ni Mac.
# Étape 1 : ./make-pem.sh csr             -> crée pass.key (à garder secrète) et pass.csr (à envoyer à Apple)
# Étape 2 : ./make-pem.sh pem pass.cer    -> convertit le certificat reçu d'Apple en pass.pem et télécharge le certificat WWDR
set -euo pipefail
case "${1:-}" in
  csr)
    openssl req -new -newkey rsa:2048 -nodes -keyout pass.key -out pass.csr -subj "/CN=MG iS Wallet/O=MG iS"
    echo "OK : pass.csr créé (à envoyer à Apple pour ton Pass Type ID). Garde pass.key : il sert à signer." ;;
  pem)
    CER="${2:?usage : ./make-pem.sh pem pass.cer}"
    openssl x509 -inform der -in "$CER" -out pass.pem 2>/dev/null || cp "$CER" pass.pem
    curl -fsSL https://www.apple.com/certificateauthority/AppleWWDRCAG4.cer -o wwdr.cer
    openssl x509 -inform der -in wwdr.cer -out wwdr.pem
    echo "OK : pass.pem, pass.key et wwdr.pem sont prêts."
    echo "Colle leur contenu dans les variables PASS_CERT_PEM, PASS_KEY_PEM et WWDR_PEM de ton Worker Cloudflare." ;;
  *) echo "Usage : ./make-pem.sh csr   puis   ./make-pem.sh pem pass.cer"; exit 1 ;;
esac
