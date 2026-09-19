"use client";

import {
  useCallback,
  useEffect,
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

type GestureMode =
  | "pending"
  | "brightness"
  | "volume"
  | "ignored";

type GestureSession = {
  pointerId: number;
  startX: number;
  startY: number;
  startAt: number;
  startBrightness: number;
  startVolume: number;
  mode: GestureMode;
};

type GestureHud = {
  label: string;
  side: "left" | "center" | "right";
  meter?: number;
};

const TAP_WINDOW_MS = 285;
const TAP_MOVEMENT_LIMIT_PX = 14;
const SWIPE_THRESHOLD_PX = 12;
const CONTROLS_HIDE_MS = 3200;

const BRIGHTNESS_MIN = 0.35;
const BRIGHTNESS_MAX = 1.65;

function clamp(
  value: number,
  minimum: number,
  maximum: number,
): number {
  return Math.min(Math.max(value, minimum), maximum);
}

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

export function CineWatchPlayer({
  manifest,
}: CineWatchPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);

  const controlsTimerRef = useRef<number | null>(null);
  const hudTimerRef = useRef<number | null>(null);
  const screenshotTimerRef = useRef<number | null>(null);
  const tapTimerRef = useRef<number | null>(null);

  const gestureRef = useRef<GestureSession | null>(null);

  const tapStateRef = useRef({
    count: 0,
    xRatio: 0,
    yRatio: 0,
  });

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
  const [controlsVisible, setControlsVisible] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [brightness, setBrightness] = useState(1);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [selectedSubtitle, setSelectedSubtitle] =
    useState(defaultSubtitle);
  const [activeCaption, setActiveCaption] = useState("");
  const [gestureHud, setGestureHud] =
    useState<GestureHud | null>(null);
  const [screenshotFlash, setScreenshotFlash] =
    useState(false);
  const [errorMessage, setErrorMessage] =
    useState<string | null>(null);

  const clearControlsTimer = useCallback(() => {
    if (controlsTimerRef.current !== null) {
      window.clearTimeout(controlsTimerRef.current);
      controlsTimerRef.current = null;
    }
  }, []);

  const armControlsAutoHide = useCallback(() => {
    clearControlsTimer();

    const video = videoRef.current;

    if (!video || video.paused || video.ended) {
      return;
    }

    controlsTimerRef.current = window.setTimeout(() => {
      setControlsVisible(false);
      controlsTimerRef.current = null;
    }, CONTROLS_HIDE_MS);
  }, [clearControlsTimer]);

  const revealControls = useCallback(() => {
    setControlsVisible(true);

    window.setTimeout(() => {
      armControlsAutoHide();
    }, 0);
  }, [armControlsAutoHide]);

  const showGestureHud = useCallback(
    (hud: GestureHud, timeoutMs = 850) => {
      if (hudTimerRef.current !== null) {
        window.clearTimeout(hudTimerRef.current);
      }

      setGestureHud(hud);

      hudTimerRef.current = window.setTimeout(() => {
        setGestureHud(null);
        hudTimerRef.current = null;
      }, timeoutMs);
    },
    [],
  );

  useEffect(() => {
    return () => {
      clearControlsTimer();

      if (hudTimerRef.current !== null) {
        window.clearTimeout(hudTimerRef.current);
      }

      if (screenshotTimerRef.current !== null) {
        window.clearTimeout(screenshotTimerRef.current);
      }

      if (tapTimerRef.current !== null) {
        window.clearTimeout(tapTimerRef.current);
      }
    };
  }, [clearControlsTimer]);

  const captureDuration = useCallback(
    (video: HTMLVideoElement) => {
      const nextDuration = video.duration;

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

  const applySubtitleSelection = useCallback(
    (subtitleId: string) => {
      setSelectedSubtitle(subtitleId);
      configureSubtitleTracks(subtitleId);

      window.setTimeout(() => {
        updateActiveCaption(subtitleId);
      }, 0);
    },
    [configureSubtitleTracks, updateActiveCaption],
  );

  const toggleSubtitleShortcut = useCallback(() => {
    const nextSubtitle =
      selectedSubtitle === "off"
        ? defaultSubtitle
        : "off";

    applySubtitleSelection(nextSubtitle);

    showGestureHud(
      {
        label:
          nextSubtitle === "off"
            ? "CC Off"
            : "CC On",
        side: "right",
      },
      900,
    );
  }, [
    applySubtitleSelection,
    defaultSubtitle,
    selectedSubtitle,
    showGestureHud,
  ]);

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
        Number.isFinite(video.duration) &&
        video.duration > 0
          ? video.duration
          : duration;

      if (mediaDuration <= 0) {
        return;
      }

      video.currentTime = clamp(
        video.currentTime + seconds,
        0,
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

    const nextTime = clamp(value, 0, duration);

    video.currentTime = nextTime;
    setCurrentTime(nextTime);
    revealControls();
  };

  const handleVolume = (value: number) => {
    const video = videoRef.current;

    if (!video) {
      return;
    }

    const nextVolume = clamp(value, 0, 1);

    try {
      video.volume = nextVolume;
      video.muted = nextVolume === 0;
      setVolume(video.volume);
      setIsMuted(video.muted);
    } catch {
      showGestureHud({
        label: "Volume unavailable",
        side: "right",
      });
    }

    revealControls();
  };

  const toggleMute = () => {
    const video = videoRef.current;

    if (!video) {
      return;
    }

    video.muted = !video.muted;
    setIsMuted(video.muted);
    revealControls();
  };

  const changePlaybackRate = (value: number) => {
    const video = videoRef.current;

    if (!video) {
      return;
    }

    video.playbackRate = value;
    setPlaybackRate(value);
    revealControls();
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

  const captureScreenshot = useCallback(() => {
    const video = videoRef.current;

    if (
      !video ||
      video.readyState <
        HTMLMediaElement.HAVE_CURRENT_DATA ||
      video.videoWidth <= 0 ||
      video.videoHeight <= 0
    ) {
      showGestureHud({
        label: "Screenshot unavailable",
        side: "left",
      });
      return;
    }

    try {
      const canvas = document.createElement("canvas");

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      const context = canvas.getContext("2d");

      if (!context) {
        throw new Error("Canvas unavailable");
      }

      context.filter = `brightness(${brightness})`;

      context.drawImage(
        video,
        0,
        0,
        canvas.width,
        canvas.height,
      );

      const dataUrl = canvas.toDataURL("image/png");
      const link = document.createElement("a");
      const timestamp = Math.floor(video.currentTime);

      link.href = dataUrl;
      link.download =
        `${playable.playableId}-${timestamp}s.png`;

      document.body.appendChild(link);
      link.click();
      link.remove();

      setScreenshotFlash(true);

      if (screenshotTimerRef.current !== null) {
        window.clearTimeout(screenshotTimerRef.current);
      }

      screenshotTimerRef.current =
        window.setTimeout(() => {
          setScreenshotFlash(false);
          screenshotTimerRef.current = null;
        }, 170);

      showGestureHud(
        {
          label: "Screenshot captured",
          side: "left",
        },
        1100,
      );
    } catch {
      showGestureHud(
        {
          label: "Screenshot blocked",
          side: "left",
        },
        1100,
      );
    }
  }, [
    brightness,
    playable.playableId,
    showGestureHud,
  ]);

  const toggleControlsFromTap = useCallback(() => {
    const video = videoRef.current;

    if (!video || video.paused || video.ended) {
      clearControlsTimer();
      setControlsVisible(true);
      return;
    }

    if (controlsVisible) {
      clearControlsTimer();
      setControlsVisible(false);
    } else {
      revealControls();
    }
  }, [
    clearControlsTimer,
    controlsVisible,
    revealControls,
  ]);

  const processTripleTap = useCallback(
    (xRatio: number, yRatio: number) => {
      if (xRatio <= 0.34 && yRatio <= 0.34) {
        captureScreenshot();
        return;
      }

      if (xRatio >= 0.66 && yRatio <= 0.34) {
        toggleSubtitleShortcut();
        return;
      }

      if (
        xRatio >= 0.33 &&
        xRatio <= 0.67 &&
        yRatio >= 0.66
      ) {
        showGestureHud(
          {
            label: "Picture-in-Picture",
            side: "center",
          },
          850,
        );

        void togglePictureInPicture();
      }
    },
    [
      captureScreenshot,
      showGestureHud,
      togglePictureInPicture,
      toggleSubtitleShortcut,
    ],
  );

  const registerTap = useCallback(
    (xRatio: number, yRatio: number) => {
      if (tapTimerRef.current !== null) {
        window.clearTimeout(tapTimerRef.current);
      }

      tapStateRef.current.count += 1;
      tapStateRef.current.xRatio = xRatio;
      tapStateRef.current.yRatio = yRatio;

      if (tapStateRef.current.count >= 3) {
        const tap = tapStateRef.current;

        tapStateRef.current = {
          count: 0,
          xRatio: 0,
          yRatio: 0,
        };

        tapTimerRef.current = null;

        processTripleTap(
          tap.xRatio,
          tap.yRatio,
        );

        return;
      }

      tapTimerRef.current = window.setTimeout(() => {
        const tap = tapStateRef.current;

        tapStateRef.current = {
          count: 0,
          xRatio: 0,
          yRatio: 0,
        };

        tapTimerRef.current = null;

        if (tap.count === 1) {
          toggleControlsFromTap();
          return;
        }

        if (tap.count === 2) {
          if (tap.xRatio <= 0.45) {
            seekBy(-10);

            showGestureHud(
              {
                label: "−10 seconds",
                side: "left",
              },
              700,
            );

            return;
          }

          if (tap.xRatio >= 0.55) {
            seekBy(10);

            showGestureHud(
              {
                label: "+10 seconds",
                side: "right",
              },
              700,
            );

            return;
          }

          revealControls();
        }
      }, TAP_WINDOW_MS);
    },
    [
      processTripleTap,
      revealControls,
      seekBy,
      showGestureHud,
      toggleControlsFromTap,
    ],
  );

  const handleGesturePointerDown = (
    event: React.PointerEvent<HTMLDivElement>,
  ) => {
    if (gestureRef.current !== null) {
      return;
    }

    const video = videoRef.current;

    gestureRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startAt: performance.now(),
      startBrightness: brightness,
      startVolume: video?.volume ?? volume,
      mode: "pending",
    };

    event.currentTarget.setPointerCapture(
      event.pointerId,
    );
  };

  const handleGesturePointerMove = (
    event: React.PointerEvent<HTMLDivElement>,
  ) => {
    const session = gestureRef.current;

    if (
      !session ||
      session.pointerId !== event.pointerId
    ) {
      return;
    }

    const rect =
      event.currentTarget.getBoundingClientRect();

    const deltaX =
      event.clientX - session.startX;

    const deltaY =
      session.startY - event.clientY;

    const absoluteX = Math.abs(deltaX);
    const absoluteY = Math.abs(deltaY);

    if (session.mode === "pending") {
      if (
        absoluteY >= SWIPE_THRESHOLD_PX &&
        absoluteY > absoluteX * 1.1
      ) {
        const xRatio =
          (session.startX - rect.left) /
          rect.width;

        if (xRatio <= 0.42) {
          session.mode = "brightness";
        } else if (xRatio >= 0.58) {
          session.mode = "volume";
        } else {
          session.mode = "ignored";
        }
      } else if (
        absoluteX >= SWIPE_THRESHOLD_PX
      ) {
        session.mode = "ignored";
      }
    }

    if (session.mode === "brightness") {
      event.preventDefault();

      const change =
        (deltaY / rect.height) * 1.6;

      const nextBrightness = clamp(
        session.startBrightness + change,
        BRIGHTNESS_MIN,
        BRIGHTNESS_MAX,
      );

      setBrightness(nextBrightness);

      const brightnessPercent =
        Math.round(nextBrightness * 100);

      const meter =
        ((nextBrightness - BRIGHTNESS_MIN) /
          (BRIGHTNESS_MAX -
            BRIGHTNESS_MIN)) *
        100;

      showGestureHud({
        label:
          `Brightness ${brightnessPercent}%`,
        side: "left",
        meter,
      });

      return;
    }

    if (session.mode === "volume") {
      event.preventDefault();

      const video = videoRef.current;

      if (!video) {
        return;
      }

      const change =
        (deltaY / rect.height) * 1.25;

      const nextVolume = clamp(
        session.startVolume + change,
        0,
        1,
      );

      try {
        video.volume = nextVolume;
        video.muted = nextVolume === 0;

        setVolume(video.volume);
        setIsMuted(video.muted);

        showGestureHud({
          label:
            `Volume ${Math.round(video.volume * 100)}%`,
          side: "right",
          meter: video.volume * 100,
        });
      } catch {
        session.mode = "ignored";

        showGestureHud({
          label:
            "Volume control unavailable",
          side: "right",
        });
      }
    }
  };

  const handleGesturePointerUp = (
    event: React.PointerEvent<HTMLDivElement>,
  ) => {
    const session = gestureRef.current;

    if (
      !session ||
      session.pointerId !== event.pointerId
    ) {
      return;
    }

    if (
      event.currentTarget.hasPointerCapture(
        event.pointerId,
      )
    ) {
      event.currentTarget.releasePointerCapture(
        event.pointerId,
      );
    }

    gestureRef.current = null;

    if (session.mode !== "pending") {
      return;
    }

    const deltaX =
      event.clientX - session.startX;

    const deltaY =
      event.clientY - session.startY;

    const distance = Math.hypot(
      deltaX,
      deltaY,
    );

    const elapsed =
      performance.now() - session.startAt;

    if (
      distance > TAP_MOVEMENT_LIMIT_PX ||
      elapsed > 500
    ) {
      return;
    }

    const rect =
      event.currentTarget.getBoundingClientRect();

    const xRatio = clamp(
      (session.startX - rect.left) /
        rect.width,
      0,
      1,
    );

    const yRatio = clamp(
      (session.startY - rect.top) /
        rect.height,
      0,
      1,
    );

    registerTap(xRatio, yRatio);
  };

  const handleGesturePointerCancel = (
    event: React.PointerEvent<HTMLDivElement>,
  ) => {
    const session = gestureRef.current;

    if (
      session?.pointerId === event.pointerId
    ) {
      gestureRef.current = null;
    }

    if (
      event.currentTarget.hasPointerCapture(
        event.pointerId,
      )
    ) {
      event.currentTarget.releasePointerCapture(
        event.pointerId,
      );
    }
  };

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

  const seekMaximum =
    duration > 0 ? duration : 1;

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
        className={[
          "video-frame",
          "cinewatch-video-frame",
          controlsVisible
            ? "controls-visible"
            : "controls-hidden",
        ].join(" ")}
      >
        <video
          ref={videoRef}
          className="video-element"
          playsInline
          preload="metadata"
          style={{
            filter:
              `brightness(${brightness})`,
          }}
          onLoadedMetadata={(event) => {
            const video =
              event.currentTarget;

            captureDuration(video);
            setVolume(video.volume);
            setIsMuted(video.muted);

            configureSubtitleTracks(
              selectedSubtitle,
            );

            updateActiveCaption(
              selectedSubtitle,
            );
          }}
          onLoadedData={(event) => {
            captureDuration(
              event.currentTarget,
            );
          }}
          onDurationChange={(event) => {
            captureDuration(
              event.currentTarget,
            );
          }}
          onCanPlay={(event) => {
            captureDuration(
              event.currentTarget,
            );

            setIsBuffering(false);
          }}
          onTimeUpdate={(event) => {
            const video =
              event.currentTarget;

            setCurrentTime(
              video.currentTime,
            );

            captureDuration(video);

            updateActiveCaption(
              selectedSubtitle,
            );
          }}
          onSeeked={() => {
            updateActiveCaption(
              selectedSubtitle,
            );
          }}
          onPlay={() => {
            setIsPlaying(true);
            setHasStarted(true);
            setIsBuffering(false);

            setControlsVisible(true);

            window.setTimeout(() => {
              armControlsAutoHide();
            }, 0);
          }}
          onPause={() => {
            setIsPlaying(false);

            clearControlsTimer();
            setControlsVisible(true);
          }}
          onWaiting={() => {
            setIsBuffering(true);
          }}
          onPlaying={(event) => {
            captureDuration(
              event.currentTarget,
            );

            setIsBuffering(false);

            armControlsAutoHide();
          }}
          onEnded={() => {
            setIsPlaying(false);

            clearControlsTimer();
            setControlsVisible(true);
          }}
          onError={() => {
            setErrorMessage(
              "The playback source could not be loaded.",
            );

            setIsPlaying(false);
            setIsBuffering(false);

            clearControlsTimer();
            setControlsVisible(true);
          }}
          onVolumeChange={(event) => {
            setVolume(
              event.currentTarget.volume,
            );

            setIsMuted(
              event.currentTarget.muted,
            );
          }}
          onRateChange={(event) => {
            setPlaybackRate(
              event.currentTarget
                .playbackRate,
            );
          }}
        >
          {playable.sources.map(
            (source) => (
              <source
                key={source.id}
                src={source.src}
                type={source.mimeType}
              />
            ),
          )}

          {playable.subtitles.map(
            (subtitle) => (
              <track
                key={subtitle.id}
                kind="subtitles"
                src={subtitle.src}
                srcLang={
                  subtitle.language
                }
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
            ),
          )}

          Your browser does not support
          HTML video playback.
        </video>

        <div
          className="player-gesture-surface"
          aria-hidden="true"
          onPointerDown={
            handleGesturePointerDown
          }
          onPointerMove={
            handleGesturePointerMove
          }
          onPointerUp={
            handleGesturePointerUp
          }
          onPointerCancel={
            handleGesturePointerCancel
          }
        />

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

        {gestureHud ? (
          <div
            className={[
              "player-gesture-hud",
              `player-gesture-hud--${gestureHud.side}`,
            ].join(" ")}
            role="status"
          >
            <strong>
              {gestureHud.label}
            </strong>

            {typeof gestureHud.meter ===
            "number" ? (
              <span className="player-gesture-meter">
                <span
                  style={{
                    width:
                      `${clamp(gestureHud.meter, 0, 100)}%`,
                  }}
                />
              </span>
            ) : null}
          </div>
        ) : null}

        {screenshotFlash ? (
          <div
            className="player-screenshot-flash"
            aria-hidden="true"
          />
        ) : null}

        {!hasStarted &&
        !errorMessage ? (
          <button
            className="player-center-action"
            type="button"
            aria-label="Play"
            onClick={() =>
              void togglePlayback()
            }
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

        <div
          className={[
            "player-controls",
            controlsVisible
              ? ""
              : "player-controls--hidden",
          ].join(" ")}
          onPointerDown={(event) => {
            event.stopPropagation();
            revealControls();
          }}
        >
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
                Number(
                  event.currentTarget
                    .value,
                ),
              );
            }}
          />

          <div className="player-time-row">
            <span>
              {formatTime(currentTime)}
            </span>

            <span>
              {formatTime(duration)}
            </span>
          </div>

          <div className="player-control-row">
            <div className="player-control-group">
              <button
                type="button"
                className="player-control-button"
                aria-label={
                  isPlaying
                    ? "Pause"
                    : "Play"
                }
                onClick={() =>
                  void togglePlayback()
                }
              >
                {isPlaying ? "❚❚" : "▶"}
              </button>

              <button
                type="button"
                className="player-control-button player-skip-button"
                aria-label="Back 10 seconds"
                onClick={() => {
                  seekBy(-10);
                  revealControls();
                }}
              >
                −10
              </button>

              <button
                type="button"
                className="player-control-button player-skip-button"
                aria-label="Forward 10 seconds"
                onClick={() => {
                  seekBy(10);
                  revealControls();
                }}
              >
                +10
              </button>

              <button
                type="button"
                className="player-control-button"
                aria-label={
                  isMuted
                    ? "Unmute"
                    : "Mute"
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
                value={
                  isMuted
                    ? 0
                    : volume
                }
                aria-label="Volume"
                onChange={(event) => {
                  handleVolume(
                    Number(
                      event.currentTarget
                        .value,
                    ),
                  );
                }}
              />
            </div>

            <div className="player-control-group player-control-group-right">
              {playable.capabilities
                .subtitles &&
              playable.subtitles.length >
                0 ? (
                <select
                  className="player-select"
                  aria-label="Subtitles"
                  value={
                    selectedSubtitle
                  }
                  onChange={(event) => {
                    applySubtitleSelection(
                      event.currentTarget
                        .value,
                    );

                    revealControls();
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

              {playable.capabilities
                .playbackSpeed ? (
                <select
                  className="player-select player-speed"
                  aria-label="Playback speed"
                  value={playbackRate}
                  onChange={(event) => {
                    changePlaybackRate(
                      Number(
                        event
                          .currentTarget
                          .value,
                      ),
                    );
                  }}
                >
                  <option value={0.5}>
                    0.5×
                  </option>

                  <option value={0.75}>
                    0.75×
                  </option>

                  <option value={1}>
                    1×
                  </option>

                  <option value={1.25}>
                    1.25×
                  </option>

                  <option value={1.5}>
                    1.5×
                  </option>

                  <option value={2}>
                    2×
                  </option>
                </select>
              ) : null}

              {playable.capabilities
                .pictureInPicture ? (
                <button
                  type="button"
                  className="player-control-button"
                  aria-label="Picture-in-Picture"
                  onClick={() => {
                    revealControls();

                    void togglePictureInPicture();
                  }}
                >
                  PiP
                </button>
              ) : null}

              <button
                type="button"
                className="player-control-button"
                aria-label="Fullscreen"
                onClick={() => {
                  revealControls();

                  void toggleFullscreen();
                }}
              >
                ⛶
              </button>
            </div>
          </div>
        </div>
      </div>

      <footer className="player-status">
        <span>
          {playable.playableId}
        </span>

        <span>{playable.kind}</span>

        <span>
          {playable.sources.length}
          {" "}source(s)
        </span>

        <span>
          {playable.subtitles.length}
          {" "}subtitle track(s)
        </span>
      </footer>
    </section>
  );
}
