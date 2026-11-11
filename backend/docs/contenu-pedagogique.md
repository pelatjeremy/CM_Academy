# Modules, leçons, supports et progression déclarative

Implémentation et essais sur PostgreSQL et stockage isolés. La migration
`20261111160000_contenu_pedagogique` est préparée et n'est **pas appliquée** à
cmh_academy_dev. Vérification locale en lecture seule : douze migrations terminées,
leurs empreintes conformes, cinq nouvelles tables absentes, aucune divergence
contre le schéma de référence des douze migrations. Aucune donnée fictive locale,
aucune nouvelle dépendance et aucun déploiement.

## Modèle et règles

- Formation → ModulePedagogique → LeconPedagogique : relations obligatoires,
  ordres entiers uniques par parent. Ces objets sont distincts des Session/Seance.
- ParcoursPedagogique : un compteur de révision par formation. La première
  écriture explicite crée ce compteur ; une consultation ne crée rien.
- Chaque module et leçon possède un titre, un état publié et un état archivé.
  Une leçon peut rester vide en brouillon, mais doit contenir du texte pour être
  publiée. L'archivage impose la dépublication, sans suppression du contenu.
- SupportLecon : un PDF privé avec UUID de stockage généré côté serveur,
  empreinte, taille, nom original sécurisé, date et auteur du dépôt. Les supports
  peuvent être archivés et rétablis ; chaque dépôt est un nouvel objet conservé.
- ProgressionLecon : clé primaire inscriptionId + leconId, déclaration terminée
  ou reprise, date et révision. Elle ne représente ni une présence, ni un acquis,
  ni une évaluation, ni une attestation.

Toutes les FK nouvelles sont RESTRICT et indexées, directement ou par la
première colonne d'une clé composée. Un trigger refuse une progression portant
sur une leçon d'une autre formation. Aucun déplacement de module vers une autre
formation, ou de leçon vers un autre module, n'est proposé par ces routes.
Les identifiants TEXT utilisent les cuid du client Prisma, comme le catalogue.
Les dates techniques utilisent les conventions UTC du client/adaptateur existant.

## Calcul et conservation de la progression

Le dénominateur compte les leçons publiées et non archivées dont le module est
lui-même publié et non archivé. Le numérateur compte les déclarations « terminée »
de cette seule inscription parmi ces leçons accessibles. Un parcours vide vaut
0 leçon terminée sur 0 accessible, sans calcul de pourcentage.

Une nouvelle leçon publiée, avec un nouvel identifiant, est non terminée. Une
leçon archivée/dépubliée disparaît des deux compteurs, sans effacer sa déclaration.
La republication du même identifiant restaure sa déclaration dans le calcul.
Modifier le texte d'une leçon existante ne réinitialise pas automatiquement la
déclaration : créer une nouvelle leçon s'il s'agit d'une nouvelle activité.
Deux inscriptions du même compte ont des progressions distinctes.

Une demande identique répétée ne crée aucune ligne ou révision supplémentaire.
« Reprendre mon étude » sur une leçon jamais terminée ne crée pas de ligne.
Les modifications opposées issues d'une ancienne révision sont refusées avec 409.
Ni ouverture ni lecture d'une leçon ne la marque terminée.

## Autorisations et confidentialité

Les routes /api/admin exigent ADMIN, session active et CSRF pour chaque écriture,
y compris multipart. Les champs acceptés sont explicitement définis par des
schémas stricts. Les limites sont de 160 caractères pour un titre, 30 000 pour un
texte, 200 modules par formation, 500 leçons par module et 50 supports par leçon,
archives comprises. Les écritures liées et les réordonnancements sont transactionnels.

Les routes /api/stagiaire vérifient à chaque lecture, écriture et téléchargement :
compte STAGIAIRE actif, rattachement explicite, propriété de l'inscription,
statut CONFIRMEE et appartenance de la leçon au parcours de cette formation.
Les conditions de publication/archivage des deux niveaux sont vérifiées.
Une annulation ou une désactivation bloque les accès suivants. Aucune association
par simple correspondance d'email. Une formation en brouillon peut préparer son
contenu ; l'accès privé des inscrits confirmés repose sur la publication des
modules/leçons, indépendamment de sa présence au catalogue public.

