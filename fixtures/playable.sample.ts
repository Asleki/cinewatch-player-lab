import type { PlayableManifest } from "@/lib/playable/types";

export const samplePlayable: PlayableManifest = {
  playableId: "LAB-PLAY-001",
  title: "Qualification Movie",
  kind: "movie",
  sources: [
    {
      id: "local-source",
      src: "/lab-media/qualification-movie.mp4",
      mimeType: "video/mp4",
      label: "Local qualification source",
    },
  ],
  subtitles: [],
  capabilities: {
    pictureInPicture: true,
    playbackSpeed: true,
    subtitles: true,
  },
};
