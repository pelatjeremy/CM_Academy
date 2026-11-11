# Questionnaires nominatifs — collecte manuelle

Migration 20261109200000_questionnaires appliquée le 9 novembre 2026 à
localhost:5432/cmh_academy_dev avec prisma migrate deploy, après vérification
des neuf migrations antérieures, de leurs empreintes et de l'absence de divergence.
Dix migrations sont terminées, Prisma est régénéré et le backend redémarré.
Aucune donnée fictive n'est ajoutée à la base ou au stockage réels.
Aucun déploiement, email, score automatique ou traitement planifié.

## Application locale vérifiée

Sauvegarde conjointe hors versionnement :
.local-backups/questionnaires-20261109-9dND36/avant-questionnaires.dump et stockage-prive/.
Le backend a été arrêté pendant la sauvegarde et l'application.
La restauration sur un cluster neuf et un stockage isolé a été comparée à la
source : données, colonnes, contraintes, index, historique et empreintes des fichiers.
Le stockage était vide ; sa restauration est donc vérifiée comme telle.
Audit sans anomalie, sans nettoyage. Aucune migration inattendue n'a été appliquée.

Volumétrie avant/après : un compte, une formation, un pôle, un formateur, une
session et une séance conservés ; zéro inscription, dossier et fichier avant/après.
Les nouvelles tables contiennent zéro modèle et zéro questionnaire attribué.
Toutes les données antérieures, y compris leurs valeurs, sont comparées strictement.

Contrôles locaux : connexion ADMIN réelle, liste des modèles vide, pages publiques
et connexion stagiaire accessibles ; modèles/attributions/réponses et téléchargements
anonymes refusés en 401 ; aucune question ou réponse individuelle dans les DTO publics.
Huit FK RESTRICT et l'index unique partiel sont présents.
Les rôles 403, réponses et parcours stagiaire sont revérifiés exclusivement sur la
nouvelle base isolée de test : .catalogue-test/auth-HL7CxR/auth-results.json.
Syntaxe Node, lint et build réussis.
Le premier précontrôle s'est arrêté avant toute migration à cause de la reconstruction
du schéma précédent : les accolades du défaut JSON doivent être distinguées de la
fin d'un modèle Prisma. Le script est corrigé ; les diagnostics sont conservés.

Scripts d'exploitation : scripts/apply-questionnaires-local.mjs --apply
(refuse une réexécution une fois les dix migrations appliquées),
scripts/verify-questionnaires-local.mjs. Rapports dans le dossier de sauvegarde :
resultats.json et controles-locaux.json, sans coordonnées ni réponses.

## Modèle et conservation des questions

ModeleQuestionnaire contient titre, catégorie, questions ordonnées, indicateur
de validation, révision, dates et auteurs de création/modification.
Les catégories sont positionnement, satisfaction à chaud et satisfaction à froid.
Un modèle se crée en brouillon. Chaque enregistrement le remet en brouillon ;
la validation explicite est obligatoire avant attribution.

Les cinq types autorisés sont texte court, texte long, choix unique,
choix multiple et note entière de 1 à 5.
Questions et choix ont des identifiants UUID stables ; leur ordre est celui
du tableau JSON. Les libellés, types, choix et obligations sont copiés ensemble.

QuestionnaireAttribue référence un dossier (donc son inscription) et le modèle
source. Il copie titre, catégorie, questions et révision du modèle au moment
de l'attribution. Ses réponses ne dépendent plus des modifications ultérieures
du modèle, qui ne changent ni ses questions ni ses paramètres.

Aucune attribution automatique, même si le parcours documentaire est activé.
Un dossier dont le suivi documentaire est désactivé peut recevoir un questionnaire.
Les états manuels des éléments documentaires ne sont jamais modifiés par ce bloc.

Il existe au maximum une attribution non retirée d'un même modèle par inscription,
y compris après envoi : cette règle évite une attribution active en double.
Une nouvelle attribution de ce modèle est possible après un retrait.
Pour un nouveau recueil après un envoi, préparer un autre modèle ;
la répétition automatique et les campagnes ne font pas partie de cette étape.

