BEGIN;
SET LOCAL lock_timeout = '5s';
LOCK TABLE "ElementDocumentaire", "PieceJointe" IN ACCESS EXCLUSIVE MODE;
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM "PieceJointe") OR EXISTS (SELECT 1 FROM "ElementDocumentaire" WHERE "fichierRevision" <> 0) THEN
        RAISE EXCEPTION 'Retour arrière refusé : des pièces jointes ou des versions existent.';
    END IF;
END $$;
DROP TABLE "PieceJointe";
ALTER TABLE "ElementDocumentaire" DROP CONSTRAINT "ElementDocumentaire_revision_positive", DROP COLUMN "fichierRevision";
COMMIT;
