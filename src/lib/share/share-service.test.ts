import { describe, expect, it, vi } from "vitest";
import { DEFAULT_USER_MAP_SETTINGS } from "@/lib/map-settings/map-settings";
import {
  createShareLink,
  resolveShareLink,
  SHARE_LINK_HOURS_INVALID_MESSAGE,
  SHARE_LINK_INVALID_MESSAGE,
  type ShareDependencies,
  type ShareLinkAlertInput,
  type ShareLinkAuditInput
} from "./share-service";
import { hashShareToken } from "./share-tokens";

type StoredShareLink = {
  createdByUserId: string;
  expiresAt: Date;
  layerId: string | null;
  mapId: string;
  settings: unknown;
  tokenHash: string;
};

const APPROVED_ACTOR = {
  accessLevel: "READ",
  approvalStatus: "APPROVED",
  id: "user-1",
  isAdmin: false,
  mapPermissions: [
    { accessLevel: "READ", isOperator: false, mapId: "map-1" }
  ],
  username: "alice"
} as const;

function createTestContext() {
  const alerts: ShareLinkAlertInput[] = [];
  const auditEvents: ShareLinkAuditInput[] = [];
  const links: StoredShareLink[] = [];
  const settingsRows = new Map<string, unknown>();
  const creators = new Map<string, { id: string; watermarkNumber: number | null }>();

  creators.set("user-1", { id: "user-1", watermarkNumber: 1234 });

  const dependencies: ShareDependencies = {
    createShareLink: vi.fn(async (input) => {
      links.push({
        createdByUserId: input.createdByUserId,
        expiresAt: input.expiresAt,
        layerId: input.layerId,
        mapId: input.mapId,
        settings: input.settings,
        tokenHash: input.tokenHash
      });
    }),
    createShareLinkAlert: vi.fn(async (input) => {
      alerts.push(input);
    }),
    deleteShareLink: vi.fn(async (tokenHash) => {
      const index = links.findIndex((candidate) => candidate.tokenHash === tokenHash);

      if (index !== -1) {
        links.splice(index, 1);
      }
    }),
    findMapName: vi.fn(async (mapId) => (mapId === "map-1" ? "Deliverance" : null)),
    findShareLinkWithCreator: vi.fn(async (tokenHash) => {
      const link = links.find((candidate) => candidate.tokenHash === tokenHash);

      if (link === undefined) {
        return null;
      }

      return {
        createdBy: creators.get(link.createdByUserId) ?? { id: link.createdByUserId, watermarkNumber: null },
        expiresAt: link.expiresAt,
        layerId: link.layerId,
        mapId: link.mapId,
        settings: link.settings
      };
    }),
    recordAudit: vi.fn(async (input) => {
      auditEvents.push(input);
    }),
    settings: {
      findMap: vi.fn(async (mapId) => (mapId === "map-1" ? { id: mapId } : null)),
      findSettings: vi.fn(async (userId, mapId) => {
        const saved = settingsRows.get(`${userId}:${mapId}`);
        return saved === undefined ? null : { settings: saved };
      }),
      upsertSettings: vi.fn(async ({ settings }) => ({ settings }))
    }
  };

  return { alerts, auditEvents, creators, dependencies, links, settingsRows };
}

