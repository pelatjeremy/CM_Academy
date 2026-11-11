-- Consignes conservées exclusivement dans la table privée.
-- Les liens déjà présents restent inchangés.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
ALTER TABLE "public"."SessionAccesPrive"
    ADD COLUMN "consignes" TEXT NOT NULL DEFAULT '',
    ALTER COLUMN "lienVisioconference" DROP NOT NULL,
    DROP CONSTRAINT "SessionAccesPrive_lien_check",
    ADD CONSTRAINT "SessionAccesPrive_lien_check"
        CHECK ("lienVisioconference" IS NULL OR length(btrim("lienVisioconference")) > 0);
COMMIT;
