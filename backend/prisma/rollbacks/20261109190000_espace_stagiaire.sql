BEGIN;
LOCK TABLE "InvitationStagiaire","RattachementStagiaire","PartagePieceJointe","PieceJointe" IN ACCESS EXCLUSIVE MODE;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM "InvitationStagiaire") OR EXISTS(SELECT 1 FROM "RattachementStagiaire")
 OR EXISTS(SELECT 1 FROM "PartagePieceJointe") OR EXISTS(SELECT 1 FROM "PieceJointe" WHERE "partageRevision" <> 0 OR "partageStagiaire")
 OR EXISTS(SELECT 1 FROM "Utilisateur" WHERE role::text='STAGIAIRE') THEN
 RAISE EXCEPTION 'Retour arrière refusé : données stagiaires ou décisions de partage présentes.';
 END IF;
END $$;
DROP TABLE "RattachementStagiaire","InvitationStagiaire","PartagePieceJointe";
ALTER TABLE "PieceJointe" DROP COLUMN "partageStagiaire", DROP COLUMN "partageRevision";
-- PostgreSQL ne retire pas une valeur d'enum sans recréer le type.
-- STAGIAIRE reste réservé, inutilisé. Ne pas réécrire l'historique Prisma automatiquement.
COMMIT;
