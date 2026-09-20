import { serveLocalFile } from "@/lib/local-qualification/serve-local-file";
import { resolveLocalMedia } from "@/lib/local-library/library";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function serveLibraryMedia(request: Request, headOnly = false): Promise<Response> {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return new Response("Local media id is required.", { status: 400 });

  const resolved = await resolveLocalMedia(id);
  if (!resolved) return new Response("Local media is unavailable.", { status: 404 });

  return serveLocalFile(request, {
    filePath: resolved.filePath,
    contentType: resolved.mimeType,
    headOnly,
  });
}

export async function GET(request: Request) { return serveLibraryMedia(request); }
export async function HEAD(request: Request) { return serveLibraryMedia(request, true); }
