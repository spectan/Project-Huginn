import { describe, expect, it } from "vitest";
import { getInitialMapServerId, getReadableServerSummaries } from "./page";

describe("map page server selection", () => {
  const servers = [
    { id: "map-celebration", imageSrc: "/maps/celebration.png", name: "Celebration" },
    { id: "map-defiance", imageSrc: "/maps/defiance.png", name: "Defiance" }
  ];
  const reader = {
    accessLevel: "NONE",
    approvalStatus: "APPROVED",
    id: "reader-id",
    isAdmin: false,
    mapPermissions: [
      { accessLevel: "READ", isOperator: false, mapId: "map-defiance" }
    ],
    pendingApprovalCount: 0,
    permissions: "NONE",
    username: "Reader"
  } as const;

  it("filters unreadable servers from the server selector source", () => {
    expect(getReadableServerSummaries(reader, servers)).toEqual([
      { id: "map-defiance", imageSrc: "/maps/defiance.png", name: "Defiance" }
    ]);
  });

  it("uses only readable explicit or favorite server requests before falling back", () => {
    const readableServers = getReadableServerSummaries(reader, servers);

    expect(getInitialMapServerId("map-defiance", "map-celebration", readableServers)).toBe("map-defiance");
    expect(getInitialMapServerId("map-celebration", "map-defiance", readableServers)).toBe("map-defiance");
    expect(getInitialMapServerId(undefined, "map-celebration", readableServers)).toBe("map-defiance");
    expect(getInitialMapServerId(undefined, null, [])).toBeUndefined();
  });
});
