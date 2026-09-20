import { getLocalMediaLibrary } from "@/lib/local-library/library";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const library = await getLocalMediaLibrary();
  return Response.json(library, { headers: { "Cache-Control": "private, no-store" } });
}
