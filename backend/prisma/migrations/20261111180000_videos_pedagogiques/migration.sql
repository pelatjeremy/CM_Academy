BEGIN;
SET LOCAL lock_timeout='5s';
CREATE TABLE "VideoLecon" (
 id TEXT PRIMARY KEY,
 "leconId" TEXT NOT NULL REFERENCES "LeconPedagogique"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 version INTEGER NOT NULL CHECK(version>0),
 "depotId" UUID NOT NULL UNIQUE, "stockageKey" UUID NOT NULL UNIQUE,
 "nomOriginal" VARCHAR(255) NOT NULL, taille INTEGER NOT NULL CHECK(taille>0),
 "typeMime" VARCHAR(32) NOT NULL CHECK("typeMime"='video/mp4'), empreinte CHAR(64) NOT NULL CHECK(empreinte ~ '^[0-9a-f]{64}$'),
 titre VARCHAR(160) NOT NULL CHECK(length(trim(titre))>0),
 description VARCHAR(3000) NOT NULL DEFAULT '', transcription TEXT NOT NULL DEFAULT '' CHECK(length(transcription)<=30000),
 "dureeSecondes" DOUBLE PRECISION NOT NULL CHECK("dureeSecondes">0 AND "dureeSecondes"<='86400'::float8),
 date TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "auteurId" TEXT NOT NULL REFERENCES "Utilisateur"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 "retireAt" TIMESTAMP(3), "retireParId" TEXT REFERENCES "Utilisateur"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 CHECK(("retireAt" IS NULL)=("retireParId" IS NULL))
);
CREATE UNIQUE INDEX "VideoLecon_leconId_version_key" ON "VideoLecon"("leconId",version);
CREATE UNIQUE INDEX "VideoLecon_active_unique" ON "VideoLecon"("leconId") WHERE "retireAt" IS NULL;
CREATE INDEX "VideoLecon_auteurId_idx" ON "VideoLecon"("auteurId");
CREATE INDEX "VideoLecon_retireParId_idx" ON "VideoLecon"("retireParId");
CREATE FUNCTION video_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Conserver les versions vidéo' USING ERRCODE='23514'; END IF;
 IF OLD."retireAt" IS NOT NULL OR (to_jsonb(NEW)-'retireAt'-'retireParId') IS DISTINCT FROM (to_jsonb(OLD)-'retireAt'-'retireParId')
 OR NEW."retireAt" IS NULL THEN RAISE EXCEPTION 'Version vidéo immuable' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "VideoLecon_immutable" BEFORE UPDATE OR DELETE ON "VideoLecon" FOR EACH ROW EXECUTE FUNCTION video_immutable();
COMMIT;
