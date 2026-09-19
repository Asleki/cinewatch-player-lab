# CineWatch Player Lab

Isolated qualification lab for the CineWatch TV Player.

This repository exists to develop and qualify video playback, subtitles, Player controls, media-source abstraction, and delivery behavior before any Player implementation enters the main CineWatch TV repository.

## Repository Status

**Player Foundation 001 — boundary establishment**

No production Player implementation has been qualified yet.

## Safety Boundary

This repository is public.

Real qualification media, downloaded subtitle sources, credentials, secrets, and private test evidence must never be committed.

Local-only qualification material belongs under the ignored private/ directory.

## Main CineWatch TV Repository

The Player Lab is deliberately independent from:

https://github.com/Asleki/cinewatch-tv

The live CineWatch TV repository is not used as an experimentation workspace for Player development.

## Qualification Strategy

Development proceeds through:

Local Player Qualification
→ Remote / R2 Delivery Qualification
→ Integration Review
→ CineWatch TV Integration

The goal is to qualify the Player thoroughly enough that later integration requires connection to CineWatch authorities rather than a Player redesign.
