"use client";

import { useEffect, useMemo, useState } from "react";
import { CineWatchPlayer } from "@/components/player/CineWatchPlayer";
import type { LocalLibraryEpisode, LocalLibrarySeries, LocalMediaLibrary } from "@/lib/local-library/types";
import type { PlayableManifest } from "@/lib/playable/types";

type LibrarySection = "movies" | "series";
type SelectedMedia = { kind: "movie"; id: string; title: string } | LocalLibraryEpisode;

function buildPlayable(media: SelectedMedia): PlayableManifest {
  const sourceUrl = `/api/qualification/library/media?id=${encodeURIComponent(media.id)}`;
  if (media.kind === "movie") {
    return {
      playableId: media.id,
      title: media.title,
      kind: "movie",
      sources: [{ id: `${media.id}-local`, src: sourceUrl, mimeType: "video/mp4", label: "Local file" }],
      subtitles: [],
      capabilities: { pictureInPicture: true, playbackSpeed: true, subtitles: false },
    };
  }
  return {
    playableId: media.id,
    title: media.seriesTitle,
    kind: "episode",
    episodeLabel: `${media.episodeLabel} · ${media.title}`,
    sources: [{ id: `${media.id}-local`, src: sourceUrl, mimeType: "video/mp4", label: "Local episode file" }],
    subtitles: [],
    capabilities: { pictureInPicture: true, playbackSpeed: true, subtitles: false },
  };
}

function FolderIcon() { return <svg className="cineplay-file-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 6.5h6l2 2h9v9.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2V6.5Z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" /></svg>; }
function VideoIcon() { return <svg className="cineplay-file-icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="14" rx="2" fill="none" stroke="currentColor" strokeWidth="1.7" /><path d="m10 9 6 3-6 3V9Z" fill="currentColor" /></svg>; }

export function CinePlayLibrary() {
  const [library, setLibrary] = useState<LocalMediaLibrary | null>(null);
  const [section, setSection] = useState<LibrarySection>("movies");
  const [selectedSeries, setSelectedSeries] = useState<LocalLibrarySeries | null>(null);
  const [selectedSeason, setSelectedSeason] = useState<number | null>(null);
  const [selectedMedia, setSelectedMedia] = useState<SelectedMedia | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadLibrary() {
      try {
        const response = await fetch("/api/qualification/library", { cache: "no-store" });
        if (!response.ok) throw new Error(`Library request failed (${response.status})`);
        const data = (await response.json()) as LocalMediaLibrary;
        if (!cancelled) setLibrary(data);
      } catch (caught) {
        if (!cancelled) setError(caught instanceof Error ? caught.message : "Local media library could not be loaded.");
      }
    }
    void loadLibrary();
    return () => { cancelled = true; };
  }, []);

  const currentSeason = useMemo(() => {
    if (!selectedSeries) return null;
    const targetSeason = selectedSeason ?? selectedSeries.seasons[0]?.season ?? null;
    return selectedSeries.seasons.find((season) => season.season === targetSeason) ?? null;
  }, [selectedSeason, selectedSeries]);

  const playable = useMemo(() => selectedMedia ? buildPlayable(selectedMedia) : null, [selectedMedia]);

  if (playable) {
    return <main className="cineplay-shell"><section className="cineplay-player-view"><button type="button" className="cineplay-back" onClick={() => setSelectedMedia(null)}>← Files</button><CineWatchPlayer manifest={playable} /></section></main>;
  }

  if (selectedSeries) {
    return <main className="cineplay-shell"><section className="cineplay-library">
      <header className="cineplay-topbar"><div><p className="eyebrow">CinePlay · Files</p><h1>{selectedSeries.title}</h1></div><button type="button" className="cineplay-back" onClick={() => { setSelectedSeries(null); setSelectedSeason(null); }}>← Series</button></header>
      <div className="cineplay-season-tabs" aria-label="Seasons">{selectedSeries.seasons.map((season) => <button key={season.season} type="button" className={currentSeason?.season === season.season ? "cineplay-season-tab cineplay-season-tab--active" : "cineplay-season-tab"} onClick={() => setSelectedSeason(season.season)}>Season {season.season}</button>)}</div>
      {currentSeason ? <div className="cineplay-file-list">{currentSeason.episodes.map((episode) => <button key={episode.id} type="button" className="cineplay-file-row" onClick={() => setSelectedMedia(episode)}><VideoIcon /><span className="cineplay-file-copy"><strong>{episode.episodeLabel}</strong><small>{episode.title}</small></span><span className="cineplay-open">Play</span></button>)}</div> : <p className="cineplay-empty">No episode files were discovered.</p>}
    </section></main>;
  }

  return <main className="cineplay-shell"><section className="cineplay-library">
    <header className="cineplay-topbar"><div><p className="eyebrow">CinePlay</p><h1>Files</h1></div><span className="cineplay-local-badge">Local media</span></header>
    <div className="cineplay-section-tabs">
      <button type="button" className={section === "movies" ? "cineplay-section-tab cineplay-section-tab--active" : "cineplay-section-tab"} onClick={() => setSection("movies")}>Movies <span>{library?.counts.movies ?? 0}</span></button>
      <button type="button" className={section === "series" ? "cineplay-section-tab cineplay-section-tab--active" : "cineplay-section-tab"} onClick={() => setSection("series")}>Series <span>{library?.counts.series ?? 0}</span></button>
    </div>
    {error ? <div className="cineplay-error" role="alert">{error}</div> : null}
    {!library && !error ? <p className="cineplay-empty">Scanning local media…</p> : null}
    {library && section === "movies" ? <div className="cineplay-file-list">{library.movies.map((movie) => <button key={movie.id} type="button" className="cineplay-file-row" disabled={!movie.available} onClick={() => setSelectedMedia({ kind: "movie", id: movie.id, title: movie.year ? `${movie.title} (${movie.year})` : movie.title })}><VideoIcon /><span className="cineplay-file-copy"><strong>{movie.title}</strong><small>{movie.year ? `${movie.year} · Movie` : "Movie"}</small></span><span className="cineplay-open">{movie.available ? "Play" : "Unavailable"}</span></button>)}</div> : null}
    {library && section === "series" ? <div className="cineplay-file-list">{library.series.map((series) => { const episodeCount = series.seasons.reduce((total, season) => total + season.episodes.length, 0); return <button key={series.id} type="button" className="cineplay-file-row" disabled={!series.available} onClick={() => { setSelectedSeries(series); setSelectedSeason(series.seasons[0]?.season ?? null); }}><FolderIcon /><span className="cineplay-file-copy"><strong>{series.title}</strong><small>{series.seasons.length} seasons · {episodeCount} episodes</small></span><span className="cineplay-open">{series.available ? "Open" : "Unavailable"}</span></button>; })}</div> : null}
    {library ? <footer className="cineplay-library-summary">{library.counts.movies} movie · {library.counts.series} series · {library.counts.episodes} episode files</footer> : null}
  </section></main>;
}
