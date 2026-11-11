BEGIN;
LOCK TABLE "ParcoursPedagogique","ModulePedagogique","LeconPedagogique","SupportLecon","ProgressionLecon" IN ACCESS EXCLUSIVE MODE;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM "ParcoursPedagogique") OR EXISTS(SELECT 1 FROM "ModulePedagogique") OR EXISTS(SELECT 1 FROM "LeconPedagogique") OR EXISTS(SELECT 1 FROM "SupportLecon") OR EXISTS(SELECT 1 FROM "ProgressionLecon") THEN
  RAISE EXCEPTION 'Retour arriere refuse : parcours, supports ou progressions presents. Preserver base et stockage conjointement.';
 END IF;
END $$;
DROP TABLE "ProgressionLecon","SupportLecon","LeconPedagogique","ModulePedagogique","ParcoursPedagogique";
DROP FUNCTION progression_formation_coherente();
COMMIT;
