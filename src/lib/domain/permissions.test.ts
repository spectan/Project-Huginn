import { describe, expect, it } from "vitest";
import {
  canAdminister,
  canReadMap,
  canRestoreDeletedMarkers,
  canViewAuditLog,
  canWriteMarkers,
  type UserAccess
} from "./permissions";

const pendingReadUser: UserAccess = {
  approvalStatus: "PENDING",
  accessLevel: "READ",
  isAdmin: false
};

const readUser: UserAccess = {
  approvalStatus: "APPROVED",
  accessLevel: "READ",
  isAdmin: false
};

const writeUser: UserAccess = {
  approvalStatus: "APPROVED",
  accessLevel: "WRITE",
  isAdmin: false
};

const adminUser: UserAccess = {
  approvalStatus: "APPROVED",
  accessLevel: "NONE",
  isAdmin: true
};

describe("permission helpers", () => {
  it("blocks pending users from reading map data", () => {
    expect(canReadMap(pendingReadUser)).toBe(false);
  });

  it("allows read users to read but not write", () => {
    expect(canReadMap(readUser)).toBe(true);
    expect(canWriteMarkers(readUser)).toBe(false);
  });

  it("allows write users to read and write but not administer", () => {
    expect(canReadMap(writeUser)).toBe(true);
    expect(canWriteMarkers(writeUser)).toBe(true);
    expect(canAdminister(writeUser)).toBe(false);
  });

  it("allows admins to administer, view audit logs, and restore deleted markers", () => {
    expect(canAdminister(adminUser)).toBe(true);
    expect(canViewAuditLog(adminUser)).toBe(true);
    expect(canRestoreDeletedMarkers(adminUser)).toBe(true);
  });
});
