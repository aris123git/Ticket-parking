# ParkFlow — Caisse parking (logiciel Windows) + supervision web

ParkFlow est un **logiciel de caisse**, comme une gestion commerciale ou une caisse de maquis : il s’installe sur l’ordinateur du parking, s’ouvre par un raccourci bureau, et continue de vendre même sans Internet.

Ce n’est pas un site web à ouvrir dans Chrome pour encaisser.

- **ParkFlow Caisse** = application Windows (`.exe`) installée dans chaque parking
- **ParkFlow Supervision** = site web du propriétaire, pour consulter les parkings à distance

Internet n’est jamais requis pour encaisser. La connexion sert uniquement à synchroniser les données vers le serveur central.

## Architecture

```
LOGICIEL PARKING (caisse locale)
        ↓
  SQLite locale (ventes, tarifs, caissiers, audit)
        ↓
  Service de synchronisation (file d’attente + retry)
        ↓
  API serveur (auth installation + auth propriétaire)
        ↓
  SQLite / PostgreSQL-ready (base centrale)
        ↓
  Site web propriétaire (supervision, pas de caisse)
```

| Couche | Rôle | Tech |
|---|---|---|
| `apps/local` | Caisse hors ligne, impression thermique, admin parking | Express + SQLite + React |
| `apps/cloud` | API centrale + dashboard propriétaire multi-parkings | Express + SQLite + React |
| `packages/shared` | Argent FCFA, dates, tickets ESC/POS, validation des références | TypeScript |

Chaque installation génère un identifiant long (`park_` + 48 hex) et une clé API. Le serveur n’accepte une synchro que si **l’identifiant et la clé** correspondent. Un propriétaire ne voit que les parkings qu’il a associés via un code d’appariement.

## Créer le fichier .exe (Windows)

Deux façons :

### 1. Un clic sur GitHub (recommandé)

1. Ouvrir le dépôt → onglet **Actions**
2. Choisir **Build Windows EXE**
3. Cliquer **Run workflow**
4. Télécharger l’artifact `ParkFlow-Caisse-Windows`
5. Installer `ParkFlow Caisse-1.0.0-win.exe` sur l’ordinateur de caisse (raccourci bureau)

### 2. Sur un PC Windows

Double-cliquer sur `creer-exe-windows.bat` (Node.js LTS doit être installé : https://nodejs.org/).

Les `.exe` apparaissent dans `apps/local/release/` :

- **ParkFlow Caisse-1.0.0-win.exe** — installateur (raccourci menu Démarrer + bureau)
- **ParkFlow-Caisse-Portable.exe** — version sans installation

Les ventes sont enregistrées dans `%APPDATA%\ParkFlow Caisse\` : désinstaller le logiciel ne doit pas effacer l’historique.

## Démarrage en mode développement

```bash
npm install
npm run dev
```

- Caisse locale : http://127.0.0.1:5173 (API : 3100)
- Supervision : http://127.0.0.1:5174 (API : 3200)

Comptes de démonstration :

| App | Identifiant | Mot de passe |
|---|---|---|
| Caisse | `caissier` | `caissier123` |
| Admin parking | `admin` | `admin123` |
| Propriétaire web | `proprio@parking.local` | `proprio123` |

Pour associer le logiciel local au compte propriétaire : écran **Synchronisation** du logiciel local → copier le code → **Associer une installation** sur le site web.

## Impression thermique

Cibles supportées (réglables par l’administrateur) :

- **preview** — aperçu + fichier `last-ticket.txt` (défaut, sans imprimante)
- **network** — imprimante ESC/POS en TCP (port 9100)
- **file** — périphérique (`/dev/usb/lp0`, fichier raw Windows, etc.)
- **windows** — imprimante installée sur le PC, par son nom (comme en gestion commerciale)

Largeurs 58 mm (32 colonnes) et 80 mm (48 colonnes). Les accents sont convertis en ASCII avant envoi. Pas de QR code.

La caisse fonctionne comme une gestion commerciale : tarif → paiement (espèces / Orange Money / Moov Money / carte) → ticket. Réimpression du dernier ticket, rapport Z imprimable, sauvegarde ZIP de la base SQLite.

Numérotation des tickets : `YYYYMM-000001` (compteur mensuel, transaction SQLite, pas de doublon hors ligne).

Au premier lancement, un assistant demande le nom du parking et impose de changer le mot de passe administrateur (`admin123` n’est plus accepté ensuite).

## Déploiement cloud (supervision)

Le serveur `apps/cloud` se lance avec `npm run start -w apps/cloud` après `npm run build -w apps/cloud`. Variables :

- `CLOUD_PORT` (défaut 3200)
- `CLOUD_JWT_SECRET`
- `CLOUD_DATA_DIR`

Le logiciel local pointe vers l’URL publique via **Parking → URL serveur de supervision**.

## Règles métier respectées

- Tarifs en base, jamais codés en dur
- Prix figé sur chaque vente (historique des tarifs)
- Caissier : vente + impression uniquement
- Admin : tarifs, utilisateurs, annulation, remboursement, caisse, imprimante, journal, sync
- Aucune suppression silencieuse : statut + journal d’audit
- Mode hors ligne + retry automatique
