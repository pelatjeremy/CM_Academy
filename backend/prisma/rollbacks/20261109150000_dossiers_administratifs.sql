-- À employer sur une base isolée ou dans une migration compensatrice revue.
BEGIN;
SET LOCAL lock_timeout = '5s';
LOCK TABLE "DossierAdministratif", "ElementDocumentaire", "ChangementDocumentaire" IN ACCESS EXCLUSIVE MODE;
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM "DossierAdministratif")
        OR EXISTS (SELECT 1 FROM "ElementDocumentaire")
        OR EXISTS (SELECT 1 FROM "ChangementDocumentaire") THEN
        RAISE EXCEPTION 'Retour arrière refusé : des dossiers ou un historique existent.';
    END IF;
END $$;
DROP TABLE "ChangementDocumentaire";
DROP TABLE "ElementDocumentaire";
DROP TABLE "DossierAdministratif";
DROP TYPE "EtatDocumentaire";
DROP TYPE "CategorieDocumentaire";
COMMIT;
