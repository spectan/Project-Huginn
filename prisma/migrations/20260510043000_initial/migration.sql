-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "AccessLevel" AS ENUM ('NONE', 'READ', 'WRITE');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('REGISTRATION', 'LOGIN', 'LOGOUT', 'FAILED_LOGIN', 'FAILED_AUTHORIZATION', 'USER_APPROVED', 'USER_REJECTED', 'PERMISSION_CHANGED', 'MAP_VIEW', 'MAP_CREATED', 'MAP_UPDATED', 'MARKER_LIST_VIEW', 'MARKER_DETAIL_VIEW', 'MARKER_CREATED', 'MARKER_UPDATED', 'MARKER_DELETED', 'MARKER_RESTORED', 'MARKER_CLEANED_UP');

-- CreateEnum
CREATE TYPE "AuditTargetType" AS ENUM ('USER', 'MAP', 'TOWER', 'DEED', 'NOTE', 'SESSION', 'SYSTEM');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "approvalStatus" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "accessLevel" "AccessLevel" NOT NULL DEFAULT 'NONE',
    "isAdmin" BOOLEAN NOT NULL DEFAULT false,
    "approvedAt" TIMESTAMP(3),
    "approvedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "maps" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "imagePath" TEXT NOT NULL,
    "widthPx" INTEGER NOT NULL,
    "heightPx" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "maps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "towers" (
    "id" TEXT NOT NULL,
    "mapId" TEXT NOT NULL,
    "x" INTEGER NOT NULL,
    "y" INTEGER NOT NULL,
    "qlHundredths" INTEGER NOT NULL,
    "damageHundredths" INTEGER NOT NULL,
    "makerName" TEXT NOT NULL,
    "makerNumber" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "updatedByUserId" TEXT,
    "deletedAt" TIMESTAMP(3),
    "deletedByUserId" TEXT,
    "deleteExpiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "towers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deeds" (
    "id" TEXT NOT NULL,
    "mapId" TEXT NOT NULL,
    "x" INTEGER NOT NULL,
    "y" INTEGER NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "founder" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "updatedByUserId" TEXT,
    "deletedAt" TIMESTAMP(3),
    "deletedByUserId" TEXT,
    "deleteExpiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "deeds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notes" (
    "id" TEXT NOT NULL,
    "mapId" TEXT NOT NULL,
    "x" INTEGER NOT NULL,
    "y" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "updatedByUserId" TEXT,
    "deletedAt" TIMESTAMP(3),
    "deletedByUserId" TEXT,
    "deleteExpiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_events" (
    "id" TEXT NOT NULL,
    "actorUserId" TEXT,
    "action" "AuditAction" NOT NULL,
    "targetType" "AuditTargetType" NOT NULL,
    "targetId" TEXT,
    "mapId" TEXT,
    "metadata" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE INDEX "users_approvalStatus_idx" ON "users"("approvalStatus");

-- CreateIndex
CREATE INDEX "users_accessLevel_idx" ON "users"("accessLevel");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_tokenHash_key" ON "sessions"("tokenHash");

-- CreateIndex
CREATE INDEX "sessions_userId_idx" ON "sessions"("userId");

-- CreateIndex
CREATE INDEX "sessions_expiresAt_idx" ON "sessions"("expiresAt");

-- CreateIndex
CREATE INDEX "maps_isActive_idx" ON "maps"("isActive");

-- CreateIndex
CREATE INDEX "towers_mapId_deletedAt_idx" ON "towers"("mapId", "deletedAt");

-- CreateIndex
CREATE INDEX "towers_deleteExpiresAt_idx" ON "towers"("deleteExpiresAt");

-- CreateIndex
CREATE INDEX "deeds_mapId_deletedAt_idx" ON "deeds"("mapId", "deletedAt");

-- CreateIndex
CREATE INDEX "deeds_deleteExpiresAt_idx" ON "deeds"("deleteExpiresAt");

-- CreateIndex
CREATE INDEX "notes_mapId_deletedAt_idx" ON "notes"("mapId", "deletedAt");

-- CreateIndex
CREATE INDEX "notes_deleteExpiresAt_idx" ON "notes"("deleteExpiresAt");

-- CreateIndex
CREATE INDEX "audit_events_createdAt_idx" ON "audit_events"("createdAt");

-- CreateIndex
CREATE INDEX "audit_events_actorUserId_createdAt_idx" ON "audit_events"("actorUserId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_events_action_createdAt_idx" ON "audit_events"("action", "createdAt");

-- CreateIndex
CREATE INDEX "audit_events_mapId_createdAt_idx" ON "audit_events"("mapId", "createdAt");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "towers" ADD CONSTRAINT "towers_mapId_fkey" FOREIGN KEY ("mapId") REFERENCES "maps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "towers" ADD CONSTRAINT "towers_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "towers" ADD CONSTRAINT "towers_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "towers" ADD CONSTRAINT "towers_deletedByUserId_fkey" FOREIGN KEY ("deletedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deeds" ADD CONSTRAINT "deeds_mapId_fkey" FOREIGN KEY ("mapId") REFERENCES "maps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deeds" ADD CONSTRAINT "deeds_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deeds" ADD CONSTRAINT "deeds_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deeds" ADD CONSTRAINT "deeds_deletedByUserId_fkey" FOREIGN KEY ("deletedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notes" ADD CONSTRAINT "notes_mapId_fkey" FOREIGN KEY ("mapId") REFERENCES "maps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notes" ADD CONSTRAINT "notes_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notes" ADD CONSTRAINT "notes_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notes" ADD CONSTRAINT "notes_deletedByUserId_fkey" FOREIGN KEY ("deletedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_mapId_fkey" FOREIGN KEY ("mapId") REFERENCES "maps"("id") ON DELETE SET NULL ON UPDATE CASCADE;
