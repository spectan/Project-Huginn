import { NextResponse } from "next/server";
import { getCurrentViewer } from "@/lib/auth/current-viewer";
import { createSettingsProfilesDependencies } from "@/lib/map-settings/database";
import {
  loadSettingsProfile,
  renameSettingsProfile,
  saveSettingsProfile
} from "@/lib/map-settings/map-settings-service";

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
    return NextResponse.json({ error: result.error }, { status: getErrorStatus(result.error) });
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
    return NextResponse.json({ error: result.error }, { status: getErrorStatus(result.error) });
  }

  return NextResponse.json({ profile: result.value }, { status: 201 });
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
    return NextResponse.json({ error: result.error }, { status: getErrorStatus(result.error) });
  }

  return NextResponse.json({ profile: result.value });
}

function parseSlot(raw: string): number {
  return /^\d+$/.test(raw) ? Number(raw) : Number.NaN;
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}

function getErrorStatus(error: string): number {
  if (error === "Read access is required") {
    return 403;
  }

  if (error === "Map was not found" || error === "Profile was not found") {
    return 404;
  }

  return 400;
}
