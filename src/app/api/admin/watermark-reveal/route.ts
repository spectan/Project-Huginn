import { NextResponse } from "next/server";
import { getCurrentViewer } from "@/lib/auth/current-viewer";
import { boostChromaImage, isolateChromaImage } from "@/lib/watermark/enhance";

export async function POST(request: Request) {
  const viewer = await getCurrentViewer();

  if (viewer === null || !viewer.isAdmin) {
    return NextResponse.json({ error: "Admin access is required" }, { status: 403 });
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

  const imageBuffer = Buffer.from(await imageFile.arrayBuffer());

  // Both enhancements are best-effort; the admin reads the overlaid digits
  // off whichever rendering makes them legible and matches them to a user.
  let saturationPreview: string | null = null;
  let chromaPreview: string | null = null;

  try {
    const boosted = await boostChromaImage(imageBuffer);
    saturationPreview = `data:image/png;base64,${boosted.toString("base64")}`;
  } catch {
    // Preview is best-effort.
  }

  try {
    const isolated = await isolateChromaImage(imageBuffer);
    chromaPreview = `data:image/png;base64,${isolated.toString("base64")}`;
  } catch {
    // Preview is best-effort.
  }

  return NextResponse.json({ saturationPreview, chromaPreview });
}
