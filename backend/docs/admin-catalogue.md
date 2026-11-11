# Administration du catalogue : pôles et formateurs

Étape réalisée le 24 octobre 2026. Aucun changement du schéma, aucune migration,
aucune dépendance ajoutée. Aucun compte ou contenu fictif créé dans la base de
développement, aucun déploiement.

## Fonctionnement

Après connexion, `/admin` affiche un tableau de bord et un menu latéral :
Tableau de bord, puis Catalogue avec Pôles et Formateurs. Les rubriques de
sessions ne sont pas affichées. Le bloc Formations a été ajouté le 25 octobre
2026 : voir [le guide dédié](admin-formations.md).

Les deux ressources réutilisent la même liste, le même éditeur et les mêmes
champs/styles. Recherche côté serveur, pagination de 20 résultats, états de
chargement, liste vide et erreur avec nouvelle tentative. Les formulaires
présentent les erreurs par champ et une confirmation de sauvegarde.

Un formulaire modifié affiche « Modifications non enregistrées ». Les liens
et la déconnexion demandent confirmation avant de quitter ; annuler conserve
la saisie. Rechargement, fermeture et navigation du navigateur sont également
protégés par beforeunload lorsque le navigateur le permet. Une sauvegarde
réussie retire l'avertissement. Une erreur de sauvegarde conserve la saisie.
Les erreurs réseau sont reformulées en français, sans diagnostic technique.

## Routes et validation

Pour chacune des ressources `poles` et `formateurs` :

| Méthode et chemin | Résultat |
| --- | --- |
| GET /api/admin/{ressource}?q=...&page=1 | Liste, total et pagination |
| GET /api/admin/{ressource}/{id} | Fiche |
| POST /api/admin/{ressource} | Création, HTTP 201 |
| PUT /api/admin/{ressource}/{id} | Modification complète, HTTP 200 |

Ces routes sont montées après les protections communes de session, rôle ADMIN
et CSRF. Sans session valide : 401 ; avec un autre rôle : 403. Les écritures
exigent une origine autorisée et le jeton CSRF. Aucun endpoint DELETE : une
tentative authentifiée munie de CSRF reçoit 405, sans suppression.

Champs autorisés uniquement :

- Pôle : titre obligatoire (160 caractères maximum), slug obligatoire unique
  (160 maximum, minuscules ASCII/chiffres/tirets simples), description facultative
  (3 000 maximum, chaîne vide par défaut).
- Formateur : nom obligatoire (160 maximum), biographie facultative (3 000
  maximum, chaîne vide par défaut). Aucun champ de coordonnées ou photo ajouté.

Les textes sont nettoyés des espaces en début et fin. Champs inconnus et types
invalides sont refusés. Ces limites applicatives bornent la saisie des colonnes
TEXT existantes. Le JSON est limité à 32 ko pour permettre les textes Unicode.

Erreur de saisie : 422 avec `error` et `fields`. Identifiant introuvable : 404.
Slug utilisé : 409, avec erreur près du slug. Les titres de pôles ne sont pas
uniques, conformément au schéma.

Les homonymes sont permis : deux formateurs peuvent avoir le même nom si leur
biographie diffère. Une fiche avec le même nom (sans distinction de casse) et
la même biographie est refusée en 409. Cette règle applicative est vérifiée
dans une transaction Serializable, avec reprise bornée en cas de conflit :
deux créations concurrentes identiques ne produisent qu'une fiche. Aucun index
d'unicité supplémentaire ou modification de données historiques.

Les DTO utilisent des sélections explicites, sans charger les formations ni
les relations. Aucune nouvelle route publique de pôle ou formateur. La route
publique des formations garde sa projection id/titre/description et son filtre
publiee=true. Les pôles de la page publique restent la présentation statique
existante ; leur branchement à la base n'est pas inclus dans cette étape.

## Vérifications réellement réalisées

```powershell
# Depuis backend, nouvelles instances PostgreSQL isolées :
npm run test:admin
npm run test:catalogue
# Depuis frontend :
npm run lint
npm run build
```

