from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LIBRARY = ROOT / "lib/local-library/library.ts"
TYPES = ROOT / "lib/local-library/types.ts"
API = ROOT / "app/api/qualification/library/route.ts"
MEDIA = ROOT / "app/api/qualification/library/media/route.ts"
UI = ROOT / "components/library/CinePlayLibrary.tsx"

def main() -> None:
    library = LIBRARY.read_text(encoding="utf-8")
    types = TYPES.read_text(encoding="utf-8")
    api = API.read_text(encoding="utf-8")
    media = MEDIA.read_text(encoding="utf-8")
    ui = UI.read_text(encoding="utf-8")
    combined = "\n".join((library, types, api, media, ui))
    assert "PLAYER_LAB_MEDIA_PATH" in library
    assert "PLAYER_LAB_BONANZA_DIR" in library
    assert "parseBonanzaEpisodeFilename" in library
    assert "groupSeasons" in library
    assert "left.season - right.season" in library
    assert "left.episode - right.episode" in library
    assert "Creature of Darkness" in library
    assert '"Bonanza"' in library
    assert "resolveLocalMedia" in media
    assert "serveLocalFile" in media
    assert '"Cache-Control": "private, no-store"' in api
    assert "Movies" in ui
    assert "Series" in ui
    assert "Season {season.season}" in ui
    assert "CineWatchPlayer" in ui
    assert "episodeLabel" in ui
    assert "/storage/emulated/" not in combined
    assert "/data/data/com.termux/" not in combined
    assert "episode + 1" not in combined
    assert "episode+1" not in combined
    print("PASS: CinePlay local library and episodic arrangement contract")

if __name__ == "__main__":
    main()
