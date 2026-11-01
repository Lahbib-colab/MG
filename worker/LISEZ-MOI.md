# Ajouter ses cartes à Apple Wallet depuis MG iS

Apple n'accepte dans Wallet que des passes **signés** avec un certificat de ton compte Apple Developer. Ce dossier permet de le faire **une fois pour toutes**, puis le bouton « Ajouter à Apple Wallet » de l'app génère la carte et l'ouvre dans Wallet en un geste.

Il te faut :
- un compte **Apple Developer Program** (payant, environ 99 USD par an : à vérifier sur developer.apple.com) ;
- un compte **Cloudflare** gratuit (Workers) pour héberger le petit service de signature ;
- un ordinateur avec `openssl` (macOS, Linux ou Windows avec Git Bash) pour préparer les fichiers, une seule fois.

## 1. Certificat Apple (≈ 10 min)
1. Sur developer.apple.com > *Certificates, Identifiers & Profiles* > **Identifiers** > « + » > **Pass Type IDs** : crée un identifiant, par exemple `pass.com.tonnom.mgehs`.
2. Dans ce dossier : `./make-pem.sh csr` (crée `pass.key` et `pass.csr`).
3. Dans Apple : ouvre ton Pass Type ID > **Create Certificate** > envoie `pass.csr` > télécharge le certificat (`pass.cer`).
4. `./make-pem.sh pem pass.cer` (crée `pass.pem` et télécharge `wwdr.pem`).
5. Note aussi ton **Team ID** (10 caractères, en haut à droite de ton compte Developer).

## 2. Service de signature (≈ 5 min)
1. Sur dash.cloudflare.com > *Workers & Pages* > **Create** > **Hello World** > nomme-le, puis **Deploy**.
2. **Edit code** : remplace tout par le contenu de `sign-pass-worker.js` > **Deploy**.
3. *Settings* > *Variables and Secrets* : ajoute (type « Secret ») :
   - `PASS_CERT_PEM` = contenu de `pass.pem`
   - `PASS_KEY_PEM` = contenu de `pass.key`
   - `WWDR_PEM` = contenu de `wwdr.pem`
   - `PASS_TYPE_ID` = `pass.com.tonnom.mgehs`
   - `TEAM_ID` = ton Team ID
   - `TOKEN` = un mot de passe de ton choix (long)
   - facultatif : `ALLOW_ORIGIN` = l'adresse de ton app (ex. `https://tonnom.github.io`)
4. Note l'adresse du Worker (`https://….workers.dev`).

## 3. Dans l'app
Wallet > carte > **Exporter** > **Ajouter à Apple Wallet** > saisis l'adresse du Worker et le jeton > **Enregistrer**. Ensuite, un tap génère le pass signé et l'ouvre dans Wallet.

## Confidentialité et sécurité
- Le service ne conserve rien : il reçoit le contenu du pass, le signe et le renvoie. Les scans de documents ne sont jamais envoyés.
- Ta clé privée reste dans les secrets Cloudflare. Le jeton évite que d'autres utilisent ton service.
- Le certificat Apple a une durée limitée : à renouveler avant expiration.

## Sans compte Apple Developer
Utilise « Image de la carte » (PNG) à enregistrer dans Photos ou Fichiers, ou une app tierce de cartes qui signe les passes à ta place (en lui confiant les données de la carte).