Les supports pédagogiques relèvent de la formation : ils sont accessibles aux
inscrits confirmés lorsque leur leçon est accessible. Les documents individuels
du dossier gardent leur mécanisme de partage par version et ne sont jamais
réutilisés automatiquement comme supports. Le test utilise des PDF génériques
sans identité de stagiaire. Aucun module, contenu ou suivi individuel n'est ajouté
aux API publiques, y compris à la fiche d'une formation publiée.

Le téléchargement utilise telechargerDocument : pièce jointe, PDF, nosniff,
no-store, sans chemin interne. La validation PDF réutilise extension, MIME déclaré,
signature et limite DOCUMENT_MAX_FILE_BYTES (10 Mo par défaut), sur disque
temporaire, avant chargement complet en mémoire. Les écritures contrôlent aussi
l'appartenance du support à la leçon de la formation indiquée.

## Stockage, sauvegardes et concurrence

Le répertoire DOCUMENT_STORAGE_DIR existant reste commun, privé, stable par
rapport au backend et ignoré par Git. Les noms UUID et la promotion exclusive
ne remplacent aucun objet existant. L'audit documentaire inclut PieceJointe et
SupportLecon, y compris leurs archives, et refuse une double référence au même
objet. Ainsi les supports ne sont pas signalés à tort comme orphelins.

Les échecs connus compensent les objets non référencés et nettoient les
temporaires. Un commit incertain conserve le fichier jusqu'à l'audit. Les clés
de dépôt permettent le rejeu exact sans nouveau support. Deux dépôts depuis une
même révision ne s'écrasent pas : l'un est confirmé, l'autre reçoit un conflit.
Le fichier sélectionné reste en mémoire du navigateur jusqu'à une décision
explicite de l'utilisateur ; aucun jeton n'est stocké dans le stockage Web.

La sauvegarde/restauration doit rester conjointe : base complète et tous les
objets privés, avec contrôle des empreintes et audit après restauration isolée.
Ne pas supprimer les fichiers d'un contenu archivé. Aucune nouvelle variable
d'environnement n'est nécessaire.

Un compteur global protège créations, éditions, archives, ordre et supports.
Les commandes Monter/Descendre envoient la permutation complète, archives
comprises. Deux passes dans la transaction évitent les collisions d'ordre unique.
Une édition conserve sa révision d'origine : actualiser une liste ne permet pas
d'écraser silencieusement une version plus récente. Les champs restent saisis
après 409 et le départ avec modifications doit être confirmé.

## Correction révélée par les régressions

Une ancienne course de confirmation de préinscription a produit un HTTP 500
intermittent. Un stress isolé l'a reproduite : l'adaptateur pg peut renvoyer un
DriverAdapterError/TransactionWriteConflict avec SQLSTATE 40001, au lieu de P2034.

Ces conflits natifs 40001/40P01 sont maintenant normalisés vers P2034. Le helper
transactionnel conserve quatre essais maximum ; les routes possédant leurs
propres reprises conservent leurs bornes. L'isolation SERIALIZABLE, le contrôle
de capacité et les validations ne changent pas. Une erreur réseau ou un commit
au résultat incertain n'est jamais réessayé par cette normalisation.

Trente courses de dernière place ont ensuite réussi avec une confirmation et
un refus de capacité à chaque fois, y compris treize conflits natifs réellement
rencontrés et correctement traités. Aucun message SQL ni contenu personnel n'est
ajouté aux logs ; les diagnostics de test ne conservent que les codes/classes.

## Tests réellement exécutés

- Suite complète `test:elearning` : 67 groupes réussis,
  `.catalogue-test/auth-LLZ0PA/auth-results.json`, dont les régressions antérieures.
  Treize migrations en isolation, validation/génération Prisma et diff sans divergence.
- Création, ordre des deux niveaux, brouillons, publications, archives, références,
  contraintes de taille, rôle, CSRF, conflit et absence de suppression physique.
- PDF valide/faux type/trop grand/nom malveillant ; rejeu, dépôt concurrent,
  panne de stockage, compensation, audit commun et téléchargements protégés.
- Progression répétée/reprise, conflit, reconnexion/redémarrage, nouvelle leçon,
  dépublication et restauration des déclarations après archivage.
