-- À intégrer dans une migration compensatrice revue, jamais automatiquement.
BEGIN;
SET LOCAL lock_timeout = '5s';
LOCK TABLE "public"."Session" IN ACCESS EXCLUSIVE MODE;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM "public"."Session" WHERE "visiblePubliquement") THEN
    RAISE EXCEPTION 'Retour arrière refusé : des choix de visibilité doivent être conservés.';
  END IF;
END $$;
ALTER TABLE "public"."Session" DROP COLUMN "visiblePubliquement";
COMMIT;
