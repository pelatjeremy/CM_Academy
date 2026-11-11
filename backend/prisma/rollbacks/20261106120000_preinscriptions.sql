-- Pour la base d'essai ou une migration compensatrice revue.
BEGIN;
SET LOCAL lock_timeout = '5s';
LOCK TABLE "Session", "Inscription", "ChangementInscription" IN ACCESS EXCLUSIVE MODE;
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM "Inscription") OR EXISTS (SELECT 1 FROM "ChangementInscription")
        OR EXISTS (SELECT 1 FROM "Session" WHERE "preinscriptionsOuvertes") THEN
        RAISE EXCEPTION 'Retour arrière refusé : des demandes ou des ouvertures existent.';
    END IF;
END $$;
DROP TABLE "ChangementInscription";
DROP TABLE "Inscription";
DROP TYPE "StatutInscription";
DROP TYPE "TypeDemandeInscription";
ALTER TABLE "Session" DROP COLUMN "preinscriptionsOuvertes";
COMMIT;
