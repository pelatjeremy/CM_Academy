# Administration des formations — 25 octobre 2026

Bloc Catalogue → Formations ajouté au socle Express/Prisma/React existant.
**Aucune migration, nouvelle dépendance ou donnée fictive dans cmh_academy_dev.**
Les champs et relations existaient déjà. Aucun déploiement.

## Parcours

La liste `/admin/catalogue/formations` propose recherche, pagination de 20
résultats et filtres combinables par pôle et publication. Les états Brouillon
et Publiée sont affichés, ainsi que le pôle et un tarif lisible : non renseigné,
gratuit, ou montant et devise.

Le formulaire de création/modification est organisé en six sections :
Présentation, Programme, Organisation, Tarification, Suivi documentaire,
Publication. Il réutilise les champs et styles communs aux pôles/formateurs.
Chargement, erreurs de champs, confirmation de sauvegarde et conservation de
la saisie en cas d'échec sont prévus. La sortie d'une saisie modifiée utilise
désormais un dialogue HTML intégré, commun à toute l'administration : rester
sur la fiche ou quitter sans enregistrer. Fermeture/rechargement restent
protégés par beforeunload lorsque le navigateur l'autorise.

Seul le titre est requis pour un brouillon. Slug, pôle, format, durée, tarif
et formateurs peuvent rester non renseignés. Les textes non renseignés valent
une chaîne vide. Les valeurs saisies restent néanmoins validées : slug bien
formé et unique, références existantes, durée entière positive, etc.

La publication est une action distincte de l'enregistrement. Elle exige :

- Titre et slug unique ; description de présentation.
- Objectifs, programme, public et prérequis explicités. « Aucun prérequis »
  convient si c'est bien la règle de la formation ; aucun texte n'est inventé
  automatiquement pour satisfaire ce contrôle.
- Format, durée positive, pôle existant et au moins un formateur existant.

Le résumé, le tarif et les informations de financement peuvent rester vides.
Le bilan des éléments manquants et les explications près des champs permettent
de préparer la fiche progressivement. La validation serveur reste décisive.
Il faut enregistrer avant de publier/dépublier. Une fiche publiée ne peut être
enregistrée en retirant un élément obligatoire : la dépublier d'abord.
La dépublication conserve la fiche et ses associations, en brouillon.

## API, sécurité et intégrité

Toutes les routes suivantes sont sous les protections existantes de session,
rôle ADMIN et CSRF sur les écritures :

| Route | Action |
| --- | --- |
| GET /api/admin/formations?q=...&page=1&poleId=...&publication=brouillon | Liste paginée ; publication peut aussi valoir publiee ; omettre pour tous les états |
| GET /api/admin/formations/options | Pôles id/titre et formateurs id/nom pour les associations |
| GET /api/admin/formations/:id | Fiche, associations et bilan de publication |
| POST /api/admin/formations | Création toujours en brouillon |
| PUT /api/admin/formations/:id | Remplacement des champs autorisés et des associations |
| POST /api/admin/formations/:id/publication | Changement explicite du booléen publiee |

La création et la modification acceptent seulement les champs du formulaire
et `formateurIds`. La modification exige aussi `updatedAt`. La route de
publication accepte seulement `publiee` et `updatedAt`. Un `publiee` envoyé à
la route de création ou de sauvegarde est refusé. Pas de DELETE ou PATCH.

Les formateurs sélectionnés ne doivent pas se répéter (422 sinon). Les
références inexistantes sont refusées avant l'enregistrement. La formation
et les lignes FormationFormateur sont enregistrées dans **une transaction**.
Le remplacement des lignes de liaison ne supprime aucune formation ou fiche
formateur. Le slug reste unique en base, y compris lors d'écritures concurrentes.

Concurrence : la version `updatedAt` lue doit être renvoyée à chaque PUT ou
changement de publication. Une mise à jour conditionnelle atomique contrôle
id + updatedAt ; la nouvelle valeur avance d'au moins une milliseconde.
Les transactions Serializable sont reprises de façon bornée si nécessaire.
Une version périmée reçoit 409 et `code: CONFLICT`, sans écrasement ou changement
des associations. L'interface conserve la saisie et propose de recharger
explicitement la fiche, avec confirmation si des modifications restent en cours.
Les futurs scripts d'écriture devront aussi respecter la convention updatedAt ;
la protection ne prétend pas détecter une écriture SQL externe qui la contourne.

Les DTO administrateur utilisent des sélections explicites et ne chargent
jamais les sessions ou leurs accès privés. Les formateurs associés n'exposent
que id/nom. Le contrat public demeure exactement :

```json
{ "formations": [{ "id": "…", "titre": "…", "description": "…" }] }
```

`GET /api/formations` conserve son filtre publiee=true. Les anciennes fiches
publiées ne sont pas modifiées ou automatiquement dépubliées par cette étape.
Aucune route de sessions, inscriptions, paiements, images ou modules ajoutée.

## Montants et validation

Le tarif de l'API est **une chaîne décimale ou null**, jamais un nombre JSON :
`null` = non renseigné, `"0.00"` = gratuit. L'entrée accepte virgule ou point,
sans signe négatif, sans notation scientifique et avec deux décimales maximum.
Une entrée à trois décimales est rejetée plutôt qu'arrondie. Exemple :
`"1234,56"` est conservé en Decimal puis renvoyé sous la forme `"1234.56"`.
La limite reste DECIMAL(12,2), soit 9 999 999 999,99. Aucun Number/parseFloat
pour le tarif côté navigateur ou serveur. Une devise vide/omise reprend EUR ;
une devise renseignée doit avoir trois lettres majuscules.

