import type { AccessLevel, ApprovalStatus, MapPermission, UserAccess } from "@/lib/domain/permissions";

export type AuthViewer = UserAccess & {
  id: string;
  mapPermissions: readonly MapPermission[];
  pendingApprovalCount: number;
  permissions: AccessLevel;
  username: string;
};

export type ViewerUserRecord = {
  accessLevel: AccessLevel;
  approvalStatus: ApprovalStatus;
  id: string;
  isAdmin: boolean;
  mapPermissions?: readonly MapPermission[];
  username: string;
};

export function toViewer(
  user: ViewerUserRecord,
  pendingApprovalCount = 0
): AuthViewer {
  return {
    accessLevel: user.accessLevel,
    approvalStatus: user.approvalStatus,
    id: user.id,
    isAdmin: user.isAdmin,
    mapPermissions: user.mapPermissions ?? [],
    pendingApprovalCount,
    permissions: user.accessLevel,
    username: user.username
  };
}
