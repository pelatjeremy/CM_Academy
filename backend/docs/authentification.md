# Authentification administrateur — 24 octobre 2026

Implémentation Express/React locale, migration appliquée à `cmh_academy_dev`.
**Aucun compte n'a été créé dans cette base.** Les comptes et mots de passe
aléatoires utilisés pour les tests appartiennent uniquement à des clusters isolés.
Aucun déploiement.

## Créer le premier compte

Dans un terminal PowerShell interactif, depuis la racine du projet :

```powershell
cd backend
npm run admin:create
```

Le script demande une adresse email et deux saisies masquées du mot de passe
(12 à 128 caractères). Il normalise l'email, hache le mot de passe avec Argon2id,
et crée un compte ADMIN actif. Aucun identifiant par défaut, aucun mot de passe
en argument de commande ou dans les logs. Il refuse une destination distante
ou une base différente de `cmh_academy_dev`, et refuse de créer un second
administrateur. La transaction Serializable protège aussi deux lancements
concurrents. Une adresse déjà utilisée n'est jamais promue ni remplacée.

Puis lancer le projet dans deux terminaux, si les serveurs ne tournent pas déjà :

```powershell
cd backend
npm run dev
```

```powershell
cd frontend
npm run dev
```

Ouvrir http://127.0.0.1:5173/admin/connexion, se connecter, vérifier l'email
affiché, actualiser, puis se déconnecter. Ouvrir directement `/admin` après
déconnexion doit ramener à la connexion. Le catalogue `/` reste public.
Le script de création ne remplace pas un outil de récupération de compte.

## Bibliothèques et choix

