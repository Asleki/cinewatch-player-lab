# CineWatch TV Player Lab — Final Scope and Handoff

## Purpose

This repository is the isolated qualification environment for the CineWatch TV Player. It was created so Player behavior could be designed and proven without using the main CineWatch TV repository as an experimentation workspace.

Main project: https://github.com/Asleki/cinewatch-tv

## Final lab status

The local Player qualification phase is complete.

The lab has proven custom controls, mobile gestures, playback state handling, network/retry behavior, advanced seeking and seek preview, fullscreen, Picture-in-Picture continuity, screenshot capture where browser policy permits, the Remote Playback/Cast UI boundary, local movie playback, local series/season/episode discovery, episodic playback through the same Player, and a server-side live subtitle discovery/acquisition boundary with invalid-payload rejection.

## Deliberately deferred

The Player Lab does not claim completion of production Cloudflare R2 delivery, CDN/signed playback delivery, HLS packaging, DRM, production Cast receiver playback, CineWatch TV authentication or entitlement, playback-rights authority, production user progress/history, dynamic live subtitle injection, or automatic subtitle synchronization selection.

Those belong to CineWatch TV integration and production delivery.

## Qualification fixtures

The lab uses private/local media fixtures. Media files are intentionally excluded from Git.

A qualification fixture proves Player behavior; it does not become production CineWatch content merely because it was used for engineering.

## Player architecture boundary

The Player remains media-source agnostic, storage-provider agnostic, title-provider agnostic, subtitle-provider agnostic, manifest-driven, and independent from playback-rights decisions.

```text
authorized playable manifest
          ↓
   CineWatch Player
```

## Episodic rule

Episode arrangement is inventory-driven. The lab must not fabricate missing episodes or silently renumber a partial source set.

## Public repository boundary

Never commit qualification video files, creator masters, private subtitle sources, API credentials, private test evidence, secrets, or production storage credentials.

## Handoff rule

The production integration target is CineWatch TV `Stream Now`.

The CinePlay local-files experience is a lab harness. Its filesystem scanner and qualification routes are not intended to be copied blindly into the CineWatch TV production codebase.

The Player component, its manifest principles, interaction behavior, recovery semantics, and proven qualification lessons are the reusable engineering output.
