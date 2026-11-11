-- Aucune session existante ne devient publique implicitement.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
ALTER TABLE "public"."Session"
  ADD COLUMN "visiblePubliquement" BOOLEAN NOT NULL DEFAULT false;
COMMIT;
