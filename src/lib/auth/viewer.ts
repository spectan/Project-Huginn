import type { AccessLevel, ApprovalStatus, UserAccess } from "@/lib/domain/permissions";

export type AuthViewer = UserAccess & {
  id: string;
  pendingApprovalCount: number;
  permissions: AccessLevel;
  username: string;
};

export type ViewerUserRecord = {
  accessLevel: AccessLevel;
  approvalStatus: ApprovalStatus;
  id: string;
  isAdmin: boolean;
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
    pendingApprovalCount,
    permissions: user.accessLevel,
    username: user.username
  };
}