- Isolation entre comptes et entre deux inscriptions d'un même compte, refus
  avant rattachement, après annulation et après désactivation ; confidentialité
  des API publiques et absence d'effet sur présences, documents et attestations.
- SQL réel sur douze schémas déjà peuplés :
  `.catalogue-test/auth-EEwokN/pedagogie-schema-results.json`, quatre groupes réussis.
  Anciennes lignes conservées, sept FK RESTRICT, nouvelles tables vides,
  rollback vide, réapplication, contraintes et rollback protégé avec données.
- Stress des confirmations : `.catalogue-test/auth-bZQOHK/auth-results.json`,
  30 courses réussies. Les tests contrôlent aussi la borne des reprises et le
  refus de rejouer un commit réseau incertain.
- Recette transversale : `.catalogue-test/auth-vCYtBx/recette-results.json`,
  quatorze étapes et contrôles transversaux réussis ; empreintes métier et fichiers
  de cmh_academy_dev inchangés, hors sessions techniques de connexion.
- Navigateur isolé `.catalogue-test/auth-lxbDBY` : onglet depuis la formation,
  module/leçon brouillon, avertissement de sortie et saisie conservée, dépôt PDF,
  publication, Monter au clavier, aperçu ADMIN, conflit entre deux onglets sans
  perte du titre saisi, connexion stagiaire, sommaire/précédente/suivante,
  déclaration/reprise, rechargement et reconnexion avec 2 leçons terminées sur 4.
- Le texte contenant une balise img/onerror est rendu littéralement, sans dialogue
  JavaScript. Le support ajouté au navigateur est téléchargé via l'API isolée,
  empreinte identique, autre stagiaire 404 et anonyme 401 ; rapport
  `verification-support-navigateur.json`. Aucun téléchargement fictif laissé
  hors de l'environnement isolé.
- Mobile 390×844 : gestion et lecture sans débordement horizontal. Le choix d'un
  éditeur place le focus sur son titre pour faciliter clavier et petit écran.
  Captures `pedagogie-mobile.png`, `pedagogie-admin-mobile.png`, `parcours-stagiaire.png`.
- Lint et build React réussis ; syntaxe Node contrôlée sur 76 fichiers. La validation serveur
  refuse les entrées invalides avec des messages de champs en français.

Les premiers échecs de recette sont conservés pour diagnostic. Le scénario
d'annulation a été corrigé pour respecter son caractère définitif, sans ajouter
de réactivation. Le test SQL accepte les SQLSTATE de refus FK/RESTRICT du serveur
installé. Ces ajustements n'assouplissent aucune règle de l'application.

## Reproduction et scénario manuel

Depuis backend :

```powershell
npm run test:elearning:schema
npm run test:elearning
npm run test:concurrence-inscriptions
npm run test:elearning -- --browser
```

Le mode navigateur affiche une URL isolée en 127.0.0.2 et un dossier .catalogue-test.
Les identifiants fictifs restent dans browser.json (ADMIN) et
elearning-browser.json (stagiaire et identifiants corrélés), jamais dans les logs.
Les consulter uniquement localement pour la recette.

1. Connecter ADMIN, ouvrir Formations → « Découvrir le cheval — parcours pédagogique »
   → Contenu pédagogique. Ajouter « Pratique guidée » en brouillon.
2. Ajouter une leçon « Observer au calme », saisir du texte. Cliquer sur Formations
   puis Rester sur la fiche : vérifier la conservation. Enregistrer.
3. Choisir support-pedagogique-test.pdf du dossier isolé et déposer. Publier
   explicitement la leçon puis son module. Réordonner avec Monter/Descendre.
4. Prévisualiser : vérifier le bandeau administrateur et les statuts. Dans deux
   onglets, ouvrir la même leçon : enregistrer l'un puis l'autre ; le second doit
   afficher un conflit tout en gardant la saisie. Quitter explicitement sans sauver.
5. Déconnecter ADMIN. Connecter le stagiaire de la fixture, ouvrir sa formation
   puis le parcours. La nouvelle leçon doit être À étudier ; les brouillons et
   archives doivent être absents. Parcourir précédente/suivante et le sommaire.
6. Déclarer la leçon terminée, recharger, se déconnecter/reconnecter : retrouver
   le compteur. Reprendre l'étude puis terminer à nouveau. Lire l'avertissement
   indiquant que cette progression est déclarative.
