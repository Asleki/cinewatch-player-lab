import type { PlayableManifest } from "@/lib/playable/types";

export const samplePlayable: PlayableManifest = {
  playableId: "LAB-PLAY-001",
  title: "Qualification Movie",
  kind: "movie",
  sources: [
    {
      id: "local-qualification-source",
      src: "/api/qualification/media",
      mimeType: "video/mp4",
      label: "Local qualification source",
    },
  ],
  subtitles: [
    {
      id: "local-nl",
      language: "nl",
      label: "Nederlands",
      src: "/api/qualification/subtitle",
      format: "vtt",
      default: true,
    },
  ],
  capabilities: {
    pictureInPicture: true,
    playbackSpeed: true,
    subtitles: true,
  },
};
