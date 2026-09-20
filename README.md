# CineWatch TV Player Lab

[![CI](https://github.com/Asleki/cinewatch-player-lab/actions/workflows/ci.yml/badge.svg)](https://github.com/Asleki/cinewatch-player-lab/actions/workflows/ci.yml)
[![Portfolio Guide](https://img.shields.io/badge/portfolio-GitHub%20Pages-111827)](https://asleki.github.io/cinewatch-player-lab/)
[![Next.js](https://img.shields.io/badge/Next.js-16.3.4-black)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19.2.8-149eca)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-6.0.3-3178c6)](https://www.typescriptlang.org/)

An isolated engineering and qualification lab for the **CineWatch TV Player**.

The lab was created to design, implement, and qualify a custom browser video player independently from the main CineWatch TV application. The production integration target is the `Stream Now` experience in [Asleki/cinewatch-tv](https://github.com/Asleki/cinewatch-tv).

> **Status:** local Player qualification complete and ready for production integration review. Remote production delivery, rights authority, entitlement, and CineWatch TV integration are intentionally owned by the main CineWatch TV project.

## Project page

**Portfolio / usage guide:**
https://asleki.github.io/cinewatch-player-lab/

The GitHub Pages site is a static project guide. It does **not** host the Player or any test movie. The actual Player uses server routes and private/local qualification media, so run the repository locally to exercise playback.

## What this project proves

The lab qualifies a media-source-agnostic Player rather than a one-off video page.

### Player foundation

- custom play / pause controls;
- timeline seeking;
- 10-second backward / forward controls;
- current time and duration;
- mute and volume;
- playback speeds from `0.5×` through `2×`;
- fullscreen;
- Picture-in-Picture where supported;
- replay state after playback ends;
- responsive mobile-first controls;
- runtime states for loading, ready, playing, paused, seeking, buffering, ended, and error;
- retry / recovery behavior;
- network-state feedback.

### Advanced seeking

- large horizontal swipe seeking;
- edge hold-seek acceleration;
- timeline scrub preview;
- scene-frame preview when canvas capture is available;
- timestamp fallback when frame capture is unavailable.

### Mobile gesture layer

- single tap — show / hide controls;
- double tap left — seek backward 10 seconds;
- double tap right — seek forward 10 seconds;
- vertical swipe on the left — visual brightness control;
- vertical swipe on the right — volume control;
- triple tap top-left — screenshot;
- triple tap top-right — subtitle shortcut;
- triple tap top-center — Cast / Remote Playback boundary;
- triple tap bottom-center — Picture-in-Picture;
- horizontal swipe — long seek;
- hold near an edge — accelerated seeking.

### Picture-in-Picture continuity

The Player preserves playback intent across Picture-in-Picture entry and exit, including the distinction between playback that was running before PiP and playback that the user intentionally paused while PiP was active.

### Cast boundary

The Player includes a browser Remote Playback / Cast boundary and qualified Cast UI behavior.

Actual external receiver playback is deliberately not claimed as qualified by this repository. Local qualification sources are guarded because a remote receiver requires a remotely reachable media source.

### Movies and episodic media

The final local qualification shell, **CinePlay**, proves:

```text
Files
├── Movies
│   └── local movie fixture
└── Series
    └── Bonanza
        ├── Season 1
        └── Season 2
            └── episode
                 └── CineWatch Player
```

Episode identity is derived from the actual discovered files. Missing episodes remain missing rather than being silently renumbered.

The lab successfully exercised both a movie fixture and an episodic fixture through the same Player.

### Live subtitle acquisition boundary

The repository also contains an experimental server-side Wyzie subtitle boundary that demonstrates:

```text
episode identity
→ CineWatch server
→ Wyzie discovery
→ candidate selection
→ subtitle fetch
→ payload validation
→ SRT → WebVTT normalization
```

The API key remains server-side. Invalid upstream HTTP-200 error bodies are rejected rather than being mislabeled as valid WebVTT.

Dynamic subtitle injection, candidate synchronization policy, and production subtitle-provider integration remain intentionally deferred to CineWatch TV integration work.

## Architecture

```text
                    PlayableManifest
                           │
                           ▼
                ┌─────────────────────┐
                │  CineWatch Player   │
                │  React / TypeScript │
                └──────────┬──────────┘
                           │
          ┌────────────────┼─────────────────┐
          │                │                 │
          ▼                ▼                 ▼
     media source      subtitle tracks   capabilities
          │                │                 │
          ▼                ▼                 ▼
 local qualification   local / live      PiP / speed /
 route or future R2    server boundary   subtitle support
```

The Player itself does not decide whether a title may legally be streamed. In production, CineWatch TV's playback / rights authority must make that decision before a playable manifest reaches the Player.

## Repository boundaries

This is a **public** repository.

It intentionally does not contain:

- movie or episode files;
- creator media;
- downloaded source subtitle files;
- API keys;
- provider credentials;
- private qualification evidence;
- production secrets.

Private/local material belongs under the ignored `private/` boundary or another ignored local path.

The Player Lab is deliberately separate from:

https://github.com/Asleki/cinewatch-tv

The main repository was not used as an experimentation workspace while the Player was being qualified.

## Requirements

The project currently targets:

- **Node.js:** `>=24.18.0 <25`
- **npm:** `>=12 <13`
- a modern browser with HTML5 video support;
- Python 3 for the lightweight contract checks.

The Player was primarily qualified in an Android / Termux development workflow.

## Quick start

```bash
git clone https://github.com/Asleki/cinewatch-player-lab.git
cd cinewatch-player-lab
npm ci
cp .env.example .env.local
```

The repository does not ship test media. Configure an absolute path to a local MP4 that you are permitted to use:

```dotenv
PLAYER_LAB_MEDIA_PATH=/absolute/path/to/your/movie.mp4
```

Optional local episodic qualification uses:

```dotenv
PLAYER_LAB_BONANZA_DIR=/absolute/path/to/your/bonanza-folder
```

The Bonanza scanner is a qualification fixture and expects filenames containing real `SxxExx` identities such as:

```text
Bonanza s02e01 SHOWDOWN.mp4
```

Run the development server:

```bash
npm run dev
```

Then open:

```text
http://127.0.0.1:3000
```

On another device on the same network, use the host machine's reachable LAN address rather than `127.0.0.1`.

## Optional subtitle boundary

The live Wyzie boundary is optional.

Never commit a real key. It may be supplied through the local environment:

```dotenv
WYZIE_API_KEY=
```

The lab can also read the ignored local private-secret boundary used during qualification.

## Validation

```bash
npm run typecheck
npm run lint
npm run build
```

Or:

```bash
npm run check
```

Run the source-level qualification contracts:

```bash
python3 tests/test_wyzie_live_server_boundary.py
python3 tests/test_local_media_library_contract.py
```

Check repository whitespace:

```bash
git diff --check
```

GitHub Actions runs the same core qualification gates for pushed commits and pull requests.

## Production-style run

```bash
npm start
```

Different port:

```bash
PORT=3001 npm start
```

## Important routes

```text
/                                           CinePlay local qualification UI
/api/qualification/media                    original local movie route
/api/qualification/subtitle                 original local subtitle route
/api/qualification/library                  local movie / series inventory
/api/qualification/library/media            selected library media
/api/qualification/subtitles/availability   live subtitle discovery
/api/qualification/subtitles/acquire        live subtitle acquisition
```

These are **qualification routes**, not the proposed CineWatch TV production API.

## Key engineering decisions

1. **Player before integration.** Later CineWatch work can focus on rights, delivery, entitlement, identity, progress, and history.
2. **Data-driven playback.** The UI consumes a `PlayableManifest` rather than hard-coding one movie.
3. **Local media stays private.** Real media is never committed merely to make the public repository runnable.
4. **Inventory beats arithmetic.** Episodic media follows discovered inventory instead of assuming `episode + 1` exists.
5. **Upstream success is not semantic success.** A subtitle provider returning HTTP 200 does not prove it returned a subtitle.
6. **Playback permission belongs outside the Player.** The Player renders an authorized playable source; it does not grant playback rights.

## Project completion state

| Area | State |
|---|---|
| Custom Player foundation | Qualified |
| Mobile gestures | Qualified |
| Runtime / network recovery | Qualified |
| Advanced seeking / preview | Qualified |
| PiP playback continuity | Qualified |
| Cast / Remote Playback UI boundary | Qualified boundary; remote receiver delivery deferred |
| Local movie playback | Qualified |
| Local series / season / episode arrangement | Qualified |
| Episodic playback | Qualified |
| Live subtitle server boundary | Qualified boundary |
| Subtitle candidate synchronization policy | Deferred |
| Dynamic live subtitle injection into Player | Deferred |
| Remote R2 production delivery | Deferred to CineWatch TV integration |
| DRM / HLS production pipeline | Deferred |
| CineWatch rights / entitlement authority | Main CineWatch TV responsibility |

See [docs/FINAL_QUALIFICATION_REPORT.md](docs/FINAL_QUALIFICATION_REPORT.md).

## Relationship to CineWatch TV

```text
CineWatch title / episode
        │
        ▼
playback + rights authority
        │
        ▼
authorized playable manifest
        │
        ▼
CineWatch Player
```

The local CinePlay file browser is a qualification harness. It is **not** intended to become CineWatch TV's `Stream Now` catalogue UI.

Production integration belongs in:

https://github.com/Asleki/cinewatch-tv

## Portfolio summary

> **CineWatch TV Player Lab** — Built and qualified a custom Next.js / React / TypeScript video-player lab with mobile gesture controls, advanced seek previews, Picture-in-Picture continuity, Remote Playback casting boundaries, runtime recovery, local movie and episodic media discovery, and a server-side live subtitle acquisition boundary. Designed the Player as a source-agnostic component for later integration into CineWatch TV's rights-controlled `Stream Now` experience.

## Technology

- Next.js 16
- React 19
- TypeScript 6
- HTMLMediaElement / HTML5 video
- Picture-in-Picture API
- Fullscreen API
- Remote Playback API
- Canvas frame capture
- Next.js route handlers
- Python contract checks
- GitHub Actions
- GitHub Pages

## License

The repository is currently marked `UNLICENSED` in its package metadata. No third-party movie, episode, subtitle corpus, provider credential, or production media license is conveyed by this source repository.
