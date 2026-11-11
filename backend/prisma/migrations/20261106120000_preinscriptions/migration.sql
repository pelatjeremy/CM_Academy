BEGIN;
SET LOCAL lock_timeout = '5s';
ALTER TABLE "Session" ADD COLUMN "preinscriptionsOuvertes" BOOLEAN NOT NULL DEFAULT false;

CREATE TYPE "TypeDemandeInscription" AS ENUM ('PARTICULIER', 'PROFESSIONNEL_FINANCEMENT');
CREATE TYPE "StatutInscription" AS ENUM ('EN_ATTENTE', 'CONFIRMEE', 'REFUSEE', 'ANNULEE');

CREATE TABLE "Inscription" (
    "id" TEXT PRIMARY KEY,
    "sessionId" TEXT NOT NULL REFERENCES "Session"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "prenom" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "typeDemande" "TypeDemandeInscription" NOT NULL,
    "organismeEnvisage" TEXT,
    "statut" "StatutInscription" NOT NULL DEFAULT 'EN_ATTENTE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Inscription_email_normalise" CHECK ("email" = lower(btrim("email"))),
    CONSTRAINT "Inscription_organisme_professionnel" CHECK ("organismeEnvisage" IS NULL OR "typeDemande" = 'PROFESSIONNEL_FINANCEMENT')
);

CREATE UNIQUE INDEX "Inscription_sessionId_email_key" ON "Inscription"("sessionId", "email");
CREATE INDEX "Inscription_sessionId_statut_idx" ON "Inscription"("sessionId", "statut");

CREATE TABLE "ChangementInscription" (
    "id" TEXT PRIMARY KEY,
    "inscriptionId" TEXT NOT NULL REFERENCES "Inscription"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "ancienStatut" "StatutInscription",
    "nouveauStatut" "StatutInscription" NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "auteurId" TEXT REFERENCES "Utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "ChangementInscription_inscriptionId_date_idx" ON "ChangementInscription"("inscriptionId", "date");
CREATE INDEX "ChangementInscription_auteurId_idx" ON "ChangementInscription"("auteurId");
COMMIT;
