"use client";

import { useMemo, useRef } from "react";
import type { PlayableManifest } from "@/lib/playable/types";
import { assertPlayableManifest } from "@/lib/playable/validate";

type CineWatchPlayerProps = {
  manifest: PlayableManifest;
};

export function CineWatchPlayer({ manifest }: CineWatchPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const playable = useMemo(() => assertPlayableManifest(manifest), [manifest]);

  return (
    <section className="player-shell" aria-label={`${playable.title} player`}>
      <header className="player-header">
        <div>
          <p className="player-eyebrow">CineWatch Player Lab</p>
          <h1>{playable.title}</h1>
        </div>
        {playable.episodeLabel ? (
          <span className="episode-label">{playable.episodeLabel}</span>
        ) : null}
      </header>

      <div className="video-frame">
        <video
          ref={videoRef}
          className="video-element"
          controls
          playsInline
          preload="metadata"
        >
          {playable.sources.map((source) => (
            <source
              key={source.id}
              src={source.src}
              type={source.mimeType}
            />
          ))}

          {playable.subtitles.map((subtitle) => (
            <track
              key={subtitle.id}
              kind="subtitles"
              src={subtitle.src}
              srcLang={subtitle.language}
              label={subtitle.label}
              default={subtitle.default}
            />
          ))}

          Your browser does not support HTML video playback.
        </video>
      </div>

      <footer className="player-status">
        <span>{playable.playableId}</span>
        <span>{playable.kind}</span>
        <span>{playable.sources.length} source(s)</span>
        <span>{playable.subtitles.length} subtitle track(s)</span>
      </footer>
    </section>
  );
}
