import { NextResponse } from "next/server";
import { getCurrentViewer } from "@/lib/auth/current-viewer";
import { createSettingsProfilesDependencies } from "@/lib/map-settings/database";
import {
  loadSettingsProfile,
  renameSettingsProfile,
  saveSettingsProfile
} from "@/lib/map-settings/map-settings-service";
import { readJson } from "@/lib/http/read-json";
import { MAP_ERROR_STATUSES, getErrorStatus } from "@/lib/http/error-status";

const PROFILE_ERROR_STATUSES = new Map<string, number>([...MAP_ERROR_STATUSES, ["Profile was not found", 404]]);

type RouteContext = {
  params: Promise<{
    mapId: string;
    slot: string;
  }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const viewer = await getCurrentViewer();

  if (viewer === null) {
    return NextResponse.json({ error: "Authentication is required" }, { status: 401 });
  }

  const { mapId, slot } = await context.params;
  const result = await loadSettingsProfile(
    { actor: viewer, mapId, slot: parseSlot(slot) },
    createSettingsProfilesDependencies()
  );

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: getErrorStatus(result.error, PROFILE_ERROR_STATUSES) });
  }

  return NextResponse.json({ profile: result.value });
}

export async function PUT(request: Request, context: RouteContext) {
  const viewer = await getCurrentViewer();

  if (viewer === null) {
    return NextResponse.json({ error: "Authentication is required" }, { status: 401 });
  }

  const body = await readJson(request);
  const { mapId, slot } = await context.params;
  const result = await saveSettingsProfile(
    {
      actor: viewer,
      mapId,
      name: isRecord(body) ? body.name : undefined,
      slot: parseSlot(slot)
    },
    createSettingsProfilesDependencies()
  );

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: getErrorStatus(result.error, PROFILE_ERROR_STATUSES) });
  }

  // `created` only picks 201 (new slot) vs 200 (overwrite); it is not part of the body.
  const { created, ...profile } = result.value;

  return NextResponse.json({ profile }, { status: created ? 201 : 200 });
}

export async function PATCH(request: Request, context: RouteContext) {
  const viewer = await getCurrentViewer();

  if (viewer === null) {
    return NextResponse.json({ error: "Authentication is required" }, { status: 401 });
  }

  const body = await readJson(request);
  const { mapId, slot } = await context.params;
  const result = await renameSettingsProfile(
    {
      actor: viewer,
      mapId,
      name: isRecord(body) ? body.name : undefined,
      slot: parseSlot(slot)
    },
    createSettingsProfilesDependencies()
  );

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: getErrorStatus(result.error, PROFILE_ERROR_STATUSES) });
  }

  return NextResponse.json({ profile: result.value });
}

function parseSlot(raw: string): number {
  return /^\d+$/.test(raw) ? Number(raw) : Number.NaN;
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}
