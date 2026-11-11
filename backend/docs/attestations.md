# Attestations individuelles de fin de formation

Étape implémentée et testée sur PostgreSQL et stockage isolés, puis migration
`20261111120000_attestations` appliquée le 11 novembre 2026 à
`localhost:5432/cmh_academy_dev`. Douze migrations locales sont terminées et le
schéma ne présente aucune divergence. Les onze migrations antérieures et leurs
empreintes sont conservées. Aucun compte, dossier, fichier ou relevé fictif
n'est créé dans cet environnement.

## Application locale vérifiée

Sauvegarde conjointe hors versionnement :
`.local-backups/attestations-20261111-BS576J/avant-attestations.dump` et
`stockage-prive/`, avec manifeste et empreintes SHA-256. Le backend était arrêté.
La sauvegarde a été réellement restaurée sur un nouveau cluster PostgreSQL et
un stockage distinct. Toutes les lignes, colonnes, contraintes, index, triggers,
historique des migrations et fichiers ont été comparés à la source. L'application
de la seule migration attendue a d'abord été vérifiée sur cette restauration.

Après application locale via `prisma migrate deploy`, Prisma est régénéré et le
backend relancé par `npm start`. Avant/après : un compte, une formation, un pôle,
un formateur, une session, une séance ; zéro inscription, dossier, fichier ou
présence. Les nouvelles tables d'organisme et d'attestations contiennent zéro
ligne. Les données et horaires préexistants sont identiques. Le stockage vide
est conservé ; audit sans anomalie et sans nettoyage.

Connexion ADMIN réelle et accès au formulaire Organisme vérifiés au navigateur :
champs vides, dénomination et adresse signalées comme nécessaires, aucun
enregistrement. Inscriptions affiche zéro demande. Catalogue et fiche publiée
consultés, page de connexion stagiaire accessible. Les empreintes de douze tables
métier sont identiques avant/après consultation, hors sessions techniques de
connexion. Les accès anonymes aux attestations/configuration/téléchargements
renvoient 401 ; les réponses publiques restent exemptes de données privées.

Les essais de rôles non autorisés, dossiers et espace stagiaire sont conservés
dans la régression isolée : 58 groupes réussis dans
`.catalogue-test/auth-hgTlF4/auth-results.json`. Aucune inscription locale
n'existant, aucun dossier ni compte stagiaire de démonstration n'a été créé.
Les polices Vera normale et grasse sont lues par fontkit depuis le répertoire
habituel de `npm start`, avec vérification des glyphes français. Syntaxe Node
de 69 fichiers, lint et build réussis.

Scripts d'exploitation : `scripts/apply-attestations-local.mjs --apply`
(refuse la réexécution et toute migration inattendue), et
`node --env-file=.env scripts/verify-attestations-local.mjs --avant` puis sans
option pour la comparaison. Rapports sans coordonnées dans le dossier de
sauvegarde : `resultats.json`, `lecture-avant.json`, `controles-locaux.json`.
La configuration de l'organisme reste à renseigner avec les informations réelles.

## Utilisation et informations à compléter

Dans Administration → Organisme (`/admin/organisme`), renseigner :

- la dénomination réelle de l'organisme, obligatoire ;
- son adresse réelle, obligatoire ;
- son identifiant, facultatif : renseigner seulement un identifiant vérifié ;
- son représentant déclaré, facultatif : sa mention n'ajoute aucune signature.

Aucune adresse, identité de représentant, signature ou image de marque n'est
préremplie. Ces informations ne sont pas connues de cette étape. Une lecture
ne crée pas la configuration. Son enregistrement exige ADMIN et CSRF ; la
révision empêche d'écraser une modification concurrente.

Depuis Inscriptions → Dossier → Attestation de fin de formation : préparer
l'aperçu, ouvrir le PDF marqué BROUILLON, puis demander et confirmer l'émission.
Les données sont nominatives. Aucun résultat d'évaluation ni acquis n'est déduit.
La mention des présences manuelles et l'absence de signature sont explicites.

## Règles d'émission

L'émission exige un dossier initialisé, les prénom et nom, un intitulé, des
objectifs pédagogiques et un format de formation, les informations obligatoires
de l'organisme, au moins une séance, toutes les séances terminées et toutes les
présences connues. Une séance sans relevé ou NON_RENSEIGNE reste inconnue ; elle
n'est jamais assimilée à une absence. Le total suivi doit être strictement positif.
Les inscriptions annulées conservent leurs présences historiques : leur statut
ne supprime pas ces données et n'empêche pas de décrire une participation passée.

La durée programmée est la somme des durées réelles des séances, distincte de
la durée pédagogique annoncée. La durée de présence est la somme exacte des
millisecondes renseignées, affichée en heures, minutes et, si nécessaire,
secondes/millisecondes. Une participation inférieure au programme porte la
mention « participation partielle ». Zéro heure interdit l'émission.
Les dates sont affichées en Europe/Paris avec leur décalage UTC.

