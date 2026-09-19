export type PlayableKind = "movie" | "episode";

export type PlaybackSource = {
  id: string;
  src: string;
  mimeType: string;
  label: string;
};

export type SubtitleTrack = {
  id: string;
  language: string;
  label: string;
  src: string;
  format: "vtt";
  default?: boolean;
};

export type PlayerCapabilities = {
  pictureInPicture: boolean;
  playbackSpeed: boolean;
  subtitles: boolean;
};

export type PlayableManifest = {
  playableId: string;
  title: string;
  kind: PlayableKind;
  episodeLabel?: string;
  sources: PlaybackSource[];
  subtitles: SubtitleTrack[];
  capabilities: PlayerCapabilities;
};
