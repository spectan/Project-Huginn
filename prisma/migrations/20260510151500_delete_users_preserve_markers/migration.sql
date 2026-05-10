ALTER TYPE "AuditAction" ADD VALUE 'USER_DELETED';
ALTER TYPE "AuditAction" ADD VALUE 'USER_PASSWORD_CHANGED';

ALTER TABLE "towers" DROP CONSTRAINT "towers_createdByUserId_fkey";
ALTER TABLE "towers" ALTER COLUMN "createdByUserId" DROP NOT NULL;
ALTER TABLE "towers" ADD CONSTRAINT "towers_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "deeds" DROP CONSTRAINT "deeds_createdByUserId_fkey";
ALTER TABLE "deeds" ALTER COLUMN "createdByUserId" DROP NOT NULL;
ALTER TABLE "deeds" ADD CONSTRAINT "deeds_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "notes" DROP CONSTRAINT "notes_createdByUserId_fkey";
ALTER TABLE "notes" ALTER COLUMN "createdByUserId" DROP NOT NULL;
ALTER TABLE "notes" ADD CONSTRAINT "notes_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