- [express-session](https://expressjs.com/en/resources/middleware/session/) :
  sessions opaques, cookie signé et rotation par `regenerate` à la connexion.
- [connect-pg-simple](https://github.com/voxpelli/node-connect-pg-simple) :
  persistance PostgreSQL, table versionnée AuthSession, aucune création DDL au
  démarrage. Le catalogue public ne dépend pas du middleware de session.
- [node-argon2](https://github.com/ranisalt/node-argon2) : Argon2id avec paramètres
  de hachage de la bibliothèque. Aucun mécanisme cryptographique réimplémenté.
- [csrf-sync](https://github.com/Psifi-Solutions/csrf-sync) : jeton synchronisé
  lié à la session, envoyé dans `x-csrf-token`, renouvelé après connexion.
- [express-rate-limit](https://express-rate-limit.mintlify.app/overview) :
  limitation distincte par IP et par email normalisé (clé hachée en mémoire).
- Zod valide les entrées ; @inquirer/prompts assure les saisies locales masquées.

Le secret SESSION_SECRET a été généré aléatoirement dans le fichier backend/.env
local, sans affichage. Il n'est ni dans le frontend ni versionné. Le démarrage
refuse un secret de moins de 32 caractères. Le conserver entre redémarrages ;
le remplacer invalide les cookies existants.

## Modèle et routes

Utilisateur contient id TEXT/cuid, email normalisé unique, motDePasseHash,
role ADMIN/MEMBRE (MEMBRE par défaut), actif et horodatages. AuthSession suit
le format de connect-pg-simple : sid, sess JSON, expire, avec index d'expiration.
Les identifiants de session restent dans le cookie HttpOnly et en base, jamais
dans les réponses JSON. Le JSON de session contient l'identifiant utilisateur,
la limite d'expiration et le jeton CSRF, sans mot de passe ni hash.

| Route | Comportement |
| --- | --- |
| GET /api/auth/csrf | Fournit un jeton CSRF, lié à une session anonyme courte |
| POST /api/auth/connexion | Validation, limitation, CSRF, vérification Argon2id, rotation de session |
| GET /api/auth/moi | Identité et jeton CSRF ; 401 sans session valide |
| POST /api/auth/deconnexion | Session valide et CSRF obligatoires ; suppression de la session et du cookie |
| GET /api/admin/moi | 401 sans session valide ; 403 si rôle non ADMIN |
| /api/admin/* | Périmètre serveur : authentification, rôle ADMIN et CSRF pour les méthodes modifiant l'état |

Aucune route d'inscription ni endpoint de création d'administrateur. Aucune
route de CRUD catalogue ajoutée. Les réponses d'identité sont limitées à
id/email/role ; seul le jeton **CSRF**, distinct du cookie de session, est lisible
par React et conservé temporairement en mémoire. Aucun localStorage/sessionStorage.
Toutes les réponses d'authentification portent Cache-Control: no-store.

Expiration absolue après 8 heures pour une session connectée, 10 minutes pour
une session anonyme. Pas de prolongation glissante. Les lignes expirées sont
purgées périodiquement par le store ; elles sont refusées même avant la purge.
La déconnexion détruit la ligne. La suppression d'une ligne AuthSession révoque
également son cookie. Le rôle et l'état actif sont relus à chaque accès protégé :
un utilisateur désactivé ou supprimé est refusé immédiatement, puis sa session
détruite. Aucun rôle de session mis en cache.

Les routes mutantes exigent à la fois un Origin autorisé et le jeton CSRF de
la session ; Sec-Fetch-Site: cross-site est refusé. La connexion elle-même est
protégée, pour empêcher aussi une connexion forcée sur un autre compte.
Les erreurs d'identifiants sont génériques ; un compte inexistant subit lui
aussi une vérification Argon2. Les erreurs techniques brutes ne sont pas loguées.

Limites locales : 8 échecs par adresse et 30 par IP sur 15 minutes ; HTTP 429
au-delà, avec message générique. Les réussites ne consomment pas ces quotas.
Ces compteurs utilisent la mémoire du processus, adaptée au serveur unique
actuel : ils sont remis à zéro au redémarrage. Avant un fonctionnement avec
plusieurs instances, il faudra un stockage de quotas partagé.

## Configuration de production, sans déploiement ici

Cookie de développement : cmh.sid, HttpOnly, SameSite=Lax, HTTP local permis.
Cookie en NODE_ENV=production : __Host-cmh.sid, Secure, HttpOnly, SameSite=Lax,
Path=/ et aucun Domain. HTTPS est donc obligatoire.

APP_ORIGINS doit alors énumérer les origines HTTPS exactes autorisées, séparées
par des virgules. En développement, les deux origines localhost:5173 et
127.0.0.1:5173 sont permises par défaut. Aucun proxy n'est implicitement fiable.
Si TLS se termine sur un reverse proxy connu, configurer TRUSTED_PROXY avec sa
plage réelle (par exemple loopback pour un proxy local) ; ne pas faire confiance
aux en-têtes d'un client Internet direct. Aucun CORS public n'est activé.

Les connexions Prisma et celles du store de sessions utilisent UTC. Le fuseau
d'affichage des séances reste indépendant. SESSION_SECRET reste un secret serveur.
Le frontend et l'API doivent être servis sous la même origine avec le proxy /api,
comme dans le développement actuel.

## Migration locale et sauvegarde

Nouvelle migration : `20261024180000_authentification`. Les deux migrations
catalogue déjà appliquées n'ont pas été modifiées ; leurs checksums ont été
comparés à l'historique PostgreSQL avant application.

Sauvegarde privée :
`backend/.local-backups/auth-20261024-GiTGW3/avant-auth.dump`.
L'archive a été listée, puis restaurée réellement dans un nouveau cluster.
Les sept tables métier du catalogue et l'historique ont été comparés à l'original.
Après contrôle de la destination locale et absence de divergence, application
par prisma migrate deploy puis prisma generate. Trois migrations terminées,
diff PostgreSQL/Prisma vide ; catalogue conservé et aucun utilisateur créé.

Le script `scripts/apply-auth-local.mjs` conserve cette procédure et ses
garde-fous ; il n'est pas à relancer sur une base déjà migrée. Aucun reset,
db push ou retour arrière destructif automatique. En cas d'incident, conserver
les diagnostics locaux masqués et décider d'une correction ou restauration
après examen ; ne pas supprimer les tables d'authentification renseignées.

## Tests réellement exécutés

```powershell
# Depuis backend, nouveaux clusters isolés sans chargement du .env local :
npm run test:auth
npm run test:catalogue
# Depuis frontend :
npm run lint
npm run build
```

Tests SQL/API réussis :

- Migration réelle, client isolé généré, emails normalisés/uniques et Argon2id.
- Fonction utilisée par le script local : premier admin créé, second refusé.
- Identifiants valides, incorrects, inexistants et compte inactif.
- Accès anonyme 401, membre 403, changement de rôle et désactivation immédiats.
- Cookie et jeton CSRF changés à la connexion ; ancien cookie refusé.
- Session toujours valide après redémarrage du serveur isolé.
- Expiration en base, expiration absolue et révocation refusées.
- Déconnexion sans CSRF, ancien CSRF ou origine étrangère refusées ; déconnexion
  valide détruisant réellement la ligne et empêchant le rejeu du cookie.
- Limitation par email puis par IP ; cookie Secure et préfixe __Host- en production.
- Catalogue anonyme inchangé, brouillons cachés et aucune inscription publique.

Parcours navigateur réellement effectué sur l'instance isolée : connexion avec
un mot de passe aléatoire fictif, arrivée dans /admin, identité conservée après
rechargement, déconnexion, accès anonyme redirigé, bouton Afficher/Masquer.
Aucun secret de test affiché dans les sorties. Résultats locaux :
`.catalogue-test/auth-kGJtza/browser-results.json` et
`.catalogue-test/auth-CIFAGm/auth-results.json`.

La suite catalogue complète a également repassé sur une instance isolée
(`.catalogue-test/run-WbNGPL/resultats.json`). Lint et build réussis ; scan des
sources et du build frontend sans secret backend ni hash ; aucun stockage Web.
Sur la vraie base locale : identité PostgreSQL/UTC vérifiée, catalogue HTTP 200,
routes admin anonymes HTTP 401, formulaire accessible, zéro utilisateur.

Limites de la campagne : pas de compte créé ni de connexion réussie sur la base
locale puisque le mot de passe doit être choisi par l'utilisateur. La saisie
masquée du terminal utilise la bibliothèque maintenue ; sa fonction de création
a été testée sur la base isolée. Pas de récupération de mot de passe, email,
CRUD ou déploiement dans ce périmètre.

## Fichiers concernés

- Backend : app.js, server.js, auth/index.js, auth/passwords.js, auth/provision-admin.js.
- Modèle : prisma/schema.prisma, prisma/baselines/catalogue.prisma, nouvelle migration auth.
- Scripts : create-admin.mjs, test-auth.mjs, lib/isolated-db.mjs, apply-auth-local.mjs ;
  test-catalogue.mjs adapté au nouveau secret de session.
- Dépendances et commandes : backend/package.json, package-lock.json.
- Configuration : backend/.env local (secret non affiché), .env.example, .gitignore.
- Frontend : src/components/Admin.jsx, src/App.jsx, src/App.css.
- Documentation : ce fichier et README.md.
