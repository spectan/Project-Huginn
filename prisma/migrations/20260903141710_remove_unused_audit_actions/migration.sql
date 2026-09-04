-- AlterEnum
-- NOTE: databases with existing audit history may still have MARKER_LIST_VIEW rows.
-- MAP_DATA_ACCESSED is included in this enum and legacy rows are remapped to it,
-- otherwise the cast below fails on "invalid input value for enum".
BEGIN;
CREATE TYPE "AuditAction_new" AS ENUM ('REGISTRATION', 'LOGIN', 'LOGOUT', 'FAILED_LOGIN', 'FAILED_AUTHORIZATION', 'USER_APPROVED', 'USER_DELETED', 'USER_PASSWORD_CHANGED', 'PERMISSION_CHANGED', 'MAP_UPDATED', 'MARKER_CREATED', 'MARKER_UPDATED', 'MARKER_DELETED', 'MARKER_RESTORED', 'MARKER_CLEANED_UP', 'MARKERS_EXPORTED', 'MAP_DATA_ACCESSED');
ALTER TABLE "audit_events" ALTER COLUMN "action" TYPE "AuditAction_new" USING (CASE WHEN "action"::text = 'MARKER_LIST_VIEW' THEN 'MAP_DATA_ACCESSED' ELSE "action"::text END::"AuditAction_new");
ALTER TYPE "AuditAction" RENAME TO "AuditAction_old";
ALTER TYPE "AuditAction_new" RENAME TO "AuditAction";
DROP TYPE "public"."AuditAction_old";
COMMIT;
