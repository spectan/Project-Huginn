export type ApprovalStatus = "PENDING" | "APPROVED" | "REJECTED";
export type AccessLevel = "NONE" | "READ" | "WRITE";

export type MapPermission = {
  accessLevel: AccessLevel;
  isOperator: boolean;
  mapId: string;
};

export type UserAccess = {
  approvalStatus: ApprovalStatus;
  accessLevel: AccessLevel;
  isAdmin: boolean;
  mapPermissions?: readonly MapPermission[];
};

export function canReadMap(user: UserAccess, mapId?: string): boolean {
  if (!isApproved(user)) {
    return false;
  }

  if (user.isAdmin) {
    return true;
  }

  if (mapId === undefined) {
    return user.accessLevel !== "NONE";
  }

  const permission = getMapPermission(user, mapId);

  return permission !== null && (permission.accessLevel !== "NONE" || permission.isOperator);
}

export function canWriteMarkers(user: UserAccess, mapId?: string): boolean {
  if (!isApproved(user)) {
    return false;
  }

  if (user.isAdmin) {
    return true;
  }

  if (mapId === undefined) {
    return user.accessLevel === "WRITE";
  }

  const permission = getMapPermission(user, mapId);

  return permission !== null && (permission.accessLevel === "WRITE" || permission.isOperator);
}

export function canAdminister(user: UserAccess, mapId?: string): boolean {
  if (!isApproved(user)) {
    return false;
  }

  if (user.isAdmin) {
    return true;
  }

  if (mapId === undefined) {
    return false;
  }

  return getMapPermission(user, mapId)?.isOperator === true;
}

export function canViewAuditLog(user: UserAccess): boolean {
  return isApproved(user) && user.isAdmin;
}

export function canRestoreDeletedMarkers(user: UserAccess): boolean {
  return isApproved(user) && user.isAdmin;
}

export function canDeleteNoteCategories(user: UserAccess): boolean {
  return isApproved(user) && user.isAdmin;
}

export function canManageAccounts(user: UserAccess): boolean {
  return isApproved(user) && (user.isAdmin || user.mapPermissions?.some((permission) => permission.isOperator) === true);
}

function isApproved(user: UserAccess): boolean {
  return user.approvalStatus === "APPROVED";
}

function getMapPermission(user: UserAccess, mapId: string): MapPermission | null {
  return user.mapPermissions?.find((permission) => permission.mapId === mapId) ?? null;
}