7. Télécharger le PDF comme propriétaire. En tant qu'autre compte ou avec une
   inscription annulée, vérifier le refus. Ranger les copies fictives dans le
   dossier isolé. Archiver/dépublier un contenu : il sort du compteur sans perte
   de sa déclaration, qui réapparaît à sa republication.
8. Vérifier à 390 px et au clavier. À la fin créer un fichier vide stop-browser
   dans le dossier affiché pour arrêter ces seuls serveurs et cluster isolés.

Aucune inscription réelle ni compte réel n'est nécessaire à ces essais.

## Migration et rollback

La migration est additive : cinq tables, index et contraintes, sans INSERT ni
modification de données antérieures. Aucune migration déjà appliquée n'est modifiée.
Le retour arrière versionné refuse tout contenu, compteur, support ou progression
existant. À vide, il retire ces seules tables et fonction/trigger, en conservant
les formations, sessions et inscriptions antérieures. L'historique Prisma doit
être traité explicitement par l'opérateur ; aucun effacement automatique.

Application locale effectuée le 11 novembre 2026 sur localhost:5432/cmh_academy_dev :
les douze migrations précédentes et leurs empreintes étaient conformes, sans
 divergence. Seule 20261111160000_contenu_pedagogique a été appliquée par migrate deploy,
puis Prisma a été régénéré et le backend redémarré. Treize migrations terminées,
schéma sans divergence. Aucun reset ni db push.

Sauvegarde hors versionnement : .local-backups/pedagogie-20261111-CX1zfC/ :
avant-pedagogie.dump, stockage-prive/, stockage-manifeste.json. La restauration
conjointe sur un cluster neuf a été vérifiée par comparaison des lignes, du
schéma, des contraintes, index, triggers, historique et empreintes des fichiers.
La migration a également été appliquée à cette restauration avant la base locale.
Stockage résolu : backend/.private-documents ; zéro fichier, audit sans anomalie
et sans nettoyage. Les informations de connexion ne figurent pas dans les rapports.

Volumes avant/après : 1 compte, 1 formation, 1 session et 1 séance conservés ;
0 inscription, dossier et pièce jointe. Les cinq tables pédagogiques restent vides.
Les données métier ont été comparées par empreinte avant/après les consultations.
Aucun partage, horaire ou statut d'inscription modifié.

Contrôles relancés : test:elearning, test:elearning:schema,
test:concurrence-inscriptions (30 courses de dernière place), test:recette ;
syntaxe de 80 fichiers JavaScript, lint et build frontend. Rapports isolés référencés
dans recette-finale.json de la sauvegarde. Navigateur local : session ADMIN valide,
Contenu pédagogique vide après rechargement, Inscriptions vide, catalogue,
fiche publiée et connexion stagiaire accessibles. API : accès anonymes refusés,
contrat public conservé, contenu privé absent. Les vérifications avec inscriptions,
dossiers, comptes stagiaires et rôles non autorisés restent exclusivement isolées.

Scripts opérateur : scripts/apply-pedagogie-local.mjs (refuse un historique autre
que les douze migrations attendues ; ne pas relancer après application) et
scripts/verify-pedagogie-local.mjs (contrôles en lecture seule ; empreintes dans
la sauvegarde). Aucune migration antérieure modifiée, aucun déploiement.

## Fichiers ajoutés ou modifiés

- prisma/schema.prisma ; migration et rollback 20261111160000_contenu_pedagogique.
- admin/pedagogie.js ; pedagogie-stagiaire.js ; lib/pedagogie.js ; lib/documents.js ; app.js.
- lib/preinscriptions.js ; admin/catalogue.js ; admin/formations.js ;
  admin/sessions.js ; admin/attestations.js : normalisation des conflits natifs.
- scripts/test-auth.mjs ; scripts/lib/test-elearning.mjs ;
  scripts/lib/pedagogie-pdf-fixture.mjs ; scripts/test-elearning-schema.mjs ; package.json.
- frontend/src/admin/ContenuPedagogique.jsx ; pedagogie/ParcoursPedagogique.jsx ;
  AdminWorkspace.jsx ; FormationEditor.jsx ; admin.css ; App.jsx ; stagiaire/EspaceStagiaire.jsx.
- Ce document. Aucun changement de configuration privée ni de dépendance.
