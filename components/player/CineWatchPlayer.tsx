"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
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

type RuntimeState =
  | "idle"
  | "loading"
  | "ready"
  | "playing"
  | "paused"
  | "seeking"
  | "buffering"
  | "ended"
  | "error";

type CastState =
  | "unavailable"
  | "available"
  | "connecting"
  | "connected"
  | "disconnected";

type RemotePlaybackHandle = {
  state?: "connecting" | "connected" | "disconnected";
  prompt?: () => Promise<void>;
  watchAvailability?: (
    callback: (available: boolean) => void,
  ) => Promise<number>;
  cancelWatchAvailability?: (
    callbackId?: number,
  ) => Promise<void>;
  addEventListener?: (
    type: string,
    listener: EventListener,
  ) => void;
  removeEventListener?: (
    type: string,
    listener: EventListener,
  ) => void;
};

type CastVideo = HTMLVideoElement & {
  remote?: RemotePlaybackHandle;
};

type RecoverySnapshot = {
  currentTime: number;
  shouldPlay: boolean;
  volume: number;
  muted: boolean;
  playbackRate: number;
  subtitleId: string;
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

function subscribeNetworkStatus(
  notify: () => void,
): () => void {
  const handleNetworkChange = () => {
    notify();
  };

  const handleVisibilityChange = () => {
    if (document.visibilityState === "visible") {
      notify();
    }
  };

  window.addEventListener("online", handleNetworkChange);
  window.addEventListener("offline", handleNetworkChange);
  window.addEventListener("focus", handleNetworkChange);
  window.addEventListener("pageshow", handleNetworkChange);
  document.addEventListener(
    "visibilitychange",
    handleVisibilityChange,
  );

  return () => {
    window.removeEventListener(
      "online",
      handleNetworkChange,
    );
    window.removeEventListener(
      "offline",
      handleNetworkChange,
    );
    window.removeEventListener(
      "focus",
      handleNetworkChange,
    );
    window.removeEventListener(
      "pageshow",
      handleNetworkChange,
    );
    document.removeEventListener(
      "visibilitychange",
      handleVisibilityChange,
    );
  };
}

function getNetworkSnapshot(): boolean {
  return navigator.onLine;
}

function getServerNetworkSnapshot(): boolean {
  return true;
}

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


function PlayIcon() {
  return (
    <svg className="player-control-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8 5.6v12.8L18 12 8 5.6Z" fill="currentColor" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg className="player-control-icon" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="7" y="5" width="3.5" height="14" rx="1" fill="currentColor" />
      <rect x="13.5" y="5" width="3.5" height="14" rx="1" fill="currentColor" />
    </svg>
  );
}

function SkipBackIcon() {
  return (
    <svg className="player-control-icon player-control-icon--skip" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M9.3 7.2H5.8V3.8M6.1 7.1a7.2 7.2 0 1 1-1.2 7.4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      <text x="12" y="15" textAnchor="middle" fontSize="7" fontWeight="700" fill="currentColor">10</text>
    </svg>
  );
}

function SkipForwardIcon() {
  return (
    <svg className="player-control-icon player-control-icon--skip" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M14.7 7.2h3.5V3.8M17.9 7.1a7.2 7.2 0 1 0 1.2 7.4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      <text x="12" y="15" textAnchor="middle" fontSize="7" fontWeight="700" fill="currentColor">10</text>
    </svg>
  );
}

function VolumeIcon({ muted }: { muted: boolean }) {
  return (
    <svg className="player-control-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 10v4h4l5 4V6L8 10H4Z" fill="currentColor" />
      {muted ? (
        <>
          <path d="m16 9 5 6M21 9l-5 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </>
      ) : (
        <>
          <path d="M16 9.2a4 4 0 0 1 0 5.6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          <path d="M18.6 7a7 7 0 0 1 0 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </>
      )}
    </svg>
  );
}

function CastIcon() {
  return (
    <svg className="player-control-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 5.5h14a1.5 1.5 0 0 1 1.5 1.5v10a1.5 1.5 0 0 1-1.5 1.5h-5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M4 16.5a3.5 3.5 0 0 1 3.5 3.5M4 12.5A7.5 7.5 0 0 1 11.5 20M4 20h.01" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  );
}

function PiPIcon() {
  return (
    <svg className="player-control-icon" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3.5" y="5" width="17" height="14" rx="2" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <rect x="12" y="11.5" width="6" height="4.5" rx="1" fill="currentColor" />
    </svg>
  );
}

function FullscreenIcon() {
  return (
    <svg className="player-control-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8.5 4.5h-4v4M15.5 4.5h4v4M4.5 15.5v4h4M19.5 15.5v4h-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ReplayIcon() {
  return (
    <svg className="player-replay-icon" viewBox="0 0 48 48" aria-hidden="true">
      <path className="player-replay-ring" d="M36.2 14.2A16 16 0 1 1 24 8c4.4 0 8.4 1.8 11.3 4.7M36 7v8h-8" fill="none" stroke="currentColor" strokeWidth="3.1" strokeLinecap="round" strokeLinejoin="round" />
      <path className="player-replay-play" d="M21 18.2v11.6L30 24l-9-5.8Z" fill="currentColor" />
    </svg>
  );
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
  const replayTimerRef = useRef<number | null>(null);

  const gestureRef = useRef<GestureSession | null>(null);
  const recoveryRef = useRef<RecoverySnapshot | null>(null);

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
  const [isReplaying, setIsReplaying] = useState(false);
  const [errorMessage, setErrorMessage] =
    useState<string | null>(null);
  const [runtimeState, setRuntimeState] =
    useState<RuntimeState>("idle");
  const [castState, setCastState] =
    useState<CastState>("unavailable");
  const isOnline = useSyncExternalStore(
    subscribeNetworkStatus,
    getNetworkSnapshot,
    getServerNetworkSnapshot,
  );

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

      if (replayTimerRef.current !== null) {
        window.clearTimeout(replayTimerRef.current);
      }
    };
  }, [clearControlsTimer]);

  useEffect(() => {
    const handleOnline = () => {
      showGestureHud(
        {
          label: "Network restored",
          side: "center",
        },
        900,
      );
    };

    const handleOffline = () => {
      showGestureHud(
        {
          label: "Network unavailable",
          side: "center",
        },
        1200,
      );
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [showGestureHud]);

  useEffect(() => {
    const video = videoRef.current as CastVideo | null;
    const remote = video?.remote;

    if (!remote) {
      setCastState("unavailable");
      return;
    }

    let availabilityId: number | undefined;

    const handleConnecting: EventListener = () => {
      setCastState("connecting");
    };

    const handleConnect: EventListener = () => {
      setCastState("connected");
      showGestureHud(
        {
          label: "Casting",
          side: "center",
        },
        1200,
      );
    };

    const handleDisconnect: EventListener = () => {
      setCastState("disconnected");
      showGestureHud(
        {
          label: "Cast disconnected",
          side: "center",
        },
        1000,
      );
    };

    remote.addEventListener?.("connecting", handleConnecting);
    remote.addEventListener?.("connect", handleConnect);
    remote.addEventListener?.("disconnect", handleDisconnect);

    if (remote.watchAvailability) {
      void remote
        .watchAvailability((available) => {
          setCastState((current) => {
            if (
              current === "connected" ||
              current === "connecting"
            ) {
              return current;
            }

            return available ? "available" : "disconnected";
          });
        })
        .then((id) => {
          availabilityId = id;
        })
        .catch(() => {
          setCastState("unavailable");
        });
    } else {
      setCastState(
        remote.state === "connected"
          ? "connected"
          : "available",
      );
    }

    return () => {
      remote.removeEventListener?.("connecting", handleConnecting);
      remote.removeEventListener?.("connect", handleConnect);
      remote.removeEventListener?.("disconnect", handleDisconnect);

      if (
        availabilityId !== undefined &&
        remote.cancelWatchAvailability
      ) {
        void remote
          .cancelWatchAvailability(availabilityId)
          .catch(() => undefined);
      }
    };
  }, [showGestureHud]);

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

  const restoreRecoverySnapshot = useCallback(
    (video: HTMLVideoElement) => {
      const snapshot = recoveryRef.current;

      if (!snapshot) {
        return;
      }

      recoveryRef.current = null;

      const mediaDuration =
        Number.isFinite(video.duration) &&
        video.duration > 0
          ? video.duration
          : 0;

      if (mediaDuration > 0) {
        video.currentTime = clamp(
          snapshot.currentTime,
          0,
          mediaDuration,
        );
      }

      video.volume = clamp(snapshot.volume, 0, 1);
      video.muted = snapshot.muted;
      video.playbackRate = snapshot.playbackRate;

      applySubtitleSelection(snapshot.subtitleId);

      if (snapshot.shouldPlay) {
        void video.play().catch(() => {
          setRuntimeState("paused");
          setErrorMessage(
            "Playback recovered. Tap play to continue.",
          );
        });
      }
    },
    [applySubtitleSelection],
  );

  const retryPlayback = useCallback(() => {
    const video = videoRef.current;

    if (!video) {
      return;
    }

    recoveryRef.current = {
      currentTime: video.currentTime,
      shouldPlay: !video.paused && !video.ended,
      volume: video.volume,
      muted: video.muted,
      playbackRate: video.playbackRate,
      subtitleId: selectedSubtitle,
    };

    setErrorMessage(null);
    setIsBuffering(true);
    setRuntimeState("loading");
    revealControls();

    video.load();
  }, [revealControls, selectedSubtitle]);

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

  const replayFromBeginning = useCallback(async () => {
    const video = videoRef.current;

    if (!video) {
      return;
    }

    if (replayTimerRef.current !== null) {
      window.clearTimeout(replayTimerRef.current);
      replayTimerRef.current = null;
    }

    setErrorMessage(null);
    setIsReplaying(true);
    revealControls();

    try {
      video.currentTime = 0;
      setCurrentTime(0);
      setRuntimeState("loading");
      await video.play();

      replayTimerRef.current = window.setTimeout(() => {
        setIsReplaying(false);
        replayTimerRef.current = null;
      }, 520);
    } catch {
      setIsReplaying(false);
      setRuntimeState("paused");
      setErrorMessage("Playback could not be restarted.");
    }
  }, [revealControls]);

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

  const requestCast = useCallback(async () => {
    const video = videoRef.current as CastVideo | null;
    const remote = video?.remote;

    if (!video || !remote?.prompt) {
      setCastState("unavailable");
      showGestureHud(
        {
          label: "Cast unavailable in this browser",
          side: "center",
        },
        1300,
      );
      return;
    }

    const sourceValue =
      video.currentSrc ||
      playable.sources[0]?.src ||
      "";

    let receiverReachable = true;

    try {
      const sourceUrl = new URL(
        sourceValue,
        window.location.href,
      );

      receiverReachable = ![
        "127.0.0.1",
        "localhost",
        "::1",
      ].includes(sourceUrl.hostname);
    } catch {
      receiverReachable = false;
    }

    if (!receiverReachable) {
      showGestureHud(
        {
          label:
            "Cast UI qualified — Remote/R2 source required",
          side: "center",
        },
        1600,
      );
      return;
    }

    try {
      setCastState("connecting");
      await remote.prompt();

      if (remote.state === "connected") {
        setCastState("connected");
      }
    } catch {
      setCastState(
        remote.state === "connected"
          ? "connected"
          : "available",
      );

      showGestureHud(
        {
          label: "Cast selection closed",
          side: "center",
        },
        1000,
      );
    }
  }, [playable.sources, showGestureHud]);

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
        yRatio <= 0.34
      ) {
        showGestureHud(
          {
            label: "Cast",
            side: "center",
          },
          700,
        );

        void requestCast();
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
      requestCast,
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

      case "KeyC":
        event.preventDefault();
        void requestCast();
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
        <h1>{playable.title}</h1>

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
          onLoadStart={() => {
            setRuntimeState("loading");
            setIsBuffering(true);
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

            restoreRecoverySnapshot(video);
            setRuntimeState(
              video.paused ? "ready" : "playing",
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
            const video =
              event.currentTarget;

            captureDuration(video);
            setIsBuffering(false);

            setRuntimeState(
              video.paused
                ? hasStarted
                  ? "paused"
                  : "ready"
                : "playing",
            );
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
          onSeeking={() => {
            setRuntimeState("seeking");
          }}
          onSeeked={(event) => {
            updateActiveCaption(
              selectedSubtitle,
            );

            setRuntimeState(
              event.currentTarget.paused
                ? "paused"
                : "playing",
            );
          }}
          onPlay={() => {
            setIsPlaying(true);
            setHasStarted(true);
            setIsBuffering(false);
            setRuntimeState("loading");

            setControlsVisible(true);

            window.setTimeout(() => {
              armControlsAutoHide();
            }, 0);
          }}
          onPause={(event) => {
            setIsPlaying(false);

            if (!event.currentTarget.ended) {
              setRuntimeState("paused");
            }

            clearControlsTimer();
            setControlsVisible(true);
          }}
          onWaiting={() => {
            setIsBuffering(true);
            setRuntimeState("buffering");
          }}
          onStalled={() => {
            setIsBuffering(true);
            setRuntimeState("buffering");
          }}
          onPlaying={(event) => {
            captureDuration(
              event.currentTarget,
            );

            setIsBuffering(false);
            setRuntimeState("playing");

            armControlsAutoHide();
          }}
          onEnded={() => {
            setIsPlaying(false);
            setRuntimeState("ended");

            clearControlsTimer();
            setControlsVisible(true);
          }}
          onError={() => {
            setErrorMessage(
              "The playback source could not be loaded.",
            );

            setRuntimeState("error");
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
            <PlayIcon />
          </button>
        ) : null}

        {isBuffering ||
        runtimeState === "seeking" ? (
          <div
            className="player-buffering"
            role="status"
          >
            {runtimeState === "seeking"
              ? "Seeking…"
              : "Loading…"}
          </div>
        ) : null}

        {runtimeState === "ended" || isReplaying ? (
          <button
            type="button"
            className={[
              "player-replay-button",
              isReplaying
                ? "player-replay-button--active"
                : "",
            ].join(" ")}
            aria-label="Replay from beginning"
            disabled={isReplaying}
            onClick={() => {
              void replayFromBeginning();
            }}
          >
            <ReplayIcon />
          </button>
        ) : null}

        {!isOnline ? (
          <div
            className="player-network-state"
            role="status"
          >
            Offline
          </div>
        ) : null}

        {errorMessage ? (
          <div
            className="player-error"
            role="alert"
          >
            <span>{errorMessage}</span>

            <button
              type="button"
              className="player-retry-button"
              onClick={retryPlayback}
            >
              Retry
            </button>
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
                {isPlaying ? <PauseIcon /> : <PlayIcon />}
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
                <SkipBackIcon />
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
                <SkipForwardIcon />
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
                <VolumeIcon muted={isMuted} />
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

              <button
                type="button"
                className={[
                  "player-control-button",
                  castState === "connected"
                    ? "player-cast-button--active"
                    : "",
                ].join(" ")}
                aria-label={
                  castState === "connected"
                    ? "Casting"
                    : "Cast"
                }
                aria-pressed={
                  castState === "connected"
                }
                onClick={() => {
                  revealControls();
                  void requestCast();
                }}
              >
                <CastIcon />
              </button>

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
                  <PiPIcon />
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
                <FullscreenIcon />
              </button>
            </div>
          </div>
        </div>
      </div>

      <details className="player-diagnostics">
        <summary>Qualification diagnostics</summary>

        <dl>
          <div><dt>Playable</dt><dd>{playable.playableId}</dd></div>
          <div><dt>Type</dt><dd>{playable.kind}</dd></div>
          <div><dt>Sources</dt><dd>{playable.sources.length}</dd></div>
          <div><dt>Subtitles</dt><dd>{playable.subtitles.length}</dd></div>
          <div><dt>Runtime</dt><dd>{runtimeState}</dd></div>
          <div><dt>Network</dt><dd>{isOnline ? "online" : "offline"}</dd></div>
          <div><dt>Cast</dt><dd>{castState}</dd></div>
        </dl>
      </details>
    </section>
  );
}