`test:admin` exécute la suite d'authentification existante puis les tests du
nouveau bloc. Schéma et migrations sont installés sur un cluster PostgreSQL
neuf, dont la destination est vérifiée avant les écritures. Aucun chargement
du fichier .env de développement.

Tests SQL/API réussis sur les deux ressources : listes vides, création,
consultation, modification, recherche insensible à la casse, absence de résultat,
validation, champs privés inconnus refusés, doublons à la création et à la
modification, identifiants inconnus, accès anonymes/non-admin refusés, écritures
sans CSRF et avec jeton invalide refusées, suppression refusée. Pagination
réelle sur 21 résultats, création concurrente identique de formateurs et
contrat public sans données de formateurs également vérifiés.

La suite d'authentification a repassé : connexion, rotation, expiration,
révocation, persistance PostgreSQL, CSRF, rôle et état actif, limitation des
tentatives, cookies de production et déconnexion. La suite catalogue complète
a repassé sur un autre cluster isolé.

Parcours navigateur réellement effectué sur l'instance isolée : connexion,
tableau de bord, création et modification de chaque ressource, rechargement des
fiches sauvegardées, erreurs près des champs, confirmations, recherche, état
vide, refus puis acceptation de la sortie d'une saisie non enregistrée,
déconnexion et redirection vers la connexion après tentative de retour.
Listes et formulaire contrôlés à 390 px : aucun débordement horizontal.
Aucune erreur console capturée en fin de parcours.

Traces locales non versionnées :

- `.catalogue-test/auth-d2Xb0H/auth-results.json`
- `.catalogue-test/auth-d2Xb0H/admin-browser-results.json`
- `.catalogue-test/auth-d2Xb0H/admin-poles.png`
- `.catalogue-test/run-1PedQQ/resultats.json` pour la régression catalogue.

Les instances isolées ont été arrêtées. Les artefacts restent privés et ignorés,
avec leurs identifiants de test. Contrôles locaux supplémentaires en lecture
seule : zéro pôle et zéro formateur dans cmh_academy_dev, API admin anonyme 401,
catalogue public HTTP 200 directement et via Vite. Backend et Vite relancés.

Lint et build réussis. Aucun essai d'écriture ni compte fictif sur la base de
développement. L'écran d'erreur réseau est implémenté, mais une coupure réseau
de la liste n'a pas été provoquée dans le navigateur pendant cette campagne.

## Guide de test manuel

1. Lancer les serveurs habituels si nécessaire (`npm run dev` dans backend et
   frontend), puis se connecter à http://127.0.0.1:5173/admin/connexion avec votre
   compte existant.
2. Ouvrir Catalogue → Pôles, créer une vraie fiche, vérifier la confirmation,
   revenir à la liste, la rechercher puis la modifier et recharger.
3. Vérifier le refus d'un slug déjà utilisé et les messages des champs vides.
4. Répéter avec un formateur (nom et biographie seulement). Ne pas saisir de
   coordonnées privées dans sa présentation.
5. Modifier une saisie sans enregistrer puis cliquer une autre rubrique :
   annuler doit garder la saisie, confirmer doit quitter la fiche.
6. Se déconnecter et ouvrir directement une rubrique admin : retour à la
   connexion. Le catalogue public doit rester accessible.

Pour rejouer ces étapes avec des données fictives, utiliser uniquement
`npm run test:admin -- --browser`. Le script affiche l'URL de l'instance isolée.
Il conserve cette instance pour les vérifications, jusqu'à création du fichier
`stop-browser` dans le dossier de campagne indiqué. Ses identifiants fictifs
restent dans browser.json ; ne pas les publier. La base de développement ne
doit jamais servir à ces jeux de démonstration.

## Fichiers concernés

- backend/admin/catalogue.js, backend/app.js.
- frontend/src/admin/AdminWorkspace.jsx, CatalogueResource.jsx, resources.js,
  api.js et admin.css ; frontend/src/components/Admin.jsx.
- backend/scripts/lib/test-admin-catalogue.mjs, backend/scripts/test-auth.mjs,
  backend/package.json.
- README.md et cette documentation.