## États, auteurs et concurrence

Les états sont À compléter, Brouillon, Envoyé et Retiré.
L'attribution conserve auteur/date ; les sauvegardes de brouillon conservent
leur auteur et leur dernière date ; envoi et retrait conservent chacun auteur/date.
Les clés étrangères sont RESTRICT, sans suppression physique par les routes.

L'attribution porte une clé UUID de requête, conservée lors d'une reprise d'envoi.
Un rejeu avec les mêmes inscription/modèle/révision/auteur retourne la même
attribution. Une réutilisation de clé pour une autre opération est refusée.
L'index unique partiel protège aussi contre une nouvelle clé générée par erreur.
L'interface verrouille immédiatement les doubles clics.

Révisions attendues et transactions sérialisables protègent brouillons, retraits
et envois. Lors d'une course retrait/envoi, une seule opération aboutit :
l'autre reçoit 409. Un état Envoyé ou Retiré ne redevient jamais modifiable.
Un retrait répété conserve sa date et son auteur initiaux.

La soumission répétée des mêmes réponses renvoie le même état/date, sans créer
une autre soumission. Une tentative de modification après envoi est refusée.
Le contenu est comparé en ignorant l'ordre des clés de l'objet ; l'ordre des
tableaux de choix demeure celui transmis.
Il n'existe pas de correction de réponse envoyée dans ce périmètre.

Les saisies restent en mémoire en cas d'erreur ou de conflit.
Le conflit bloque une nouvelle sauvegarde avant rechargement volontaire.
Le remplacement par la version enregistrée demande confirmation.
Les liens de navigation et la déconnexion demandent confirmation si des saisies
ne sont pas enregistrées ; le navigateur prévient aussi avant fermeture/rechargement.

## Validation et confidentialité

Limites serveur :
- titre 160 caractères ;
- quarante questions ; libellé de question 500 caractères ;
- vingt choix par question, libellé de choix 200 caractères ;
- au moins deux choix distincts et non vides pour valider un choix unique/multiple ;
- texte court 500 caractères, texte long 5000 caractères ;
- note numérique entière de 1 à 5, aucun nombre reçu sous forme de chaîne ;
- tableau de choix multiples sans doublons, avec uniquement les identifiants figés ;
- définitions et réponses limitées chacune à 64 Ko ; corps HTTP limité à 128 Ko.

Un brouillon de réponses peut être incomplet ; les réponses présentes doivent
néanmoins respecter type, choix et taille. Les champs obligatoires sont vérifiés
côté client puis serveur lors de l'envoi définitif.
Une réponse à une question étrangère et les champs de requête non autorisés
sont refusés. Les textes sont rendus par React, sans injection HTML.

Toutes les routes de modèles/attributions sont ADMIN.
Chaque route stagiaire contrôle le rôle et le rattachement courant à l'inscription,
y compris lecture, liste, brouillon et soumission avec un identifiant deviné.
Les écritures reprennent CSRF, origine autorisée et sessions PostgreSQL existants.
ADMIN ne peut pas utiliser les routes de réponse réservées au STAGIAIRE.

Les réponses sont nominatives. Elles ne sont jamais ajoutées au catalogue public,
aux métadonnées des fichiers ni aux journaux.
Les brouillons ne sont pas envoyés dans les réponses administratives :
l'administration voit leur état, mais seulement les réponses définitivement envoyées.
Le stagiaire ne reçoit pas les identifiants des acteurs administratifs.
Les notes internes et les accès privés de session restent exclus de ses réponses.
Aucun jeton ou formulaire n'est enregistré dans localStorage/sessionStorage.

## Interface et routes

