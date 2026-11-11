ALTER TYPE "RoleUtilisateur" ADD VALUE IF NOT EXISTS 'STAGIAIRE';
BEGIN;
SET LOCAL lock_timeout = '5s';
ALTER TABLE "PieceJointe" ADD COLUMN "partageStagiaire" BOOLEAN NOT NULL DEFAULT false,
 ADD COLUMN "partageRevision" INTEGER NOT NULL DEFAULT 0 CHECK ("partageRevision" >= 0);
CREATE TABLE "InvitationStagiaire" (
 "id" TEXT PRIMARY KEY, "inscriptionId" TEXT NOT NULL REFERENCES "Inscription"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "email" TEXT NOT NULL, "empreinte" CHAR(64) NOT NULL UNIQUE CHECK ("empreinte" ~ '^[a-f0-9]{64}$'),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "expireAt" TIMESTAMP(3) NOT NULL, "revoqueeAt" TIMESTAMP(3), "utiliseeAt" TIMESTAMP(3),
 "auteurId" TEXT NOT NULL REFERENCES "Utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "utilisateurId" TEXT REFERENCES "Utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CHECK ("expireAt" > "createdAt"), CHECK (("utiliseeAt" IS NULL) = ("utilisateurId" IS NULL))
);
CREATE INDEX "InvitationStagiaire_inscriptionId_createdAt_idx" ON "InvitationStagiaire"("inscriptionId","createdAt");
CREATE INDEX "InvitationStagiaire_auteurId_idx" ON "InvitationStagiaire"("auteurId");
CREATE INDEX "InvitationStagiaire_utilisateurId_idx" ON "InvitationStagiaire"("utilisateurId");
CREATE UNIQUE INDEX "InvitationStagiaire_active_unique" ON "InvitationStagiaire"("inscriptionId") WHERE "revoqueeAt" IS NULL AND "utiliseeAt" IS NULL;
CREATE TABLE "RattachementStagiaire" (
 "inscriptionId" TEXT PRIMARY KEY REFERENCES "Inscription"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "utilisateurId" TEXT NOT NULL REFERENCES "Utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "invitationId" TEXT NOT NULL UNIQUE REFERENCES "InvitationStagiaire"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "RattachementStagiaire_utilisateurId_idx" ON "RattachementStagiaire"("utilisateurId");
CREATE TABLE "PartagePieceJointe" (
 "id" TEXT PRIMARY KEY, "fichierId" TEXT NOT NULL REFERENCES "PieceJointe"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "partage" BOOLEAN NOT NULL, "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "auteurId" TEXT NOT NULL REFERENCES "Utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "PartagePieceJointe_fichierId_date_idx" ON "PartagePieceJointe"("fichierId","date");
CREATE INDEX "PartagePieceJointe_auteurId_idx" ON "PartagePieceJointe"("auteurId");
COMMIT;
