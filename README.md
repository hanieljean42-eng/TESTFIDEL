# Test de Fidélité

Application Node.js permettant aux utilisateurs de s'inscrire/se connecter et de passer un test de fidélité. Les résultats sont enregistrés en base. Un tableau de bord Admin permet de consulter les résultats, filtrer par date, exporter en CSV et gérer dynamiquement les questions du test.

## Fonctionnalités
- Authentification (inscription, connexion, déconnexion)
- Mot de passe fixe côté serveur (par défaut: `200700`, configurable)
- Test de fidélité (échelle 1–5 par défaut), score calculé
- Sauvegarde des résultats (SQLite)
- Tableau Admin (réservé à l'admin) avec:
  - Filtre par date, export CSV
  - Édition des questions (CRUD simple)
- Notification email au créateur à chaque résultat (si SMTP configuré)

## Stack
- Node.js + Express
- SQLite (fichier `data.sqlite` crée automatiquement au runtime)
- Sessions: `express-session` (MVP)

## Prérequis
- Node.js 18+ recommandé

## Variables d'environnement
- Obligatoires (prod recommandé):
  - `ADMIN_EMAIL` (ex: `hanieljean42@gmail.com`) – l'utilisateur avec cet email est admin
  - `SESSION_SECRET` – valeur aléatoire forte pour signer la session
- Optionnelles:
  - `FIXED_PASSWORD` – mot de passe requis côté serveur (défaut: `200700`)
  - SMTP pour l'email admin (optionnel):
    - `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE` (`true`/`false`)
    - `SMTP_USER`, `SMTP_PASS`
    - `MAIL_FROM`

## Installation (local)
```bash
npm install
```

## Lancement (local)
```bash
# PowerShell (exemple)
$env:ADMIN_EMAIL="hanieljean42@gmail.com"
$env:SESSION_SECRET="votre_secret_fort"
node server.js
# Ouvrir: http://localhost:4000
```

## Déploiement (Docker)
Un `Dockerfile` est fourni.
```bash
# Build
docker build -t fidelite-test .

# Run (exemple)
docker run -p 4000:4000 \
  -e ADMIN_EMAIL=hanieljean42@gmail.com \
  -e SESSION_SECRET="votre_secret_fort" \
  -e FIXED_PASSWORD=200700 \
  fidelite-test
```

## Endpoints principaux
- Pages:
  - `GET /` – Accueil
  - `GET /register` – Inscription
  - `GET /login` – Connexion
  - `GET /test` – Passer le test (auth requis)
  - `GET /admin` – Tableau de bord (admin requis)
- API (extrait):
  - `POST /api/register`, `POST /api/login`, `POST /api/logout`
  - `GET /api/test` (questions), `POST /api/test` (soumission)
  - Admin:
    - `GET /api/admin/results?from=YYYY-MM-DD&to=YYYY-MM-DD&csv=1`
    - `GET /api/admin/questions`, `POST /api/admin/questions`

## Rôles et accès
- Admin: utilisateur dont l'email correspond à `ADMIN_EMAIL`. Accès `/admin` et APIs admin.
- Utilisateurs: accès au test après connexion.

## Notes de sécurité (prod)
- Définir un `SESSION_SECRET` robuste et activer `cookie.secure` derrière HTTPS.
- Envisager un store de session persistant (Redis/SQLite) en prod.
- Restreindre l'accès à `/admin` (déjà protégé côté serveur) et utiliser HTTPS.

## Structure du projet
```
.
├─ server.js
├─ package.json
├─ Dockerfile
├─ .gitignore
├─ public/
│  ├─ index.html
│  ├─ login.html
│  ├─ register.html
│  ├─ test.html
│  └─ admin.html
└─ src/
   └─ db.js
```

## Licence
MIT
