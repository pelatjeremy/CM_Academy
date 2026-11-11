BEGIN;
SET LOCAL lock_timeout = '5s';
CREATE TABLE "OrganismeAttestation" (
 "id" TEXT PRIMARY KEY DEFAULT 'principal' CHECK ("id"='principal'),
 "denomination" VARCHAR(200) NOT NULL, "adresse" VARCHAR(1000) NOT NULL,
 "identifiant" VARCHAR(100) NOT NULL DEFAULT '', "representant" VARCHAR(200) NOT NULL DEFAULT '',
 "revision" INTEGER NOT NULL DEFAULT 1 CHECK ("revision">0), "updatedAt" TIMESTAMP(3) NOT NULL,
 "modifieParId" TEXT NOT NULL REFERENCES "Utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "OrganismeAttestation_modifieParId_idx" ON "OrganismeAttestation"("modifieParId");
CREATE TABLE "AttestationEmission" (
 "id" TEXT PRIMARY KEY,
 "inscriptionId" TEXT NOT NULL REFERENCES "DossierAdministratif"("inscriptionId") ON DELETE RESTRICT ON UPDATE CASCADE,
 "pieceJointeId" TEXT NOT NULL UNIQUE REFERENCES "PieceJointe"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "requeteId" UUID NOT NULL UNIQUE, "empreinteRequete" CHAR(64) NOT NULL,
 "reference" VARCHAR(64) NOT NULL UNIQUE, "numero" INTEGER NOT NULL CHECK ("numero">0),
 "courante" BOOLEAN NOT NULL DEFAULT true, "modeleVersion" VARCHAR(32) NOT NULL,
 "donnees" JSONB NOT NULL CHECK (jsonb_typeof("donnees")='object'),
 "motif" VARCHAR(500) NOT NULL DEFAULT '', "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "auteurId" TEXT NOT NULL REFERENCES "Utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CHECK ("numero"=1 OR length(trim("motif"))>0)
);
CREATE UNIQUE INDEX "AttestationEmission_inscriptionId_numero_key" ON "AttestationEmission"("inscriptionId","numero");
CREATE UNIQUE INDEX "AttestationEmission_courante_unique" ON "AttestationEmission"("inscriptionId") WHERE "courante";
CREATE INDEX "AttestationEmission_auteurId_idx" ON "AttestationEmission"("auteurId");
CREATE FUNCTION proteger_attestation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Attestation immuable' USING ERRCODE='23514'; END IF;
 IF TG_OP='UPDATE' AND ((to_jsonb(NEW)-'courante') IS DISTINCT FROM (to_jsonb(OLD)-'courante') OR NOT OLD."courante" OR NEW."courante") THEN
  RAISE EXCEPTION 'Attestation immuable' USING ERRCODE='23514';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM "PieceJointe" p WHERE p.id=NEW."pieceJointeId" AND p."inscriptionId"=NEW."inscriptionId" AND p.categorie='ATTESTATION' AND p."typeMime"='application/pdf' AND p."auteurId"=NEW."auteurId") THEN
  RAISE EXCEPTION 'Piece attestation incoherente' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "AttestationEmission_immutable" BEFORE INSERT OR UPDATE OR DELETE ON "AttestationEmission" FOR EACH ROW EXECUTE FUNCTION proteger_attestation();
COMMIT;
