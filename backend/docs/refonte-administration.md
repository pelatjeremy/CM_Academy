# Présentation de l’administration — 16 novembre 2026

Travail local sur `codex/lisibilite-presences-dossier`, depuis la dernière branche
documentaire validée. Aucun déploiement, aucune migration, aucune connexion à une
base existante, aucun ajout de dépendance.

## Présentation

- Accueil : quatre indicateurs opérationnels et deux groupes de rubriques.
  Les demandes en attente, sessions et formations publiées utilisent les totaux
  des API paginées existantes ; les pièces à vérifier utilisent la liste complète
  du suivi documentaire et son calcul partagé. Aucun total depuis une seule page.
  Un échec ne remplace pas un compteur par zéro. Chaque indicateur mène à sa rubrique.
- Inscriptions, formations, sessions, pôles, formateurs et modèles de questionnaire :
  tableaux avec colonnes explicites, états textuels et liens d’action. Recherche,
  filtres et pagination existants conservés. Le lien d’accueil vers les demandes
  en attente initialise ce filtre à partir d’une valeur autorisée de l’URL.
- Présences individuelles : synthèse des durées distinctes, tableau par séance,
  historique avant/après, date, auteur et motif. Une absence à zéro reste distincte
  d’une durée inconnue. Aucun taux d’assiduité déduit d’un relevé incomplet.
- Présences de session : synthèse des inscriptions confirmées, séances et durées ;
  lignes de stagiaires repliées avec état et durée visibles, formulaire existant
  accessible à l’ouverture. Confirmation et motif de correction conservés.
- Dossier administratif : identité dans l’en-tête, synthèse structurée, historique
  en tableau avec détails des changements de note dépliables.
- Formulaires, contenus pédagogiques et organisme : mêmes surfaces, bordures,
  typographie, espacements et actions. Navigation mobile repliable sur toutes les
  rubriques. Tableaux adaptés en lignes étiquetées sur petit écran.
- Suivi documentaire : présentation compacte conservée, règles de complétude et
  distinction entre actions facultatives et obligations inchangées.

Les API d’écriture, les règles métier, les droits et l’historique des connexions
ne sont pas modifiés par cette refonte.

## Fichiers

- `frontend/src/admin/AdminOverview.jsx` : accueil et lectures de synthèse.
- `frontend/src/admin/AdminTable.jsx` : structure de tableau accessible partagée.
- `frontend/src/admin/admin-dashboard-ui.css` : styles limités à l’administration.
- `frontend/src/admin/AdminWorkspace.jsx` : intégration et navigation mobile.
- `frontend/src/admin/Inscriptions.jsx`, `SessionList.jsx`, `CatalogueResource.jsx`,
  `QuestionnaireModeles.jsx` : listes en tableaux.
- `frontend/src/admin/DossierAdministratif.jsx` : en-tête et historique structuré.
- `frontend/src/admin/SessionPresences.jsx` : synthèse et lignes dépliables.
- `frontend/src/presences/PresenceSynthese.jsx`, `PresenceHistorique.jsx`,
  `presences-synthese.css` : présentation des présences individuelles.
- `backend/scripts/test-admin-presentation.mjs`,
  `backend/scripts/test-presence-presentation.mjs` : recettes navigateur isolées.

## Vérification

Commandes exécutées :

```text
cd backend
node scripts/test-admin-presentation.mjs
node scripts/test-presence-presentation.mjs
cd ../frontend
npm run lint
npm run build
```

Les recettes montent les vrais composants dans Vite et simulent uniquement les
réponses HTTP avec des données fictives. Aucun fichier `.env`, base de données,
stockage documentaire ou service distant n’est utilisé. La correction de présence
est interceptée et enregistrée uniquement dans une variable du script de test.

Contrôles :

- Totaux globaux 21 demandes / 1 pièce / 31 sessions / 24 formations, distincts
  des 20 résultats de la première page ; seconde page des trois listes paginées.
- Recherche, absence de résultat, filtres et liens entre liste et dossier.
- Création de fiches, modèles, sessions, organisme et accès à l’édition des leçons.
- Sortie d’une saisie non enregistrée : dialogue, retour et valeur préservée.
- Correction de présence : formulaire déplié, confirmation, ancien numéro de
  révision, dates attendues, minutes et en-tête CSRF conservés.
- Présences 14 h programmées / 12 h renseignées ; inconnue, zéro, partiel et vide ;
  historiques fermés, ouverture Entrée/Espace, auteur/date/motif et valeurs.
- Ordinateur 1680 px et mobile 390 px : absence de débordement global, navigation
  au clavier et tableaux adaptés ; dossier complet avec correction facultative.
- Erreur et chargement d’un indicateur, reprise par Actualiser sans faux zéro.
- Lint, build, syntaxe des scripts et diff des fichiers concernés.

Rapports et captures fictives, ignorés par Git : `reports/administration/` et
`reports/presences/`. Captures inspectées visuellement.

Limites : recette de présentation et interactions avec API simulées ; pas de
nouvelle recette distante ou base réelle, pas d’appareil mobile physique. Les
tests métier complets ne sont pas réexécutés pour cette présentation.

Scénario manuel : ouvrir l’accueil ADMIN, suivre « Demandes en attente », rechercher
un stagiaire puis ouvrir son dossier ; consulter les durées et déplier un historique.
Depuis Sessions, ouvrir les présences et déplier un stagiaire ; une correction
reste soumise au motif et à la confirmation existants. Vérifier les mêmes écrans
sur mobile, puis modifier une fiche sans enregistrer et essayer de quitter :
« Rester sur la fiche » conserve la saisie. Utiliser uniquement un environnement
de test avec données fictives pour toute écriture de ce scénario.

## Recette de publication

`node scripts/test-admin-deployed.mjs --baseline` relève une référence en lecture
seule avant la bascule sur la démonstration existante. Après déploiement,
`node scripts/test-admin-deployed.mjs` compare cette référence et vérifie les
parcours réels sans écriture métier. Les réponses privées et les captures restent
dans `.demo-environment/admin-release/`, exclu de Git. Cette recette ne lance
ni migration, ni réensemencement, ni dépôt de pièce ou décision administrative.
