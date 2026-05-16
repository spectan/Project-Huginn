import { describe, expect, it } from "vitest";
import {
  canAdminister,
  canDeleteNoteCategories,
  canReadMap,
  canRestoreDeletedMarkers,
  canViewAuditLog,
  canWriteMarkers,
  type UserAccess
} from "./permissions";

const pendingReadUser: UserAccess = {
  approvalStatus: "PENDING",
  accessLevel: "READ",
  isAdmin: false,
  mapPermissions: [
    { accessLevel: "WRITE", isOperator: true, mapId: "defiance" }
  ]
};

const readUser: UserAccess = {
  approvalStatus: "APPROVED",
  accessLevel: "READ",
  isAdmin: false,
  mapPermissions: [
    { accessLevel: "READ", isOperator: false, mapId: "celebration" }
  ]
};

const writeUser: UserAccess = {
  approvalStatus: "APPROVED",
  accessLevel: "WRITE",
  isAdmin: false,
  mapPermissions: [
    { accessLevel: "WRITE", isOperator: false, mapId: "celebration" }
  ]
};

const adminUser: UserAccess = {
  approvalStatus: "APPROVED",
  accessLevel: "NONE",
  isAdmin: true
};

const operatorUser: UserAccess = {
  approvalStatus: "APPROVED",
  accessLevel: "NONE",
  isAdmin: false,
  mapPermissions: [
    { accessLevel: "READ", isOperator: true, mapId: "defiance" }
  ]
};

describe("permission helpers", () => {
  it("blocks pending users from reading map data", () => {
    expect(canReadMap(pendingReadUser, "defiance")).toBe(false);
  });

  it("allows read users to read but not write", () => {
    expect(canReadMap(readUser, "celebration")).toBe(true);
    expect(canWriteMarkers(readUser, "celebration")).toBe(false);
    expect(canReadMap(readUser, "defiance")).toBe(false);
  });

  it("allows write users to read and write but not administer", () => {
    expect(canReadMap(writeUser, "celebration")).toBe(true);
    expect(canWriteMarkers(writeUser, "celebration")).toBe(true);
    expect(canAdminister(writeUser)).toBe(false);
    expect(canWriteMarkers(writeUser, "defiance")).toBe(false);
  });

  it("allows admins to administer, view audit logs, and restore deleted markers", () => {
    expect(canAdminister(adminUser)).toBe(true);
    expect(canReadMap(adminUser, "defiance")).toBe(true);
    expect(canWriteMarkers(adminUser, "defiance")).toBe(true);
    expect(canAdminister(adminUser, "defiance")).toBe(true);
    expect(canViewAuditLog(adminUser)).toBe(true);
    expect(canRestoreDeletedMarkers(adminUser)).toBe(true);
  });

  it("allows operators to administer only their assigned server without global-only powers", () => {
    expect(canReadMap(operatorUser, "defiance")).toBe(true);
    expect(canWriteMarkers(operatorUser, "defiance")).toBe(true);
    expect(canAdminister(operatorUser)).toBe(false);
    expect(canAdminister(operatorUser, "defiance")).toBe(true);
    expect(canAdminister(operatorUser, "celebration")).toBe(false);
    expect(canDeleteNoteCategories(operatorUser)).toBe(false);
    expect(canRestoreDeletedMarkers(operatorUser)).toBe(false);
  });

  it("reserves note category deletion for global admins", () => {
    expect(canDeleteNoteCategories(adminUser)).toBe(true);
    expect(canDeleteNoteCategories(writeUser)).toBe(false);
    expect(canDeleteNoteCategories(operatorUser)).toBe(false);
  });
});
