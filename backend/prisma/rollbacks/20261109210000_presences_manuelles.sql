BEGIN;
LOCK TABLE "Presence","ChangementPresence" IN ACCESS EXCLUSIVE MODE;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM "Presence") OR EXISTS(SELECT 1 FROM "ChangementPresence") THEN
 RAISE EXCEPTION 'Retour arrière refusé : présences ou historique présents.';
 END IF;
END $$;
DROP TRIGGER cmh_presence_controler ON "Presence";
DROP TRIGGER cmh_presence_historiser ON "Presence";
DROP TRIGGER cmh_presences_verrouiller_seance ON "Seance";
DROP TRIGGER cmh_presences_verrouiller_inscription ON "Inscription";
DROP FUNCTION cmh_presence_controler(),cmh_presence_historiser(),cmh_presences_verrouiller_seance(),cmh_presences_verrouiller_inscription();
DROP TABLE "ChangementPresence","Presence";
DROP TYPE "EtatPresence";
COMMIT;
