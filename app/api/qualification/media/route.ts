import { serveLocalFile } from "@/lib/local-qualification/serve-local-file";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return serveLocalFile(request, {
    filePath: process.env.PLAYER_LAB_MEDIA_PATH,
    contentType: "video/mp4",
  });
}

export async function HEAD(request: Request) {
  return serveLocalFile(request, {
    filePath: process.env.PLAYER_LAB_MEDIA_PATH,
    contentType: "video/mp4",
    headOnly: true,
  });
}