Un dossier sans parcours documentaire peut recevoir une attestation : l'action
d'émission crée seulement son élément ATTESTATION, à l'état A_PREPARER, sans
activer le parcours. Une correction ne modifie ni note ni état documentaire.
L'attestation dispose d'un téléchargement administrateur qui ne dépend pas de
l'activation du parcours, et réutilise le service de téléchargement des pièces.

## Instantané, concurrence et versions

L'aperçu est une opération POST protégée CSRF, sans écriture en base ni fichier
durable. Il renvoie un PDF privé en mémoire, une empreinte des données et
l'identifiant de l'éventuelle émission de référence. Le navigateur ne conserve
pas ces données dans le stockage Web ; l'URL blob est révoquée à sa fermeture.

Au moment de l'émission, une transaction SERIALIZABLE relit l'organisme,
l'identité, la formation, les séances et les révisions de présence. Une empreinte
différente ou une nouvelle version de référence provoque HTTP 409 : un nouvel
aperçu est nécessaire. Les conditions bloquantes sont toujours revérifiées.

Une émission conserve un instantané JSON, la version `cmh-attestation-1`, une
référence UUID unique, la date serveur, l'auteur et le PDF. Un trigger interdit
la modification de ces informations ou leur suppression. Seul le passage d'une
ancienne version de référence à une version antérieure est autorisé. Une
correction exige un motif et crée un nouvel instantané et un nouveau PDF.
L'index partiel garantit au plus une émission de référence par inscription.

Le numéro d'émission est distinct du numéro de pièce : des fichiers ATTESTATION
peuvent avoir été joints manuellement. Les deux séries ne sont pas confondues.
Les émissions et les dépôts documentaires utilisent la même révision de fichier
pour éviter les collisions de version. Les anciennes pièces sont conservées.

Un UUID de requête et l'empreinte de sa charge utile/l'auteur/dossier rendent
le rejeu exact idempotent, même si les sources ont changé après le commit.
Réutiliser la clé avec une charge utile différente est refusé. Deux émissions
concurrentes ne créent pas deux corrections depuis le même aperçu : la perdante
reçoit 409. Le double clic est aussi verrouillé dans l'interface.

## Stockage et confidentialité

PDFKit est la seule nouvelle dépendance : génération serveur sans navigateur ni
service tiers, pagination et polices embarquées. Les polices Bitstream Vera sont
livrées avec leur licence de redistribution, dans `assets/fonts/`.

Le PDF est promu avec un nom UUID dans le stockage privé existant, avec fsync et
lien exclusif. La pièce et l'émission sont validées dans la même transaction.
Un échec connu supprime l'objet non référencé ; un résultat de commit incertain
le conserve jusqu'à vérification par l'audit. Une interruption brutale peut
laisser un temporaire ou un orphelin, jamais une émission partiellement visible.
Utiliser `npm run documents:audit` pour les détecter, sans nettoyage automatique.
La limite documentaire configurée reste applicable à la génération.

Chaque nouvelle pièce est privée par défaut. Le partage et son retrait réutilisent
les routes existantes par version, avec ADMIN/CSRF. Une ancienne version déjà
partagée le reste jusqu'à retrait explicite : la nouvelle ne l'est jamais
automatiquement. Le stagiaire ne télécharge que les pièces partagées de ses
propres inscriptions ; le retrait est contrôlé à chaque téléchargement.

Le téléchargement est en pièce jointe, Content-Type application/pdf, nosniff et
no-store. Aucun chemin, instantané, PDF ou coordonnée n'est ajouté aux API publiques.
Les logs d'erreur restent génériques. Aucun envoi externe ni signature électronique.

Les sauvegardes doivent rester conjointes : arrêter les écritures, sauvegarder
PostgreSQL en format custom et copier intégralement le stockage privé avec ses
empreintes ; restaurer les deux dans un environnement isolé et lancer l'audit
avant toute reprise. Ne pas restaurer seulement les métadonnées des attestations.

## Procédure de migration et retour arrière

La migration ajoute uniquement OrganismeAttestation et AttestationEmission,
leurs clés RESTRICT, index d'unicité et trigger d'immuabilité. Elle ne crée aucune
configuration, émission, pièce ou donnée métier. Aucune migration déjà appliquée
n'est modifiée.

Pour une application dans un environnement autorisé : vérifier explicitement la destination,
les onze migrations et l'absence de divergence contre leur schéma de référence,
sauvegarder/restaurer conjointement base et stockage en isolation, puis s'assurer
que cette seule migration est en attente. Dans backend :

```powershell
npx prisma migrate status
npx prisma migrate deploy
npx prisma generate
npm start
```

L'application locale ci-dessus est terminée ; ne pas la rejouer. Aucun reset ni
db push. Recontrôler douze migrations, le schéma et l'audit du stockage.

