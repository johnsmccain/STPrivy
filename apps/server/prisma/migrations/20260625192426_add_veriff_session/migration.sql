-- CreateEnum
CREATE TYPE "ProofRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED');

-- CreateTable
CREATE TABLE "proof_requests" (
    "id" TEXT NOT NULL,
    "verifierDID" TEXT NOT NULL,
    "subjectDID" TEXT,
    "circuitId" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "callbackUrl" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "status" "ProofRequestStatus" NOT NULL DEFAULT 'PENDING',
    "proofId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "proof_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "veriff_sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "sessionUrl" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'created',
    "credentialId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "veriff_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "veriff_sessions_sessionId_key" ON "veriff_sessions"("sessionId");
