import path from "node:path";
import { readdir, stat } from "node:fs/promises";

import type {
  LocalLibraryEpisode,
  LocalLibraryMovie,
  LocalLibrarySeason,
  LocalLibrarySeries,
  LocalMediaLibrary,
  ResolvedLocalMedia,
} from "./types";

const CREATURE_ID = "creature-of-darkness-2009";
const BONANZA_ID = "bonanza";
const BONANZA_FILE = /^Bonanza\s+s(\d{2})e(\d{2})\s+(.+?)\.mp4$/i;

async function isFile(filePath: string | undefined): Promise<boolean> {
  if (!filePath) return false;
  try { return (await stat(filePath)).isFile(); } catch { return false; }
}

async function isDirectory(directoryPath: string | undefined): Promise<boolean> {
  if (!directoryPath) return false;
  try { return (await stat(directoryPath)).isDirectory(); } catch { return false; }
}

function titleCaseEpisode(rawTitle: string): string {
  const withoutResolution = rawTitle.replace(/\s+\[\d+p\]\s*$/i, "").trim();
  return withoutResolution
    .toLowerCase()
    .replace(/\b([a-z])/g, (match) => match.toUpperCase());
}

export function parseBonanzaEpisodeFilename(
  fileName: string,
): Omit<LocalLibraryEpisode, "seriesId" | "seriesTitle"> | null {
  const match = BONANZA_FILE.exec(fileName);
  if (!match) return null;

  const season = Number(match[1]);
  const episode = Number(match[2]);
  if (!Number.isInteger(season) || !Number.isInteger(episode) || season <= 0 || episode <= 0) return null;

  const title = titleCaseEpisode(match[3]);
  return {
    id: `${BONANZA_ID}-s${String(season).padStart(2, "0")}e${String(episode).padStart(2, "0")}`,
    kind: "episode",
    title,
    season,
    episode,
    episodeLabel: `S${String(season).padStart(2, "0")}E${String(episode).padStart(2, "0")}`,
  };
}

async function scanBonanzaEpisodes(): Promise<LocalLibraryEpisode[]> {
  const directory = process.env.PLAYER_LAB_BONANZA_DIR;
  if (!(await isDirectory(directory)) || !directory) return [];

  const entries = await readdir(directory, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => parseBonanzaEpisodeFilename(entry.name))
    .filter((episode): episode is Omit<LocalLibraryEpisode, "seriesId" | "seriesTitle"> => episode !== null)
    .map((episode) => ({ ...episode, seriesId: BONANZA_ID, seriesTitle: "Bonanza" }))
    .sort((left, right) => left.season - right.season || left.episode - right.episode);
}

function groupSeasons(episodes: LocalLibraryEpisode[]): LocalLibrarySeason[] {
  const grouped = new Map<number, LocalLibraryEpisode[]>();
  for (const episode of episodes) {
    const list = grouped.get(episode.season) ?? [];
    list.push(episode);
    grouped.set(episode.season, list);
  }
  return [...grouped.entries()]
    .sort(([left], [right]) => left - right)
    .map(([season, seasonEpisodes]) => ({
      season,
      episodes: seasonEpisodes.sort((left, right) => left.episode - right.episode),
    }));
}

export async function getLocalMediaLibrary(): Promise<LocalMediaLibrary> {
  const creatureAvailable = await isFile(process.env.PLAYER_LAB_MEDIA_PATH);
  const movie: LocalLibraryMovie = {
    id: CREATURE_ID,
    kind: "movie",
    title: "Creature of Darkness",
    year: 2009,
    available: creatureAvailable,
  };

  const bonanzaEpisodes = await scanBonanzaEpisodes();
  const bonanza: LocalLibrarySeries = {
    id: BONANZA_ID,
    kind: "series",
    title: "Bonanza",
    available: bonanzaEpisodes.length > 0,
    seasons: groupSeasons(bonanzaEpisodes),
  };

  return {
    movies: [movie],
    series: [bonanza],
    counts: {
      movies: creatureAvailable ? 1 : 0,
      series: bonanza.available ? 1 : 0,
      episodes: bonanzaEpisodes.length,
    },
  };
}

export async function resolveLocalMedia(id: string): Promise<ResolvedLocalMedia | null> {
  if (id === CREATURE_ID) {
    const filePath = process.env.PLAYER_LAB_MEDIA_PATH;
    if (!(await isFile(filePath)) || !filePath) return null;
    return { id, filePath, mimeType: "video/mp4" };
  }

  const episodeId = /^bonanza-s(\d{2})e(\d{2})$/.exec(id);
  const directory = process.env.PLAYER_LAB_BONANZA_DIR;
  if (!episodeId || !(await isDirectory(directory)) || !directory) return null;

  const targetSeason = Number(episodeId[1]);
  const targetEpisode = Number(episodeId[2]);
  const entries = await readdir(directory, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const parsed = parseBonanzaEpisodeFilename(entry.name);
    if (parsed?.season === targetSeason && parsed.episode === targetEpisode) {
      const filePath = path.join(directory, entry.name);
      if (!(await isFile(filePath))) return null;
      return { id, filePath, mimeType: "video/mp4" };
    }
  }

  return null;
}