Les limites applicatives des textes sont indiquées dans formation-fields.js
et contrôlées côté serveur : titre/slug 160, résumé 1 000, description/objectifs
5 000, programme 10 000, public/prérequis/financement 3 000 caractères. Le corps
JSON est limité à 128 ko pour ces contenus Unicode. Maximum 100 formateurs
associés, sans doublon. La durée utilise les minutes entières (840 = 14 heures).
Le parcours documentaire reste indépendant du format et n'engendre aucun document.

Codes : 401 sans session, 403 rôle/CSRF/origine non autorisés, 404 fiche absente,
422 validation, 409 slug utilisé ou version périmée, 405 action non développée.
Aucun diagnostic SQL ou secret n'est renvoyé.

## Tests réellement exécutés

```powershell
# Depuis backend, sur des clusters neufs isolés sans chargement de .env :
npm run test:formations
npm run test:catalogue
# Depuis frontend :
npm run lint
npm run build
```

`test:formations` inclut les régressions de l'authentification, des pôles et des
formateurs. Dernier résultat SQL/API :
`.catalogue-test/auth-Bzhbq6/auth-results.json` ; régression du socle catalogue :
`.catalogue-test/run-TUrWX1/resultats.json`.

Essais SQL/API réussis : brouillons minimaux et modifications, défaut de devise,
associations sans doublons, validation et références inexistantes, doublons de
slug en création/modification, aucun enregistrement partiel en cas d'erreur,
précision monétaire et distinction gratuit/non renseigné, refus de publication
incomplète, publication/dépublication reflétées par l'API publique, refus des
modifications incomplètes d'une fiche publiée, 401/403/CSRF, conflits de version
en sauvegarde et publication, deux PUT simultanés donnant 200 et 409,
recherche/filtres combinés/pagination, options sûres et suppression refusée.
Une session fictive avec accès privé, uniquement en base isolée, a permis de
vérifier que son lien n'apparaît dans aucun DTO de formation.

Parcours navigateur réel sur la campagne isolée auth-Vvbm9c :

- Création titre seul, sauvegarde du brouillon et publication incomplète refusée.
- Complétion des sections, association d'un pôle et de deux formateurs,
  tarif `0,00` conservé exactement et parcours documentaire activé.
- Publication, affichage dans le catalogue React public, rechargement.
- Deux onglets : sauvegarde du premier, conflit du second avec saisie conservée.
- Dépublication puis disparition du catalogue React public.
- Dialogue intégré : annuler conserve la saisie, confirmer permet de quitter.
- Recherche, filtres et état vide ; liste et formulaire à 390 px sans débordement.

Résultats et capture :
`.catalogue-test/auth-Vvbm9c/formations-browser-results.json` et
`.catalogue-test/auth-Vvbm9c/formations-admin.png`.
Un blocage de l'outil sur une ancienne confirmation native a été résolu avec
l'aide de l'utilisateur ; les contrôles du dialogue intégré ont ensuite réussi.
Les artefacts et identifiants fictifs restent privés et ignorés par Git.
Les clusters de test ont été arrêtés après les essais.

Lint et build réussis. Contrôle de développement en lecture seule : zéro
formation, pôle et formateur ; aucune donnée fictive ajoutée. API administrateur
anonyme 401 et catalogue public HTTP 200 directement et via Vite. Les serveurs
locaux sont relancés. Aucun test de charge ou gestion de sessions pédagogiques
n'est inclus dans cette étape.

## Guide manuel

1. Se connecter à http://127.0.0.1:5173/admin/connexion, puis Catalogue → Formations.
2. Créer une vraie formation avec son titre seulement ; enregistrer le brouillon.
3. Compléter progressivement les six sections. Laisser le tarif vide ou saisir
   0,00 selon le cas réel ; sélectionner le pôle et les formateurs existants.
4. Essayer de publier une fiche incomplète, puis la compléter, enregistrer et
   publier. Vérifier son apparition sur le catalogue public. Dépublier doit la
   retirer du public tout en conservant sa fiche admin.
5. Ouvrir une même fiche dans deux onglets : sauvegarder le premier, modifier
   le second. Le second doit signaler un conflit et conserver la saisie.
6. Modifier sans enregistrer puis changer de rubrique : tester Rester et Quitter.

Pour des données fictives, utiliser exclusivement `npm run test:formations -- --browser`
et l'URL isolée affichée par le script. Il reste disponible jusqu'à création
du fichier stop-browser dans son dossier de campagne. Ne pas créer ces jeux
de démonstration dans cmh_academy_dev.

## Fichiers concernés

- backend/admin/formations.js, backend/app.js.
- frontend/src/admin/FormationEditor.jsx, formation-fields.js, CatalogueResource.jsx,
  AdminWorkspace.jsx, resources.js, api.js, admin.css.
- backend/scripts/lib/test-formations.mjs, backend/scripts/test-auth.mjs,
  backend/package.json.
- README.md, docs/admin-catalogue.md et ce guide.
