-- CreateTable
CREATE TABLE "Formation" (
    "id" TEXT NOT NULL,
    "titre" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "publiee" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Formation_pkey" PRIMARY KEY ("id")
);