Administration : /admin/questionnaires et /admin/questionnaires/:id
(nouveau pour une création).
Le dossier reçoit une section Questionnaires nominatifs : recherche des modèles
validés, attribution, états, auteurs/dates, retrait confirmé et réponses soumises.
La satisfaction à froid est attribuée manuellement ici, sans déclenchement à trois mois.

Stagiaire : sa fiche de formation liste les questionnaires ; l'URL de réponse est
/stagiaire/inscriptions/:inscriptionId/questionnaires/:id.
Le formulaire propose Enregistrer le brouillon et Envoyer mes réponses, puis
une confirmation d'envoi définitif. Envoyé et Retiré sont en lecture seule.

API ADMIN :
- GET/POST /api/admin/questionnaires/modeles
- GET/PUT /api/admin/questionnaires/modeles/:id
- POST /api/admin/questionnaires/modeles/:id/valider
- GET/POST /api/admin/inscriptions/:id/questionnaires
- POST /api/admin/inscriptions/:id/questionnaires/:questionnaireId/retirer

API STAGIAIRE propriétaire :
- GET /api/stagiaire/inscriptions/:id/questionnaires
- GET /api/stagiaire/inscriptions/:id/questionnaires/:questionnaireId
- PUT .../:questionnaireId/brouillon
- POST .../:questionnaireId/soumettre

Les listes de modèles sont paginées par vingt, avec recherche.
Les consultations seules ne modifient aucune donnée questionnaire.

## Migration et retour arrière

Le SQL crée deux types enum et deux tables dans une transaction.
Il n'attribue aucun questionnaire aux inscriptions existantes et ne modifie
aucune table métier existante.

Le rollback versionné refuse de s'exécuter dès qu'un modèle ou une attribution
existe, même retirée. Il ne supprime pas silencieusement de réponse.
Sur un environnement remis explicitement en état vide, il retire les nouvelles
tables et enums. L'essai de retour arrière et réapplication est isolé.
Ne jamais réécrire automatiquement l'historique Prisma après un rollback manuel.

Procédure d'application utilisée : vérifier destination,
neuf migrations et leurs empreintes, absence de divergence, sauvegarde conjointe
et restauration isolée, puis seulement le mécanisme prisma migrate deploy.
Ne pas utiliser reset ou db push. Conserver l'historique et les données existantes.

## Tests réellement exécutés

- npm run test:questionnaires : migration réelle Prisma sur cluster neuf,
  client et stockage isolés ; validation des modèles, choix/types/tailles,
  conflits de modèles, attribution idempotente/concurrente, snapshot conservé,
  brouillon incomplet, champs obligatoires, deux onglets concurrents, envois
  simultanés et répétés, immuabilité, retrait daté/idempotent, course retrait/envoi,
  réattribution après retrait, auteurs, 401/403/404, CSRF et confidentialité.
- La même suite reprend authentification, pôles, formateurs, formations, sessions,
  catalogue public, préinscriptions, dossiers, pièces jointes et espace stagiaire.
- node scripts/test-questionnaires-schema.mjs : SQL/Prisma sans divergence,
  données préexistantes conservées, aucune attribution implicite, contraintes JSON/
  révision/état/date/auteur, index d'unicité, FK RESTRICT, rollback protégé et réapplication.
- Régressions SQL : test:catalogue, test-stagiaires-schema.mjs,
  test-documents-schema.mjs et test-dossiers-schema.mjs.
- Navigateur isolé : création d'un modèle à deux questions, obligation et type note,
  sauvegarde/validation confirmée, attribution depuis dossier, connexion stagiaire,
  champ obligatoire, brouillon explicite, garde de sortie, conflit entre deux
  onglets avec saisie conservée et rechargement confirmé, envoi confirmé,
  lecture seule après rechargement, consultation nominative ADMIN et retrait
  manuel de satisfaction à froid. Clavier et mobile 390 px sans débordement horizontal.
  Les trois autres types de réponse sont vérifiés par l'API, pas saisis au navigateur.
