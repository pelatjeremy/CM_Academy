# Tableau de bord du suivi documentaire

Branche de présentation : `codex/tableau-bord-suivi-documents`, depuis la version
validée `2fe718e`. Aucun déploiement, aucune migration nouvelle, aucune écriture
sur `cmh_academy_dev` ou la démonstration Railway. Aucun ajout de dépendance.

## Périmètre et calculs

Les quatre indicateurs utilisent toutes les inscriptions renvoyées par le filtre
formation/session/recherche. Le filtre d’état, le tri et la pagination de l’écran
ne modifient pas ce périmètre : cela est indiqué au-dessus des cartes et expliqué
dans leur aide. La liste, elle, applique également le filtre d’état.

- **Dossiers suivis** : une inscription = une ligne et un dossier compté, y compris
  les inscriptions dont le dossier n’est pas encore initialisé.
- **Dossiers complets** : dossier initialisé avec au moins une pièce obligatoire
  demandée, toutes les obligations validées. Les dossiers sans obligation restent
  distincts ; le calcul métier de complétude existant n’est pas modifié.
- **Pièces à vérifier** : somme des pièces demandées dont la version courante est
  à vérifier, obligatoires ou facultatives. Les anciennes versions ne s’ajoutent pas.
- **Dossiers avec pièces manquantes ou à corriger** : union des inscriptions ayant
  une obligation à transmettre ou au moins une pièce demandée à corriger. Un
  dossier avec plusieurs anomalies ne compte qu’une fois. Une correction facultative
  peut nécessiter une action sans bloquer la complétude : les cartes ne s’additionnent pas.

Un clic sur une carte change le filtre d’état de la liste. La carte « Dossiers
suivis » retire ce filtre. La réinitialisation efface tous les filtres et remet le
tri/page par défaut.

L’API existante n’étant pas paginée, les calculs restent exacts sur l’ensemble du
périmètre ; aucun total n’est calculé depuis les dix lignes affichées. Aucune API
de synthèse supplémentaire : la lecture ADMIN existante est enrichie avec les
compteurs de pièces demandées, les dates et les activités utiles. Les notes internes,
clés de stockage et historiques bruts ne sont pas exposés dans cette liste.

La dernière activité est le maximum des dates de versions, des événements du suivi
et de l’historique documentaire existant. Un dossier sans événement affiche
« Aucune activité », sans utiliser la date d’inscription comme faux dépôt.
Le panneau secondaire présente les quatre derniers dépôts et les quatre corrections
les plus récentes des résultats de la liste, toutes pages confondues.

## Navigation et présentation

Pagination locale 10/20/50 lignes ; tris par dernière activité, nom, progression
ou actions à traiter, avec ordre ascendant/descendant. Filtre, tri et page sont
sérialisés dans l’URL et conservés dans le lien de retour du détail. Le paramètre
de retour est relu avec une liste de champs autorisés ; aucune redirection externe.
La recherche accepte aussi un nom complet, en combinant les mots recherchés.

Le détail présente le stagiaire, sa formation/session et une synthèse, puis sépare
les demandes au stagiaire des documents de l’organisme. Un document déjà fourni
par l’organisme reste visible même s’il ne constitue pas une pièce attendue.
Les autres pièces non demandées restent accessibles dans un panneau replié.
La dernière version est téléchargeable directement ; configuration, fichiers,
partages et historique restent repliés par défaut. L’action « Vérifier la pièce »
ouvre la décision existante. Le motif de correction est toujours visible.
Un dépôt ADMIN actualise le détail après confirmation, sans validation automatique.

Sur mobile : navigation administrative repliable, indicateurs sur deux colonnes,
tableau défilable au clavier et au toucher, nom du stagiaire ouvrant directement
le dossier et panneau d’activité sous la liste. Aucun état ne dépend uniquement
d’une couleur. Chargement/erreur affichent des compteurs « — », jamais de faux zéros.

