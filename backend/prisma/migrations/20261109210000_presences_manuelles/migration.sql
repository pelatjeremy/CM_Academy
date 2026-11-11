BEGIN;
SET LOCAL lock_timeout='5s';
CREATE TYPE "EtatPresence" AS ENUM ('NON_RENSEIGNE','PRESENT','PARTIEL','ABSENT');
CREATE TABLE "Presence" (
 "inscriptionId" TEXT NOT NULL REFERENCES "Inscription"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "seanceId" TEXT NOT NULL REFERENCES "Seance"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "etat" "EtatPresence" NOT NULL,
 "dureeSuivieMs" BIGINT,
 "debut" TIMESTAMPTZ(3) NOT NULL, "fin" TIMESTAMPTZ(3) NOT NULL,
 "revision" INTEGER NOT NULL DEFAULT 1 CHECK ("revision">0),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL,
 "modifieParId" TEXT NOT NULL REFERENCES "Utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "motifCorrection" VARCHAR(500) NOT NULL DEFAULT '',
 PRIMARY KEY ("inscriptionId","seanceId"),
 CHECK (isfinite("debut") AND isfinite("fin") AND "fin">"debut"),
 CHECK (
  ("etat"='NON_RENSEIGNE' AND "dureeSuivieMs" IS NULL) OR
  ("etat"='ABSENT' AND "dureeSuivieMs"=0) OR
  ("etat"='PRESENT' AND "dureeSuivieMs"=(extract(epoch FROM ("fin"-"debut"))*1000)::bigint) OR
  ("etat"='PARTIEL' AND "dureeSuivieMs"%60000=0 AND "dureeSuivieMs">0 AND "dureeSuivieMs"<(extract(epoch FROM ("fin"-"debut"))*1000)::bigint)
 ),
 CHECK (("etat"='NON_RENSEIGNE')=("dureeSuivieMs" IS NULL))
);
CREATE INDEX "Presence_seanceId_idx" ON "Presence"("seanceId");
CREATE INDEX "Presence_modifieParId_idx" ON "Presence"("modifieParId");
CREATE TABLE "ChangementPresence" (
 "id" TEXT PRIMARY KEY,
 "inscriptionId" TEXT NOT NULL, "seanceId" TEXT NOT NULL,
 "ancienEtat" "EtatPresence", "nouvelEtat" "EtatPresence" NOT NULL,
 "ancienneDureeMs" BIGINT, "nouvelleDureeMs" BIGINT,
 "motif" VARCHAR(500) NOT NULL DEFAULT '',
 "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "auteurId" TEXT NOT NULL REFERENCES "Utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 FOREIGN KEY ("inscriptionId","seanceId") REFERENCES "Presence"("inscriptionId","seanceId") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "ChangementPresence_inscriptionId_seanceId_date_idx" ON "ChangementPresence"("inscriptionId","seanceId","date");
CREATE INDEX "ChangementPresence_auteurId_idx" ON "ChangementPresence"("auteurId");
CREATE FUNCTION cmh_presence_controler() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE i "Inscription"%ROWTYPE; s "Seance"%ROWTYPE;
BEGIN
 SELECT * INTO i FROM "Inscription" WHERE id=NEW."inscriptionId" FOR UPDATE;
 SELECT * INTO s FROM "Seance" WHERE id=NEW."seanceId" FOR UPDATE;
 IF i.id IS NULL OR s.id IS NULL OR i."sessionId"<>s."sessionId" THEN
  RAISE EXCEPTION 'Références de présence incohérentes' USING ERRCODE='23514',CONSTRAINT='Presence_session_coherente';
 END IF;
 IF i.statut<>'CONFIRMEE' OR s.debut>clock_timestamp() THEN
  RAISE EXCEPTION 'Saisie de présence indisponible' USING ERRCODE='23514',CONSTRAINT='Presence_saisie_autorisee';
 END IF;
 IF NEW.debut IS DISTINCT FROM s.debut OR NEW.fin IS DISTINCT FROM s.fin THEN
  RAISE EXCEPTION 'Horaires modifiés' USING ERRCODE='23514',CONSTRAINT='Presence_horaires_attendus';
 END IF;
 IF TG_OP='UPDATE' THEN
  IF NEW."inscriptionId"<>OLD."inscriptionId" OR NEW."seanceId"<>OLD."seanceId" OR NEW.debut<>OLD.debut OR NEW.fin<>OLD.fin OR NEW.revision<>OLD.revision+1 THEN
   RAISE EXCEPTION 'Révision de présence incohérente' USING ERRCODE='23514',CONSTRAINT='Presence_revision_coherente';
  END IF;
  IF (NEW.etat IS DISTINCT FROM OLD.etat OR NEW."dureeSuivieMs" IS DISTINCT FROM OLD."dureeSuivieMs") AND length(btrim(NEW."motifCorrection"))=0 THEN
   RAISE EXCEPTION 'Motif de correction obligatoire' USING ERRCODE='23514',CONSTRAINT='Presence_motif_obligatoire';
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER cmh_presence_controler BEFORE INSERT OR UPDATE ON "Presence" FOR EACH ROW EXECUTE FUNCTION cmh_presence_controler();
CREATE FUNCTION cmh_presence_historiser() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  INSERT INTO "ChangementPresence" (id,"inscriptionId","seanceId","nouvelEtat","nouvelleDureeMs",motif,"auteurId",date)
  VALUES (gen_random_uuid()::text,NEW."inscriptionId",NEW."seanceId",NEW.etat,NEW."dureeSuivieMs",NEW."motifCorrection",NEW."modifieParId",timezone('UTC',clock_timestamp()));
 ELSIF NEW.etat IS DISTINCT FROM OLD.etat OR NEW."dureeSuivieMs" IS DISTINCT FROM OLD."dureeSuivieMs" THEN
  INSERT INTO "ChangementPresence" (id,"inscriptionId","seanceId","ancienEtat","nouvelEtat","ancienneDureeMs","nouvelleDureeMs",motif,"auteurId",date)
  VALUES (gen_random_uuid()::text,NEW."inscriptionId",NEW."seanceId",OLD.etat,NEW.etat,OLD."dureeSuivieMs",NEW."dureeSuivieMs",NEW."motifCorrection",NEW."modifieParId",timezone('UTC',clock_timestamp()));
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER cmh_presence_historiser AFTER INSERT OR UPDATE ON "Presence" FOR EACH ROW EXECUTE FUNCTION cmh_presence_historiser();
CREATE FUNCTION cmh_presences_verrouiller_seance() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (NEW.debut IS DISTINCT FROM OLD.debut OR NEW.fin IS DISTINCT FROM OLD.fin OR NEW."sessionId" IS DISTINCT FROM OLD."sessionId")
 AND EXISTS(SELECT 1 FROM "Presence" WHERE "seanceId"=OLD.id) THEN
  RAISE EXCEPTION 'Séance avec présences : horaires verrouillés' USING ERRCODE='23514',CONSTRAINT='Presence_seance_verrouillee';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER cmh_presences_verrouiller_seance BEFORE UPDATE ON "Seance" FOR EACH ROW EXECUTE FUNCTION cmh_presences_verrouiller_seance();
CREATE FUNCTION cmh_presences_verrouiller_inscription() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW."sessionId" IS DISTINCT FROM OLD."sessionId" AND EXISTS(SELECT 1 FROM "Presence" WHERE "inscriptionId"=OLD.id) THEN
  RAISE EXCEPTION 'Inscription avec présences : session verrouillée' USING ERRCODE='23514',CONSTRAINT='Presence_inscription_verrouillee';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER cmh_presences_verrouiller_inscription BEFORE UPDATE ON "Inscription" FOR EACH ROW EXECUTE FUNCTION cmh_presences_verrouiller_inscription();
COMMIT;
