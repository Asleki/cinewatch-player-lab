import type { PlayableManifest } from "./types";

export function assertPlayableManifest(
  manifest: PlayableManifest,
): PlayableManifest {
  if (!manifest.playableId.trim()) {
    throw new Error("Playable manifest requires playableId");
  }

  if (!manifest.title.trim()) {
    throw new Error("Playable manifest requires title");
  }

  if (manifest.sources.length === 0) {
    throw new Error("Playable manifest requires at least one playback source");
  }

  for (const source of manifest.sources) {
    if (!source.id.trim() || !source.src.trim() || !source.mimeType.trim()) {
      throw new Error("Playback sources require id, src, and mimeType");
    }
  }

  for (const subtitle of manifest.subtitles) {
    if (!subtitle.id.trim() || !subtitle.language.trim() || !subtitle.src.trim()) {
      throw new Error("Subtitle tracks require id, language, and src");
    }
  }

  return manifest;
}
