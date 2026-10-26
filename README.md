# MG EHS – Carnet de bord (application installable)

## Fichiers (tous à la racine, au même niveau)
- `index.html` : l'application
- `manifest.webmanifest`, `sw.js` : installation sur l'écran d'accueil et mode hors ligne
- `icon-192.png`, `icon-512.png`, `apple-touch-icon.png`, `favicon.png` : icônes

## Publier avec GitHub Pages
1. Crée un dépôt (par exemple `MG-EHS`) et envoie tous les fichiers à la racine.
2. Dépôt > Settings > Pages > Source : branche `main`, dossier `/ (root)`.
3. Ouvre l'adresse `https://TON-PSEUDO.github.io/MG-EHS/` sur ton iPhone, dans Safari.

## Installer sur l'iPhone
Safari > bouton Partager > « Sur l'écran d'accueil ». L'app s'ouvre en plein écran, sans barre d'adresse.

## À savoir
- Les données restent sur l'appareil (stockage local). Fais une sauvegarde dans Réglages > Données avant de changer d'adresse ou d'appareil : chaque adresse a ses propres données.
- Le HTTPS est requis pour la localisation et le mode hors ligne (GitHub Pages le fournit).
- Pour publier une mise à jour, remplace `index.html` et change `mg-ehs-v2` en `mg-ehs-v3` dans `sw.js`.