describe("createShareLink", () => {
  it.each([
    { expiresInHours: 0, valid: false },
    { expiresInHours: 1, valid: true },
    { expiresInHours: 24, valid: true },
    { expiresInHours: 25, valid: false },
    { expiresInHours: 1.5, valid: false },
    { expiresInHours: Number.NaN, valid: false }
  ])("validates expiresInHours=$expiresInHours", async ({ expiresInHours, valid }) => {
    const { dependencies, links } = createTestContext();

    const result = await createShareLink(
      { actor: APPROVED_ACTOR, expiresInHours, mapId: "map-1" },
      dependencies
    );

    if (valid) {
      expect(result.ok).toBe(true);
      expect(links).toHaveLength(1);
    } else {
      expect(result).toEqual({ ok: false, error: SHARE_LINK_HOURS_INVALID_MESSAGE });
      expect(links).toHaveLength(0);
    }
  });

  it("rejects actors without read access to the map", async () => {
    const { dependencies, links } = createTestContext();

    const result = await createShareLink(
      {
        actor: { ...APPROVED_ACTOR, mapPermissions: [] },
        expiresInHours: 4,
        mapId: "map-1"
      },
      dependencies
    );

    expect(result).toEqual({ ok: false, error: "Read access is required" });
    expect(links).toHaveLength(0);
    expect(dependencies.createShareLink).not.toHaveBeenCalled();
  });

  it("stores a sanitized settings snapshot and keeps other settings intact", async () => {
    const { dependencies, links, settingsRows } = createTestContext();
    settingsRows.set("user-1:map-1", {
      annotations: [
        { id: "a1", title: "Secret spot", x: 100, y: 200 }
      ],
      favoriteServerId: "server-9",
      markerColors: {
        towers: "#00ff00"
      },
      roadwayEditPanelPosition: { left: 10, top: 20 },
      tileHighlightPanelPosition: { left: 30, top: 40 }
    });

    const result = await createShareLink(
      { actor: APPROVED_ACTOR, expiresInHours: 2, mapId: "map-1" },
      dependencies
    );

    expect(result.ok).toBe(true);
    expect(links).toHaveLength(1);
    expect(links[0]?.settings).toMatchObject({
      annotations: [],
      favoriteServerId: null,
      markerColors: {
        towers: "#00ff00"
      },
      roadwayEditPanelPosition: null,
      tileHighlightPanelPosition: null
    });
  });

  it("stores only the token hash and returns the raw token", async () => {
    const { dependencies, links } = createTestContext();

    const result = await createShareLink(
      { actor: APPROVED_ACTOR, expiresInHours: 1, mapId: "map-1" },
      dependencies
    );

    expect(result.ok).toBe(true);

    if (!result.ok) {
      return;
    }

    expect(result.value.token.length).toBeGreaterThan(0);
    expect(links[0]?.tokenHash).toBe(hashShareToken(result.value.token));
    expect(links[0]?.tokenHash).not.toBe(result.value.token);
    expect(JSON.stringify(links[0])).not.toContain(result.value.token);
  });

  it("sets the expiry to the requested number of hours from now", async () => {
    const { dependencies, links } = createTestContext();
    const before = Date.now();

    const result = await createShareLink(
      { actor: APPROVED_ACTOR, expiresInHours: 3, mapId: "map-1" },
      dependencies
    );

    const after = Date.now();

    expect(result.ok).toBe(true);

    if (!result.ok) {
      return;
    }

    const expiresAtMs = result.value.expiresAt.getTime();
    expect(expiresAtMs).toBeGreaterThanOrEqual(before + 3 * 60 * 60 * 1000);
    expect(expiresAtMs).toBeLessThanOrEqual(after + 3 * 60 * 60 * 1000);
    expect(links[0]?.expiresAt).toEqual(result.value.expiresAt);
  });

  it("records a SHARE_LINK_CREATED audit event without coordinates", async () => {
    const { auditEvents, dependencies } = createTestContext();

    const result = await createShareLink(
      {
        actor: APPROVED_ACTOR,
        expiresInHours: 4,
        layerId: "layer-1",
        mapId: "map-1"
      },
      dependencies
    );

    expect(result.ok).toBe(true);
    expect(auditEvents).toEqual([
      {
        action: "SHARE_LINK_CREATED",
        actorUserId: "user-1",
        mapId: "map-1",
        metadata: {
          expiresInHours: 4,
          layerId: "layer-1"
        },
        targetId: "map-1",
        targetType: "MAP"
      }
    ]);
  });

  it("creates a LOW SHARE_LINK_CREATED alert", async () => {
    const { alerts, dependencies } = createTestContext();

    const result = await createShareLink(
      {
        actor: APPROVED_ACTOR,
        expiresInHours: 4,
        mapId: "map-1"
      },
      dependencies
    );

    expect(result.ok).toBe(true);
    expect(alerts).toEqual([
      {
        actorUserId: "user-1",
        description: "alice created a read-only share link for Deliverance that expires in 4 hours",
        mapId: "map-1",
        metadata: {
          expiresInHours: 4
        },
        rule: "SHARE_LINK_CREATED",
        severity: "LOW",
        title: "Share link created by alice"
      }
    ]);
  });

  it("falls back to the map id in the alert when the map name is unavailable", async () => {
    const { alerts, dependencies } = createTestContext();
    dependencies.findMapName = vi.fn(async () => null);

    const result = await createShareLink(
      { actor: APPROVED_ACTOR, expiresInHours: 2, mapId: "map-1" },
      dependencies
    );

    expect(result.ok).toBe(true);
    expect(alerts[0]?.description).toBe(
      "alice created a read-only share link for map-1 that expires in 2 hours"
    );
  });

  it("still returns the link when the audit write fails", async () => {
    const { dependencies, links } = createTestContext();
    dependencies.recordAudit = vi.fn(async () => {
      throw new Error("audit unavailable");
    });

    const result = await createShareLink(
      { actor: APPROVED_ACTOR, expiresInHours: 1, mapId: "map-1" },
      dependencies
    );

    expect(result.ok).toBe(true);
    expect(links).toHaveLength(1);
  });

  it("still returns the link when the alert write fails", async () => {
    const { dependencies, links } = createTestContext();
    dependencies.createShareLinkAlert = vi.fn(async () => {
      throw new Error("alert unavailable");
    });

    const result = await createShareLink(
      { actor: APPROVED_ACTOR, expiresInHours: 1, mapId: "map-1" },
      dependencies
    );

    expect(result.ok).toBe(true);
    expect(links).toHaveLength(1);
  });
});

