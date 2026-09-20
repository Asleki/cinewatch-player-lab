import {
  LiveSubtitleError,
  discoverSubtitleLanguages,
  type EpisodicSubtitleIdentity,
} from "@/lib/wyzie/live-subtitles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseIdentity(request: Request): EpisodicSubtitleIdentity {
  const url = new URL(request.url);
  const id = url.searchParams.get("id")?.trim() ?? "";
  const season = Number(url.searchParams.get("season"));
  const episode = Number(url.searchParams.get("episode"));

  if (
    !id ||
    !Number.isInteger(season) ||
    season < 0 ||
    !Number.isInteger(episode) ||
    episode < 0
  ) {
    throw new LiveSubtitleError(
      "id, season, and episode are required.",
      400,
    );
  }

  return { id, season, episode };
}

function errorResponse(error: unknown): Response {
  if (error instanceof LiveSubtitleError) {
    return Response.json(
      { error: error.message },
      {
        status: error.status,
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  }

  return Response.json(
    { error: "Subtitle availability lookup failed." },
    {
      status: 502,
      headers: { "Cache-Control": "private, no-store" },
    },
  );
}

export async function GET(request: Request) {
  try {
    const identity = parseIdentity(request);
    const languages = await discoverSubtitleLanguages(identity);

    return Response.json(
      {
        provider: "wyzie",
        identity,
        languages,
      },
      {
        status: 200,
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