- Syntaxe Node de 54 fichiers, frontend lint et build réussis.
- Inspection statique : aucune sortie de réponses dans console, aucun stockage Web
  ni dangerouslySetInnerHTML dans les nouveaux fichiers.
- Contrôle initial avant application de cmh_academy_dev : neuf migrations, aucune table ModeleQuestionnaire,
  zéro inscription et fichier.

Rapports hors versionnement :
.catalogue-test/auth-eJXtdD/auth-results.json
.catalogue-test/auth-xaRhOh/auth-results.json (dernière suite complète, validations finales)
.catalogue-test/auth-eJXtdD/questionnaires-browser-results.json
.catalogue-test/auth-Ra5ale/questionnaires-schema-results.json
.catalogue-test/run-mhO9Ev/resultats.json
.catalogue-test/auth-cmqlrg/stagiaires-schema-results.json
.catalogue-test/auth-nWpLV5/documents-schema-results.json
.catalogue-test/auth-cus1RA/dossiers-schema-results.json

L'avertissement de dépréciation pg déjà présent sur les requêtes concurrentes
du client apparaît pendant les régressions, sans échec.

## Scénario manuel reproductible sans données réelles

1. Depuis backend : npm run test:questionnaires -- --browser.
2. Ouvrir l'origine isolée annoncée. Le fichier browser.json du répertoire indiqué
   contient le compte administrateur temporaire ; ne pas publier ces identifiants.
3. Dans Questionnaires, créer un modèle Positionnement : texte court obligatoire,
   note facultative ; enregistrer puis valider.
4. Ouvrir le dossier dont l'id est dans questionnaires-browser.json,
   sélectionner ce modèle et l'attribuer.
5. Si le compte navigateur n'est pas encore rattaché, ouvrir le détail de son
   inscription, préparer une invitation et l'activer avec son mot de passe existant
   indiqué dans questionnaires-browser.json. Aucun nouveau mot de passe n'est imposé.
6. Se connecter comme ce stagiaire, ouvrir sa formation puis le questionnaire.
7. Essayer un envoi vide ; renseigner les réponses et enregistrer le brouillon.
8. Ouvrir un second onglet, modifier/enregistrer le premier puis tenter une sauvegarde
   du second. Vérifier le conflit, les saisies conservées et le rechargement confirmé.
9. Envoyer depuis le premier onglet avec confirmation ; recharger et vérifier
   l'absence d'action de modification.
10. Comme ADMIN, consulter les réponses nominatives et la date dans le dossier.
11. Attribuer un modèle de satisfaction à froid puis le retirer avant soumission :
    vérifier la trace et le refus de soumission côté stagiaire.
12. Créer stop-browser dans le répertoire isolé annoncé pour arrêter le dispositif.

Aucun des tests ne doit être reconfiguré vers cmh_academy_dev ou son stockage.

## Fichiers modifiés / ajoutés

Backend :
- prisma/schema.prisma
- prisma/migrations/20261109200000_questionnaires/migration.sql
- prisma/rollbacks/20261109200000_questionnaires.sql
- lib/questionnaires.js, admin/questionnaires.js, questionnaires-stagiaire.js, app.js
- package.json (script de test uniquement, aucune dépendance ajoutée)
- scripts/lib/test-questionnaires.mjs, scripts/test-questionnaires-schema.mjs
- scripts/test-auth.mjs, test-catalogue.mjs, test-stagiaires-schema.mjs,
  test-documents-schema.mjs, test-dossiers-schema.mjs
- docs/questionnaires.md

Frontend :
- src/questionnaires/labels.js, QuestionnaireCommun.jsx
- src/components/ExitDialog.jsx (extrait du composant existant pour réutilisation)
- src/admin/QuestionnaireModeles.jsx, QuestionnairesDossier.jsx,
  AdminWorkspace.jsx, DossierAdministratif.jsx, api.js, admin.css
- src/stagiaire/QuestionnairesInscription.jsx, QuestionnaireReponses.jsx,
  EspaceStagiaire.jsx
- src/App.jsx.
