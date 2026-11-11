-- À utiliser comme migration compensatrice après revue, pas en exécution automatique.
BEGIN;
SET LOCAL lock_timeout = '5s';
LOCK TABLE "public"."SessionAccesPrive" IN ACCESS EXCLUSIVE MODE;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM "public"."SessionAccesPrive" WHERE "consignes" <> '' OR "lienVisioconference" IS NULL) THEN
    RAISE EXCEPTION 'Retour arrière refusé : les nouvelles informations privées doivent être conservées.';
  END IF;
END $$;
ALTER TABLE "public"."SessionAccesPrive"
    DROP COLUMN "consignes",
    DROP CONSTRAINT "SessionAccesPrive_lien_check",
    ALTER COLUMN "lienVisioconference" SET NOT NULL,
    ADD CONSTRAINT "SessionAccesPrive_lien_check" CHECK (length(btrim("lienVisioconference")) > 0);
COMMIT;
