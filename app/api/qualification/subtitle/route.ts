import { serveLocalFile } from "@/lib/local-qualification/serve-local-file";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return serveLocalFile(request, {
    filePath: process.env.PLAYER_LAB_SUBTITLE_PATH,
    contentType: "text/vtt; charset=utf-8",
  });
}

export async function HEAD(request: Request) {
  return serveLocalFile(request, {
    filePath: process.env.PLAYER_LAB_SUBTITLE_PATH,
    contentType: "text/vtt; charset=utf-8",
    headOnly: true,
  });
}
