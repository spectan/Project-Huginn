export type ApprovalStatus = "PENDING" | "APPROVED" | "REJECTED";
export type AccessLevel = "NONE" | "READ" | "WRITE";

export type UserAccess = {
  approvalStatus: ApprovalStatus;
  accessLevel: AccessLevel;
  isAdmin: boolean;
};

export function canReadMap(user: UserAccess): boolean {
  return isApproved(user) && (user.accessLevel !== "NONE" || user.isAdmin);
}

export function canWriteMarkers(user: UserAccess): boolean {
  return isApproved(user) && user.accessLevel === "WRITE";
}

export function canAdminister(user: UserAccess): boolean {
  return isApproved(user) && user.isAdmin;
}

export function canViewAuditLog(user: UserAccess): boolean {
  return canAdminister(user);
}

export function canRestoreDeletedMarkers(user: UserAccess): boolean {
  return canAdminister(user);
}

function isApproved(user: UserAccess): boolean {
  return user.approvalStatus === "APPROVED";
}
