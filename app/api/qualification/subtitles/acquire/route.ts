import {
  LiveSubtitleError,
  acquireLiveSubtitle,
  type EpisodicSubtitleIdentity,
} from "@/lib/wyzie/live-subtitles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safeHeaderValue(value: string): string {
  return encodeURIComponent(value).slice(0, 240);
}

function parseRequest(request: Request): {
  identity: EpisodicSubtitleIdentity;
  language: string;
  candidate: number;
} {
  const url = new URL(request.url);
  const id = url.searchParams.get("id")?.trim() ?? "";
  const season = Number(url.searchParams.get("season"));
  const episode = Number(url.searchParams.get("episode"));
  const language = url.searchParams.get("language")?.trim() ?? "";
  const candidateText = url.searchParams.get("candidate")?.trim();
  const candidate = candidateText ? Number(candidateText) : 1;

  if (
    !id ||
    !Number.isInteger(season) ||
    season < 0 ||
    !Number.isInteger(episode) ||
    episode < 0 ||
    !language ||
    !Number.isInteger(candidate) ||
    candidate < 1
  ) {
    throw new LiveSubtitleError(
      "id, season, episode, and language are required; candidate must be a positive integer when supplied.",
      400,
    );
  }

  return {
    identity: { id, season, episode },
    language,
    candidate,
  };
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
    { error: "Live subtitle acquisition failed." },
    {
      status: 502,
      headers: { "Cache-Control": "private, no-store" },
    },
  );
}

export async function GET(request: Request) {
  try {
    const { identity, language, candidate } = parseRequest(request);
    const result = await acquireLiveSubtitle(
      identity,
      language,
      candidate,
    );

    return new Response(result.vtt, {
      status: 200,
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Type": "text/vtt; charset=utf-8",
        "X-CineWatch-Subtitle-Provider": "wyzie",
        "X-CineWatch-Subtitle-Language": safeHeaderValue(result.language),
        "X-CineWatch-Subtitle-Label": safeHeaderValue(result.label),
        "X-CineWatch-Subtitle-Source": safeHeaderValue(result.source),
        "X-CineWatch-Subtitle-Release": safeHeaderValue(result.release),
        "X-CineWatch-Subtitle-Candidate": String(result.candidate),
        "X-CineWatch-Subtitle-Candidate-Count": String(
          result.candidateCount,
        ),
        "X-CineWatch-Subtitle-HI": String(result.hearingImpaired),
        "X-CineWatch-Subtitle-AI": String(result.ai),
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