## Fichiers modifiés ou ajoutés

- `frontend/src/admin/SuiviDocuments.jsx` : tableau, filtres, indicateurs, tri,
  pagination, liens de retour et panneau secondaire.
- `frontend/src/admin/documents-dashboard.css` : styles limités aux vues documentaires.
- `frontend/src/admin/AdminWorkspace.jsx` : navigation mobile de ces vues.
- `frontend/src/documents/DocumentsInscription.jsx` : en-tête, synthèse, regroupement
  par origine, version courante, actions et panneaux repliés.
- `frontend/src/admin/PiecesJointes.jsx` : libellé contextuel et actualisation après dépôt.
- `shared/document-dashboard.mjs` : calculs/filtrage de présentation communs à l’API
  et à l’interface, indépendants des mutations métier.
- `backend/suivi-documents.js` : enrichissement en lecture des routes ADMIN existantes.
  Les routes d’écriture et les protections de rôle/propriété/CSRF restent identiques.
- `backend/scripts/lib/test-document-dashboard.mjs` : corpus fictif de 14 dossiers
  et assertions API/calculs/activité/filtres.
- `backend/scripts/lib/test-document-dashboard-browser.mjs` : recette navigateur et captures.
- `backend/scripts/lib/test-documents-browser.mjs` : adaptation de la recette existante
  aux nouveaux libellés et à l’ouverture explicite de la vérification.
- `backend/scripts/test-auth.mjs`, `backend/package.json` : commande et orchestration isolée.
- `backend/docs/tableau-bord-documentaire.md` : ce compte rendu.

## Vérifications reproductibles

Depuis `backend` :

```powershell
npm run test:document-dashboard
npm run test:suivi-documents:browser
```

Ces commandes créent chacune leur cluster PostgreSQL, leur stockage privé et leur
client Prisma sous `.catalogue-test/auth-*`, avec des comptes `.invalid`. Elles
n’utilisent pas le fichier `.env` ni les bases existantes. Les quinze migrations
existantes sont appliquées uniquement à ces bases isolées ; aucune migration
nouvelle n’est introduite. Les serveurs et clusters sont arrêtés en fin de test.

Vérifications réalisées :

- 14 dossiers : complets, incomplets, sans obligation, non initialisés ; facultatif
  à vérifier et facultatif à corriger, sans blocage de la complétude.
- Compteurs exacts sur plusieurs pages, union sans double compte, filtres de cartes,
  recherche nom complet, formation/session/état et dates d’activité.
- Tri nominal dans les deux sens, pagination, tableau → dossier → retour avec
  conservation exacte de l’URL, accès mobile depuis le nom du stagiaire.
- Écrans ordinateur (1680 px) et mobile (390 px), navigation repliable, clavier,
  absence de débordement global et panneau d’activité sous la liste.
- États sans résultat, sans dossier, chargement et erreur avec reprise, sur tableau
  et détail ; historiques repliés, correction visible et origines distinctes.
- Parcours ADMIN → STAGIAIRE → ADMIN : correction, remplacement, validation,
  conservation des versions/décisions ; dépôt ADMIN actualisé, ancien partage conservé
  et nouvelle version privée par défaut.
- Recette existante : lien direct après connexion, copie du lien, erreur de transfert
  conservant le fichier sélectionné, reprise et validation.
- Tests API existants : rôles/propriété/CSRF, concurrence/rejeux, formats/limite,
  transfert interrompu, nettoyage et audit sans orphelins ; aucune régression constatée.
- `npm run lint` et `npm run build` dans `frontend`, syntaxe des scripts modifiés,
  `git diff --check`.

Captures finales locales, hors Git, sous `reports/suivi-documents` :
`tableau-desktop.png`, `dossier-desktop.png`, `tableau-mobile.png`, `dossier-mobile.png`.
Les captures contiennent uniquement des données fictives.

