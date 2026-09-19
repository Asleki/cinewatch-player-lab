"use client";

import {
  useCallback,
  useMemo,
  useRef,
  useState,
} from "react";
import type { PlayableManifest } from "@/lib/playable/types";
import { assertPlayableManifest } from "@/lib/playable/validate";

type CineWatchPlayerProps = {
  manifest: PlayableManifest;
};

type PiPDocument = Document & {
  pictureInPictureEnabled?: boolean;
  pictureInPictureElement?: Element | null;
  exitPictureInPicture?: () => Promise<void>;
};

type PiPVideo = HTMLVideoElement & {
  requestPictureInPicture?: () => Promise<unknown>;
};

function formatTime(value: number): string {
  if (!Number.isFinite(value) || value < 0) {
    return "0:00";
  }

  const totalSeconds = Math.floor(value);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function CineWatchPlayer({ manifest }: CineWatchPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);

  const playable = useMemo(
    () => assertPlayableManifest(manifest),
    [manifest],
  );

  const defaultSubtitle =
    playable.subtitles.find((track) => track.default)?.id ??
    playable.subtitles[0]?.id ??
    "off";

  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [selectedSubtitle, setSelectedSubtitle] =
    useState(defaultSubtitle);
  const [activeCaption, setActiveCaption] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const captureDuration = useCallback(
    (video: HTMLVideoElement) => {
      const nextDuration = video.duration;

      /*
       * Some browsers emit transient durationchange events carrying
       * NaN or Infinity while a ranged media resource is initializing.
       *
       * Never allow those transient values to destroy an already-known
       * finite movie duration.
       */
      if (
        Number.isFinite(nextDuration) &&
        nextDuration > 0
      ) {
        setDuration(nextDuration);
      }
    },
    [],
  );

  const configureSubtitleTracks = useCallback(
    (subtitleId: string) => {
      const video = videoRef.current;

      if (!video) {
        return;
      }

      for (
        let index = 0;
        index < video.textTracks.length;
        index += 1
      ) {
        const manifestTrack = playable.subtitles[index];
        const textTrack = video.textTracks[index];

        /*
         * "hidden" keeps cue timing active without allowing the browser
         * to paint captions underneath our custom control surface.
         */
        textTrack.mode =
          manifestTrack?.id === subtitleId
            ? "hidden"
            : "disabled";
      }

      if (subtitleId === "off") {
        setActiveCaption("");
      }
    },
    [playable.subtitles],
  );

  const updateActiveCaption = useCallback(
    (subtitleId: string) => {
      const video = videoRef.current;

      if (!video || subtitleId === "off") {
        setActiveCaption("");
        return;
      }

      const subtitleIndex = playable.subtitles.findIndex(
        (track) => track.id === subtitleId,
      );

      if (
        subtitleIndex < 0 ||
        subtitleIndex >= video.textTracks.length
      ) {
        setActiveCaption("");
        return;
      }

      const textTrack = video.textTracks[subtitleIndex];

      if (textTrack.mode !== "hidden") {
        textTrack.mode = "hidden";
      }

      const cues = textTrack.activeCues;

      if (!cues || cues.length === 0) {
        setActiveCaption("");
        return;
      }

      const lines: string[] = [];

      for (let index = 0; index < cues.length; index += 1) {
        const cue = cues[index];

        if (cue && "text" in cue) {
          const text = String((cue as VTTCue).text).trim();

          if (text) {
            lines.push(text);
          }
        }
      }

      setActiveCaption(lines.join("\n"));
    },
    [playable.subtitles],
  );

  const togglePlayback = useCallback(async () => {
    const video = videoRef.current;

    if (!video) {
      return;
    }

    setErrorMessage(null);

    try {
      if (video.paused || video.ended) {
        await video.play();
      } else {
        video.pause();
      }
    } catch {
      setErrorMessage("Playback could not be started.");
    }
  }, []);

  const seekBy = useCallback(
    (seconds: number) => {
      const video = videoRef.current;

      if (!video) {
        return;
      }

      const mediaDuration =
        Number.isFinite(video.duration) && video.duration > 0
          ? video.duration
          : duration;

      if (mediaDuration <= 0) {
        return;
      }

      video.currentTime = Math.min(
        Math.max(video.currentTime + seconds, 0),
        mediaDuration,
      );
    },
    [duration],
  );

  const handleSeek = (value: number) => {
    const video = videoRef.current;

    if (!video || duration <= 0) {
      return;
    }

    const nextTime = Math.min(
      Math.max(value, 0),
      duration,
    );

    video.currentTime = nextTime;
    setCurrentTime(nextTime);
  };

  const handleVolume = (value: number) => {
    const video = videoRef.current;

    if (!video) {
      return;
    }

    video.volume = value;
    video.muted = value === 0;

    setVolume(value);
    setIsMuted(value === 0);
  };

  const toggleMute = () => {
    const video = videoRef.current;

    if (!video) {
      return;
    }

    video.muted = !video.muted;
    setIsMuted(video.muted);
  };

  const changePlaybackRate = (value: number) => {
    const video = videoRef.current;

    if (!video) {
      return;
    }

    video.playbackRate = value;
    setPlaybackRate(value);
  };

  const toggleFullscreen = useCallback(async () => {
    const frame = frameRef.current;

    if (!frame) {
      return;
    }

    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await frame.requestFullscreen();
      }
    } catch {
      setErrorMessage("Fullscreen is unavailable.");
    }
  }, []);

  const togglePictureInPicture = useCallback(async () => {
    const video = videoRef.current as PiPVideo | null;
    const pipDocument = document as PiPDocument;

    if (
      !video ||
      !playable.capabilities.pictureInPicture ||
      !pipDocument.pictureInPictureEnabled
    ) {
      setErrorMessage("Picture-in-Picture is unavailable.");
      return;
    }

    try {
      if (
        pipDocument.pictureInPictureElement &&
        pipDocument.exitPictureInPicture
      ) {
        await pipDocument.exitPictureInPicture();
      } else if (video.requestPictureInPicture) {
        await video.requestPictureInPicture();
      }
    } catch {
      setErrorMessage(
        "Picture-in-Picture could not be started.",
      );
    }
  }, [playable.capabilities.pictureInPicture]);

  const handleKeyDown = (
    event: React.KeyboardEvent<HTMLElement>,
  ) => {
    const target = event.target as HTMLElement;

    if (
      target.tagName === "INPUT" ||
      target.tagName === "SELECT" ||
      target.tagName === "BUTTON"
    ) {
      return;
    }

    switch (event.code) {
      case "Space":
        event.preventDefault();
        void togglePlayback();
        break;

      case "ArrowLeft":
        event.preventDefault();
        seekBy(-10);
        break;

      case "ArrowRight":
        event.preventDefault();
        seekBy(10);
        break;

      case "KeyM":
        event.preventDefault();
        toggleMute();
        break;

      case "KeyF":
        event.preventDefault();
        void toggleFullscreen();
        break;

      case "KeyP":
        event.preventDefault();
        void togglePictureInPicture();
        break;

      default:
        break;
    }
  };

  const seekMaximum = duration > 0 ? duration : 1;
  const seekValue =
    duration > 0
      ? Math.min(currentTime, duration)
      : 0;

  return (
    <section
      className="player-shell"
      aria-label={`${playable.title} player`}
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      <header className="player-header">
        <div>
          <p className="player-eyebrow">
            CineWatch Player Lab
          </p>

          <h1>{playable.title}</h1>
        </div>

        {playable.episodeLabel ? (
          <span className="episode-label">
            {playable.episodeLabel}
          </span>
        ) : null}
      </header>

      <div
        ref={frameRef}
        className="video-frame cinewatch-video-frame"
      >
        <video
          ref={videoRef}
          className="video-element"
          playsInline
          preload="metadata"
          onClick={() => void togglePlayback()}
          onLoadedMetadata={(event) => {
            const video = event.currentTarget;

            captureDuration(video);
            setVolume(video.volume);
            setIsMuted(video.muted);

            configureSubtitleTracks(selectedSubtitle);
            updateActiveCaption(selectedSubtitle);
          }}
          onLoadedData={(event) => {
            captureDuration(event.currentTarget);
          }}
          onDurationChange={(event) => {
            captureDuration(event.currentTarget);
          }}
          onCanPlay={(event) => {
            captureDuration(event.currentTarget);
            setIsBuffering(false);
          }}
          onTimeUpdate={(event) => {
            const video = event.currentTarget;

            setCurrentTime(video.currentTime);
            captureDuration(video);
            updateActiveCaption(selectedSubtitle);
          }}
          onSeeked={() => {
            updateActiveCaption(selectedSubtitle);
          }}
          onPlay={() => {
            setIsPlaying(true);
            setHasStarted(true);
            setIsBuffering(false);
          }}
          onPause={() => {
            setIsPlaying(false);
          }}
          onWaiting={() => {
            setIsBuffering(true);
          }}
          onPlaying={(event) => {
            captureDuration(event.currentTarget);
            setIsBuffering(false);
          }}
          onEnded={() => {
            setIsPlaying(false);
          }}
          onError={() => {
            setErrorMessage(
              "The playback source could not be loaded.",
            );
            setIsPlaying(false);
            setIsBuffering(false);
          }}
          onVolumeChange={(event) => {
            setVolume(event.currentTarget.volume);
            setIsMuted(event.currentTarget.muted);
          }}
          onRateChange={(event) => {
            setPlaybackRate(
              event.currentTarget.playbackRate,
            );
          }}
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
              onLoad={() => {
                configureSubtitleTracks(
                  selectedSubtitle,
                );
                updateActiveCaption(
                  selectedSubtitle,
                );
              }}
            />
          ))}

          Your browser does not support HTML video playback.
        </video>

        {activeCaption ? (
          <div
            className="player-caption-layer"
            aria-hidden="true"
          >
            <span className="player-caption-text">
              {activeCaption}
            </span>
          </div>
        ) : null}

        {!hasStarted && !errorMessage ? (
          <button
            className="player-center-action"
            type="button"
            aria-label="Play"
            onClick={() => void togglePlayback()}
          >
            ▶
          </button>
        ) : null}

        {isBuffering ? (
          <div
            className="player-buffering"
            role="status"
          >
            Loading…
          </div>
        ) : null}

        {errorMessage ? (
          <div
            className="player-error"
            role="alert"
          >
            {errorMessage}
          </div>
        ) : null}

        <div className="player-controls">
          <input
            className="player-seek"
            type="range"
            min={0}
            max={seekMaximum}
            step={0.1}
            value={seekValue}
            disabled={duration <= 0}
            aria-label="Seek"
            onChange={(event) => {
              handleSeek(
                Number(event.currentTarget.value),
              );
            }}
          />

          <div className="player-time-row">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>

          <div className="player-control-row">
            <div className="player-control-group">
              <button
                type="button"
                className="player-control-button"
                aria-label={
                  isPlaying ? "Pause" : "Play"
                }
                onClick={() => void togglePlayback()}
              >
                {isPlaying ? "❚❚" : "▶"}
              </button>

              <button
                type="button"
                className="player-control-button player-skip-button"
                aria-label="Back 10 seconds"
                onClick={() => seekBy(-10)}
              >
                −10
              </button>

              <button
                type="button"
                className="player-control-button player-skip-button"
                aria-label="Forward 10 seconds"
                onClick={() => seekBy(10)}
              >
                +10
              </button>

              <button
                type="button"
                className="player-control-button"
                aria-label={
                  isMuted ? "Unmute" : "Mute"
                }
                onClick={toggleMute}
              >
                {isMuted ? "🔇" : "🔊"}
              </button>

              <input
                className="player-volume"
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={isMuted ? 0 : volume}
                aria-label="Volume"
                onChange={(event) => {
                  handleVolume(
                    Number(
                      event.currentTarget.value,
                    ),
                  );
                }}
              />
            </div>

            <div className="player-control-group player-control-group-right">
              {playable.capabilities.subtitles &&
              playable.subtitles.length > 0 ? (
                <select
                  className="player-select"
                  aria-label="Subtitles"
                  value={selectedSubtitle}
                  onChange={(event) => {
                    const nextSubtitle =
                      event.currentTarget.value;

                    setSelectedSubtitle(
                      nextSubtitle,
                    );

                    configureSubtitleTracks(
                      nextSubtitle,
                    );

                    window.setTimeout(() => {
                      updateActiveCaption(
                        nextSubtitle,
                      );
                    }, 0);
                  }}
                >
                  <option value="off">
                    CC Off
                  </option>

                  {playable.subtitles.map(
                    (subtitle) => (
                      <option
                        key={subtitle.id}
                        value={subtitle.id}
                      >
                        {subtitle.label}
                      </option>
                    ),
                  )}
                </select>
              ) : null}

              {playable.capabilities.playbackSpeed ? (
                <select
                  className="player-select player-speed"
                  aria-label="Playback speed"
                  value={playbackRate}
                  onChange={(event) => {
                    changePlaybackRate(
                      Number(
                        event.currentTarget.value,
                      ),
                    );
                  }}
                >
                  <option value={0.5}>0.5×</option>
                  <option value={0.75}>0.75×</option>
                  <option value={1}>1×</option>
                  <option value={1.25}>1.25×</option>
                  <option value={1.5}>1.5×</option>
                  <option value={2}>2×</option>
                </select>
              ) : null}

              {playable.capabilities.pictureInPicture ? (
                <button
                  type="button"
                  className="player-control-button"
                  aria-label="Picture-in-Picture"
                  onClick={() =>
                    void togglePictureInPicture()
                  }
                >
                  PiP
                </button>
              ) : null}

              <button
                type="button"
                className="player-control-button"
                aria-label="Fullscreen"
                onClick={() =>
                  void toggleFullscreen()
                }
              >
                ⛶
              </button>
            </div>
          </div>
        </div>
      </div>

      <footer className="player-status">
        <span>{playable.playableId}</span>
        <span>{playable.kind}</span>
        <span>
          {playable.sources.length} source(s)
        </span>
        <span>
          {playable.subtitles.length} subtitle track(s)
        </span>
      </footer>
    </section>
  );
}