Le SQL de retour arrière versionné refuse de fonctionner si la configuration
ou une émission existe. Dans le cas vide seulement, il retire les deux tables
et le trigger/fonction ; les pièces existantes sont intactes. L'historique Prisma
doit être traité explicitement par l'opérateur selon la procédure de restauration,
sans effacement automatique des lignes de migration. Avec des émissions réelles,
préférer une correction vers l'avant ou une restauration conjointe validée.

## Vérifications réellement exécutées

- `npm run test:attestations` : 58 groupes de contrôles réussis sur un cluster neuf
  et son stockage distinct, rapport `.catalogue-test/auth-IvAWsD/auth-results.json`.
- Douze migrations appliquées en isolation, Prisma validate/generate et diff sans
  divergence ; rollback vide puis réapplication ; rollback refusé avec données.
- Aperçu, conditions bloquantes, capacité de participation partielle et complète,
  instantané et ancien PDF intacts après changements de formation/présence,
  correction motivée, requêtes rejouées, émission concurrente et double clic.
- Refus ADMIN/STAGIAIRE/anonyme, CSRF, propriété, PDF privé par défaut, partage et
  retrait ; pannes de génération/stockage et échec après promotion ; nettoyage
  compensatoire vérifié et audit sans orphelin.
- Régressions authentification, catalogue, sessions, inscriptions, dossiers,
  fichiers, espace stagiaire, questionnaires et présences dans cette même suite.
- Navigateur isolé `.catalogue-test/auth-L7GWA2` : connexion ADMIN, configuration,
  aperçu, motif, avertissement de sortie et retour sur fiche, confirmation,
  correction créée, rechargement et téléchargement réel. Mobile 390×844 sans
  débordement horizontal. Capture `attestation-mobile.png`.
- PDF finaux rendus via Poppler et inspectés visuellement : brouillon et émission
  courte d'une page, texte long de cinq pages. Pdfplumber vérifie A4, accents,
  durées et numérotation sur toutes les pages ; rapport `pdf-results.json` et
  planche `controle-pdf.png` dans le dossier de la dernière suite.
- Syntaxe Node de 67 fichiers ; lint et build React réussis.
- Vérification initiale avant application : onze migrations, tables d'attestations
  absentes, un compte, zéro inscription/dossier/fichier/présence ; audit privé
  sans anomalie et sans nettoyage. L'application et les contrôles locaux finaux
  sont détaillés en début de document ; aucune donnée fictive locale.

## Scénario manuel reproductible en isolation

```powershell
cd backend
npm run test:attestations -- --browser
```

Le script affiche l'URL isolée et le dossier de test. Les identifiants fictifs
restent dans `browser.json`, jamais dans les logs. Les identifiants de la fiche
sont dans `attestations-browser.json`. Ne pas utiliser la base de développement
pour les essais décrits ci-dessous.

1. Se connecter à l'URL isolée, ouvrir Organisme et enregistrer les coordonnées
   fictives de ce seul environnement ; tester une modification dans deux onglets.
2. Ouvrir le dossier indiqué par la fixture. Préparer l'aperçu et vérifier le
   filigrane, les dates, le total programmé et la durée réellement suivie.
3. Saisir un motif de correction. Cliquer sur Inscriptions : rester sur la fiche
   doit conserver le motif. Demander l'émission puis annuler la confirmation.
4. Confirmer l'émission. La nouvelle version devient la référence et reste privée.
   Télécharger le PDF, puis recharger : les anciennes versions restent accessibles.
5. Modifier la formation ou un relevé après un aperçu : l'émission depuis cet
   aperçu doit être refusée sans perdre le motif. Régénérer l'aperçu puis corriger.
6. Partager une version, vérifier son accès avec le stagiaire propriétaire de
   test, puis retirer le partage : le prochain téléchargement doit être refusé.
7. Vérifier sur mobile, au clavier et avec une session expirée. Les cas d'une
   session future, présence inconnue et zéro heure sont aussi couverts par l'API.

Terminer la fixture en créant le fichier vide `stop-browser` dans son dossier
de test pour arrêter ses serveurs et son cluster. Ne supprimer aucune base
préexistante. Aucun déploiement.

## Fichiers de cette étape

- backend/prisma/schema.prisma ; migration et rollback 20261111120000_attestations.
- backend/admin/attestations.js ; lib/attestations.js ; lib/attestation-pdf.js.
- backend/lib/documents.js ; backend/app.js ; package.json et package-lock.json.
- backend/assets/fonts/Vera.ttf, VeraBd.ttf et bitstream-vera-license.txt.
- backend/scripts/test-auth.mjs ; scripts/lib/test-attestations.mjs ; ce document.
- frontend/src/admin/OrganismeAttestation.jsx ; AttestationsDossier.jsx ;
  DossierAdministratif.jsx ; AdminWorkspace.jsx ; admin.css.