Limites : contrôle navigateur Chrome, sans appareil mobile physique ni test de charge.
La pagination utilise la liste complète déjà fournie par l’API existante ; une future
volumétrie importante nécessiterait une pagination serveur accompagnée de compteurs
globaux, sans changer les définitions ci-dessus.

## Passe finale de lisibilité et de compacité

Textes secondaires portés à 13 px et contrastes renforcés. Le tableau affiche
« 1 / 4 validées », masque les compteurs nuls et présente les dates avec heure
française (Europe/Paris). Les sessions sont nommées par leur date, sans suffixe
technique. Un dossier complet conserve les actions facultatives, avec leur libellé
explicite dans la colonne des actions.

Les pièces ADMIN deviennent des lignes dépliables, fermées initialement. Le titre,
l’état, le caractère obligatoire/facultatif, le dernier fichier, le lien
« Consulter le document » et le motif de correction restent visibles. Le bouton
« Vérifier la pièce » ouvre directement le formulaire de décision. La configuration,
les versions/partages et l’historique restent repliés. Dans chaque origine, ordre :
à vérifier, à corriger, à transmettre, validé. Le parcours stagiaire est conservé.

Nouvelle recette isolée réussie : `auth-99jZ0A` (tableau, mobile, clavier,
compteurs, ordre, accordéons et validation), puis `auth-HszXdG` (régression
existante avec configuration, transfert interrompu, remplacement et validation).
Lint et build frontend réussis. Captures remplacées dans le répertoire indiqué
ci-dessus. Aucune modification de base existante, aucun déploiement.

## Publication de la démonstration — 12 novembre 2026

Commit applicatif publié et déployé : `35482b811c4e1679ccc5652435b4e8047c20e0d2`.
Railway : déploiement `81426ad6-beb1-4b59-9b58-2263aa7799cc`, état SUCCESS,
branche `codex/tableau-bord-suivi-documents`, environnement demonstration.
URL : https://cmh-academy-demo-demonstration.up.railway.app

Aucune migration nouvelle ni réinitialisation. Même service, volumes, variables
et commandes. Aucun réensemencement, compte, fichier ou état documentaire ajouté.
La base locale existante n’a pas été utilisée. La source reste épinglée au commit
applicatif ; la correction des sélecteurs de recette ne nécessite pas de déploiement.

Recette exécutée : `node scripts/test-dashboard-deployed.mjs --baseline` avant
bascule, puis `node scripts/test-dashboard-deployed.mjs` après déploiement.
Résultat final réussi après correction de deux sélecteurs de test (pagination et
motif également présent dans l’historique replié), sans changement applicatif.

- Connexion ADMIN réelle au clavier ; indicateurs 2 dossiers, 1 complet,
  1 pièce à vérifier, 1 dossier manquant/à corriger.
- Recherche, formation, session, états, pagination et retour avec filtres conservés.
- Tri des états, séparation stagiaire/organisme, lignes fermées initialement,
  motif visible, téléchargement réel et formulaire de vérification ouvert.
- Ordinateur 1680 px, mobile 390 px, navigation clavier, dates avec heure,
  absence de débordement global ; captures inspectées.
- Espace stagiaire, lien direct après connexion, téléchargements des versions,
  refus anonyme et isolation entre les deux stagiaires.
- Comparaison des règles, états, historiques, versions, partages et SHA256 des
  fichiers avant/après identique. 3 comptes, 2 inscriptions, 9 fichiers référencés,
  15 migrations aux empreintes conformes ; audit stockage entièrement à zéro.

Limites : seulement deux inscriptions existantes, donc une page. La seconde page
et le cas complet avec correction facultative ont été validés en environnement
isolé ; aucune donnée distante n’a été ajoutée pour les reproduire. Le formulaire
de vérification a été ouvert sans enregistrer de décision, afin de conserver les
états existants. Aucun appareil mobile physique.

Rapport et captures privés hors Git : `.demo-environment/dashboard-release/`.
