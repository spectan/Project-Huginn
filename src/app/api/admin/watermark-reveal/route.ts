import { NextResponse } from "next/server";
import { getCurrentViewer } from "@/lib/auth/current-viewer";
import { canViewAuditLog } from "@/lib/domain/permissions";
import { isolateChromaImage } from "@/lib/watermark/enhance";

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
// Multipart framing (boundaries, part headers) on top of the file itself.
const MAX_MULTIPART_OVERHEAD_BYTES = 64 * 1024;
const UPLOAD_TOO_LARGE_MESSAGE = "Image must be 20 MB or smaller";

export async function POST(request: Request) {
  const viewer = await getCurrentViewer();

  if (viewer === null || !canViewAuditLog(viewer)) {
    return NextResponse.json({ error: "Admin access is required" }, { status: 403 });
  }

  // Reject oversized uploads before buffering the multipart body.
  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_UPLOAD_BYTES + MAX_MULTIPART_OVERHEAD_BYTES) {
    return NextResponse.json({ error: UPLOAD_TOO_LARGE_MESSAGE }, { status: 413 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const imageFile = formData.get("image");
  if (!(imageFile instanceof Blob)) {
    return NextResponse.json({ error: "Image is required" }, { status: 400 });
  }

  if (imageFile.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: UPLOAD_TOO_LARGE_MESSAGE }, { status: 413 });
  }

  const imageBuffer = Buffer.from(await imageFile.arrayBuffer());

  // Enhancement is best-effort; the admin reads the overlaid digits off the
  // chroma-isolated rendering and matches them to a user. Nothing is stored —
  // the upload is processed in memory and discarded.
  let preview: string | null = null;

  try {
    const isolated = await isolateChromaImage(imageBuffer);
    preview = `data:image/png;base64,${isolated.toString("base64")}`;
  } catch {
    // Preview is best-effort.
  }

  return NextResponse.json({ preview });
}
