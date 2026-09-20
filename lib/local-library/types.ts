export type LocalLibraryMovie = {
  id: string;
  kind: "movie";
  title: string;
  year?: number;
  available: boolean;
};

export type LocalLibraryEpisode = {
  id: string;
  kind: "episode";
  seriesId: string;
  seriesTitle: string;
  title: string;
  season: number;
  episode: number;
  episodeLabel: string;
};

export type LocalLibrarySeason = {
  season: number;
  episodes: LocalLibraryEpisode[];
};

export type LocalLibrarySeries = {
  id: string;
  kind: "series";
  title: string;
  available: boolean;
  seasons: LocalLibrarySeason[];
};

export type LocalMediaLibrary = {
  movies: LocalLibraryMovie[];
  series: LocalLibrarySeries[];
  counts: { movies: number; series: number; episodes: number };
};

export type ResolvedLocalMedia = {
  id: string;
  filePath: string;
  mimeType: "video/mp4";
};
