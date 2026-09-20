import { readFile } from "node:fs/promises";
import path from "node:path";

const WYZIE_SEARCH_URL = "https://sub.wyzie.io/search";
const WYZIE_USER_AGENT = "CineWatch-Player-Lab/1.0";

export type EpisodicSubtitleIdentity = {
  id: string;
  season: number;
  episode: number;
};

export type AvailableSubtitleLanguage = {
  language: string;
  label: string;
  candidates: number;
};

export type AcquiredSubtitle = {
  vtt: string;
  language: string;
  label: string;
  source: string;
  release: string;
  candidate: number;
  candidateCount: number;
  hearingImpaired: boolean;
  ai: boolean;
};

type WyzieSubtitle = {
  id?: string;
  url?: string;
  format?: string;
  encoding?: string;
  display?: string;
  language?: string;
  media?: string;
  isHearingImpaired?: boolean;
  source?: string;
  release?: string;
  releases?: string[];
  fileName?: string;
  downloadCount?: number;
  origin?: string | null;
  ai?: boolean;
};

export class LiveSubtitleError extends Error {
  readonly status: number;

  constructor(message: string, status = 502) {
    super(message);
    this.name = "LiveSubtitleError";
    this.status = status;
  }
}

async function readWyzieApiKey(): Promise<string> {
  const environmentKey = process.env.WYZIE_API_KEY?.trim();

  if (environmentKey) {
    return environmentKey;
  }

  const secretPath = path.join(
    process.cwd(),
    "private",
    "secrets",
    "wyzie.env",
  );

  let secretText: string;

  try {
    secretText = await readFile(secretPath, "utf8");
  } catch {
    throw new LiveSubtitleError(
      "Wyzie qualification secret is not configured.",
      503,
    );
  }

  const line = secretText
    .split(/\r?\n/)
    .map((value) => value.trim())
    .find((value) => value.startsWith("WYZIE_API_KEY="));

  const key = line?.slice("WYZIE_API_KEY=".length).trim();

  if (!key) {
    throw new LiveSubtitleError(
      "Wyzie qualification secret is not configured.",
      503,
    );
  }

  return key;
}

function validateIdentity(identity: EpisodicSubtitleIdentity): void {
  if (!identity.id.trim()) {
    throw new LiveSubtitleError("Subtitle identity requires an id.", 400);
  }

  if (
    !Number.isInteger(identity.season) ||
    identity.season < 0 ||
    !Number.isInteger(identity.episode) ||
    identity.episode < 0
  ) {
    throw new LiveSubtitleError(
      "Subtitle identity requires valid season and episode numbers.",
      400,
    );
  }
}

async function searchWyzie(
  identity: EpisodicSubtitleIdentity,
  language?: string,
): Promise<WyzieSubtitle[]> {
  validateIdentity(identity);

  const key = await readWyzieApiKey();
  const params = new URLSearchParams({
    id: identity.id,
    season: String(identity.season),
    episode: String(identity.episode),
    format: "srt",
    source: "all",
    key,
  });

  if (language) {
    params.set("language", language);
  }

  let response: Response;

  try {
    response = await fetch(`${WYZIE_SEARCH_URL}?${params}`, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "User-Agent": WYZIE_USER_AGENT,
      },
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    throw new LiveSubtitleError(
      "Wyzie subtitle search is temporarily unreachable.",
      502,
    );
  }

  if (!response.ok) {
    if (response.status === 400) {
      return [];
    }

    if (response.status === 401 || response.status === 403) {
      throw new LiveSubtitleError(
        "Wyzie rejected the configured API key.",
        502,
      );
    }

    if (response.status === 429) {
      throw new LiveSubtitleError(
        "Wyzie subtitle request limit has been reached.",
        429,
      );
    }

    throw new LiveSubtitleError(
      `Wyzie subtitle search failed with HTTP ${response.status}.`,
      502,
    );
  }

  const payload: unknown = await response.json();

  if (!Array.isArray(payload)) {
    throw new LiveSubtitleError(
      "Wyzie returned an unexpected subtitle response.",
      502,
    );
  }

  return payload as WyzieSubtitle[];
}

function usableCandidate(candidate: WyzieSubtitle): boolean {
  return (
    typeof candidate.url === "string" &&
    candidate.url.length > 0 &&
    (candidate.format ?? "srt").toLowerCase() === "srt"
  );
}

function candidateScore(candidate: WyzieSubtitle): number {
  let score = 0;

  if (!candidate.ai) {
    score += 100;
  }

  if (!candidate.isHearingImpaired) {
    score += 50;
  }

  const release = `${candidate.release ?? ""} ${candidate.fileName ?? ""}`;
  const normalizedRelease = release.toLowerCase();

  if (
    normalizedRelease.includes("s02e01") ||
    normalizedRelease.includes("02x01") ||
    normalizedRelease.includes("2x01")
  ) {
    score += 20;
  }

  if (
    normalizedRelease.includes("sdh") ||
    /(?:^|[ ._-])hi(?:[ ._-]|$)/i.test(release)
  ) {
    score -= 30;
  }

  score += Math.min(candidate.downloadCount ?? 0, 10000) / 10000;

  return score;
}

function rankCandidates(candidates: WyzieSubtitle[]): WyzieSubtitle[] {
  return candidates
    .filter(usableCandidate)
    .sort((left, right) => {
      const scoreDifference = candidateScore(right) - candidateScore(left);

      if (scoreDifference !== 0) {
        return scoreDifference;
      }

      return (right.downloadCount ?? 0) - (left.downloadCount ?? 0);
    });
}