describe("resolveShareLink", () => {
  it("rejects unknown tokens", async () => {
    const { dependencies } = createTestContext();

    const result = await resolveShareLink("not-a-real-token", dependencies);

    expect(result).toEqual({ ok: false, error: SHARE_LINK_INVALID_MESSAGE });
  });

  it("rejects expired links and deletes their rows", async () => {
    const { dependencies, links } = createTestContext();
    links.push({
      createdByUserId: "user-1",
      expiresAt: new Date(Date.now() - 1000),
      layerId: null,
      mapId: "map-1",
      settings: DEFAULT_USER_MAP_SETTINGS,
      tokenHash: hashShareToken("expired-token")
    });

    const result = await resolveShareLink("expired-token", dependencies);

    expect(result).toEqual({ ok: false, error: SHARE_LINK_INVALID_MESSAGE });
    expect(dependencies.deleteShareLink).toHaveBeenCalledWith(hashShareToken("expired-token"));
    expect(links).toHaveLength(0);
  });

  it("does not delete rows for unknown tokens", async () => {
    const { dependencies } = createTestContext();

    const result = await resolveShareLink("not-a-real-token", dependencies);

    expect(result).toEqual({ ok: false, error: SHARE_LINK_INVALID_MESSAGE });
    expect(dependencies.deleteShareLink).not.toHaveBeenCalled();
  });

  it("resolves a valid link with normalized settings and creator", async () => {
    const { dependencies, links } = createTestContext();
    links.push({
      createdByUserId: "user-1",
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      layerId: "layer-1",
      mapId: "map-1",
      settings: {
        markerColors: { towers: "#00FF00" },
        unknownFutureKey: "preserved?"
      },
      tokenHash: hashShareToken("valid-token")
    });

    const result = await resolveShareLink("valid-token", dependencies);

    expect(result.ok).toBe(true);

    if (!result.ok) {
      return;
    }

    expect(result.value.link.mapId).toBe("map-1");
    expect(result.value.link.layerId).toBe("layer-1");
    expect(result.value.link.createdBy).toEqual({ id: "user-1", watermarkNumber: 1234 });
    expect(result.value.link.settings.markerColors.towers).toBe("#00ff00");
    expect(result.value.link.settings.markerVisibility).toEqual(DEFAULT_USER_MAP_SETTINGS.markerVisibility);
  });
});
