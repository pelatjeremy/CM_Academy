BEGIN;
SET LOCAL lock_timeout='5s';
CREATE TABLE "ParcoursPedagogique" (
 "formationId" TEXT PRIMARY KEY REFERENCES "Formation"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>0), "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE TABLE "ModulePedagogique" (
 id TEXT PRIMARY KEY, "formationId" TEXT NOT NULL REFERENCES "Formation"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 titre VARCHAR(160) NOT NULL CHECK(length(trim(titre))>0), ordre INTEGER NOT NULL CHECK(ordre>=0),
 publie BOOLEAN NOT NULL DEFAULT false, archive BOOLEAN NOT NULL DEFAULT false,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
 CHECK(NOT (archive AND publie))
);
CREATE UNIQUE INDEX "ModulePedagogique_formationId_ordre_key" ON "ModulePedagogique"("formationId",ordre);
CREATE TABLE "LeconPedagogique" (
 id TEXT PRIMARY KEY, "moduleId" TEXT NOT NULL REFERENCES "ModulePedagogique"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 titre VARCHAR(160) NOT NULL CHECK(length(trim(titre))>0), contenu TEXT NOT NULL DEFAULT '' CHECK(length(contenu)<=30000),
 ordre INTEGER NOT NULL CHECK(ordre>=0), publie BOOLEAN NOT NULL DEFAULT false, archive BOOLEAN NOT NULL DEFAULT false,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
 CHECK(NOT (archive AND publie)), CHECK(NOT publie OR length(trim(contenu))>0)
);
CREATE UNIQUE INDEX "LeconPedagogique_moduleId_ordre_key" ON "LeconPedagogique"("moduleId",ordre);
CREATE TABLE "SupportLecon" (
 id TEXT PRIMARY KEY, "leconId" TEXT NOT NULL REFERENCES "LeconPedagogique"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 "depotId" UUID NOT NULL UNIQUE, "stockageKey" UUID NOT NULL UNIQUE,
 "nomOriginal" VARCHAR(255) NOT NULL, taille INTEGER NOT NULL CHECK(taille>0),
 "typeMime" VARCHAR(32) NOT NULL CHECK("typeMime"='application/pdf'), empreinte CHAR(64) NOT NULL,
 archive BOOLEAN NOT NULL DEFAULT false, date TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "auteurId" TEXT NOT NULL REFERENCES "Utilisateur"(id) ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "SupportLecon_leconId_idx" ON "SupportLecon"("leconId");
CREATE INDEX "SupportLecon_auteurId_idx" ON "SupportLecon"("auteurId");
CREATE TABLE "ProgressionLecon" (
 "inscriptionId" TEXT NOT NULL REFERENCES "Inscription"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 "leconId" TEXT NOT NULL REFERENCES "LeconPedagogique"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 terminee BOOLEAN NOT NULL DEFAULT false, revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>0),
 "termineeAt" TIMESTAMP(3), "updatedAt" TIMESTAMP(3) NOT NULL,
 PRIMARY KEY("inscriptionId","leconId"), CHECK(terminee=("termineeAt" IS NOT NULL))
);
CREATE INDEX "ProgressionLecon_leconId_idx" ON "ProgressionLecon"("leconId");
CREATE FUNCTION progression_formation_coherente() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM "Inscription" i JOIN "Session" s ON s.id=i."sessionId"
 JOIN "ModulePedagogique" m ON m."formationId"=s."formationId" JOIN "LeconPedagogique" l ON l."moduleId"=m.id
 WHERE i.id=NEW."inscriptionId" AND l.id=NEW."leconId") THEN
  RAISE EXCEPTION 'Progression hors formation' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "ProgressionLecon_formation" BEFORE INSERT OR UPDATE ON "ProgressionLecon" FOR EACH ROW EXECUTE FUNCTION progression_formation_coherente();
COMMIT;
