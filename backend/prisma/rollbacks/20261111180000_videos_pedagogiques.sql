BEGIN;
SET LOCAL lock_timeout='5s';
LOCK TABLE "VideoLecon" IN ACCESS EXCLUSIVE MODE;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM "VideoLecon") THEN RAISE EXCEPTION 'Rollback refusé : vidéos ou historique présents'; END IF;
END $$;
DROP TABLE "VideoLecon";
DROP FUNCTION video_immutable();
COMMIT;