function decodeSubtitle(bytes: ArrayBuffer, encoding?: string): string {
  const normalized = (encoding ?? "utf-8").trim().toLowerCase();
  const decoderEncoding =
    normalized.includes("latin") || normalized.includes("1252")
      ? "windows-1252"
      : "utf-8";

  return new TextDecoder(decoderEncoding).decode(bytes);
}

function assertSubtitlePayload(text: string): void {
  const normalized = text
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n")
    .trim();

  const lower = normalized.toLowerCase();

  if (
    normalized.length < 16 ||
    lower.includes("cannot connect to db") ||
    lower.includes("problem with network connection to database server") ||
    lower.startsWith("<!doctype html") ||
    lower.startsWith("<html")
  ) {
    throw new LiveSubtitleError(
      "The selected Wyzie subtitle returned an invalid upstream payload.",
      502,
    );
  }

  const hasCueTiming = /(?:^|\n)\s*\d{2}:\d{2}:\d{2}[,.]\d{3}\s+-->\s+\d{2}:\d{2}:\d{2}[,.]\d{3}(?:\s|$)/m.test(
    normalized,
  );

  if (!hasCueTiming) {
    throw new LiveSubtitleError(
      "The selected Wyzie subtitle returned an invalid upstream payload.",
      502,
    );
  }
}

function srtToVtt(srt: string): string {
  const normalized = srt
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n")
    .trim();

  if (normalized.startsWith("WEBVTT")) {
    return `${normalized}\n`;
  }

  const converted = normalized
    .replace(
      /(\d{2}:\d{2}:\d{2}),(\d{3})(\s+-->\s+\d{2}:\d{2}:\d{2}),(\d{3})/g,
      "$1.$2$3.$4",
    )
    .replace(/\{\\an\d+\}/g, "");

  return `WEBVTT\n\n${converted}\n`;
}

async function fetchCandidateVtt(candidate: WyzieSubtitle): Promise<string> {
  if (!candidate.url) {
    throw new LiveSubtitleError(
      "Wyzie subtitle candidate has no download URL.",
      502,
    );
  }

  let candidateUrl: URL;

  try {
    candidateUrl = new URL(candidate.url);
  } catch {
    throw new LiveSubtitleError(
      "Wyzie returned an invalid subtitle download URL.",
      502,
    );
  }

  if (candidateUrl.protocol !== "https:" && candidateUrl.protocol !== "http:") {
    throw new LiveSubtitleError(
      "Wyzie returned an unsupported subtitle download URL.",
      502,
    );
  }

  let response: Response;

  try {
    response = await fetch(candidateUrl, {
      method: "GET",
      headers: {
        Accept: "text/plain, application/x-subrip, */*",
        "User-Agent": WYZIE_USER_AGENT,
      },
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    throw new LiveSubtitleError(
      "The selected Wyzie subtitle could not be fetched.",
      502,
    );
  }

  if (!response.ok) {
    throw new LiveSubtitleError(
      `The selected Wyzie subtitle could not be fetched (HTTP ${response.status}).`,
      502,
    );
  }

  const subtitleText = decodeSubtitle(
    await response.arrayBuffer(),
    candidate.encoding,
  );

  assertSubtitlePayload(subtitleText);

  return srtToVtt(subtitleText);
}

export async function discoverSubtitleLanguages(
  identity: EpisodicSubtitleIdentity,
): Promise<AvailableSubtitleLanguage[]> {
  const results = await searchWyzie(identity);
  const grouped = new Map<
    string,
    { label: string; candidates: number }
  >();

  for (const candidate of results) {
    if (!usableCandidate(candidate) || !candidate.language) {
      continue;
    }

    const language = candidate.language.trim();

    if (!language) {
      continue;
    }

    const current = grouped.get(language);

    grouped.set(language, {
      label: candidate.display?.trim() || language,
      candidates: (current?.candidates ?? 0) + 1,
    });
  }

  return [...grouped.entries()]
    .map(([language, value]) => ({
      language,
      label: value.label,
      candidates: value.candidates,
    }))
    .sort((left, right) => left.label.localeCompare(right.label));
}

export async function acquireLiveSubtitle(
  identity: EpisodicSubtitleIdentity,
  language: string,
  candidateNumber = 1,
): Promise<AcquiredSubtitle> {
  const normalizedLanguage = language.trim();

  if (!normalizedLanguage) {
    throw new LiveSubtitleError("Subtitle language is required.", 400);
  }

  if (!Number.isInteger(candidateNumber) || candidateNumber < 1) {
    throw new LiveSubtitleError(
      "Subtitle candidate number must be a positive integer.",
      400,
    );
  }

  const results = await searchWyzie(identity, normalizedLanguage);
  const ranked = rankCandidates(results);

  if (ranked.length === 0) {
    throw new LiveSubtitleError(
      `No ${normalizedLanguage} subtitle is currently available from Wyzie.`,
      404,
    );
  }

  if (candidateNumber > ranked.length) {
    throw new LiveSubtitleError(
      `Subtitle candidate ${candidateNumber} does not exist for ${normalizedLanguage}.`,
      404,
    );
  }

  const candidate = ranked[candidateNumber - 1];
  const vtt = await fetchCandidateVtt(candidate);

  return {
    vtt,
    language: candidate.language?.trim() || normalizedLanguage,
    label: candidate.display?.trim() || normalizedLanguage,
    source: candidate.source?.trim() || "unknown",
    release:
      candidate.release?.trim() ||
      candidate.fileName?.trim() ||
      "unknown",
    candidate: candidateNumber,
    candidateCount: ranked.length,
    hearingImpaired: Boolean(candidate.isHearingImpaired),
    ai: Boolean(candidate.ai),
  };
}
