# CineWatch TV Player Lab

## Purpose

This repository is an isolated qualification environment for the
CineWatch TV Player.

It exists to design, test, and qualify playback behavior before any
Player implementation is introduced into:

https://github.com/Asleki/cinewatch-tv

The main CineWatch TV repository must not be modified by Player Lab
experimentation.

## Development Principle

The Player is qualified independently first.

The first qualification uses one lawful local test movie and real
subtitle material.

Only after local Player qualification and remote-delivery
qualification may integration into CineWatch TV be considered.

## Player Foundation 001

The first Player milestone must eventually qualify:

- play and pause;
- seeking;
- 10-second backward and forward controls;
- current playback time and duration;
- volume and mute;
- fullscreen;
- Picture-in-Picture where supported;
- playback speed;
- subtitle loading;
- subtitle enable/disable;
- subtitle switching;
- subtitle synchronization after seeking;
- loading state;
- buffering state;
- ended state;
- playback error state;
- mobile touch behavior;
- desktop keyboard behavior.

## Architecture Boundary

The Player must remain:

- media-source agnostic;
- storage-provider agnostic;
- title-provider agnostic;
- subtitle-provider agnostic;
- data-driven rather than hard-coded to a single movie.

The local qualification source may later be replaced by an authorized
Cloudflare R2/CDN playback source without redesigning the Player UI.

## Private Boundary

The public repository must never contain:

- qualification movie files;
- creator media;
- downloaded private/source subtitle files;
- API keys;
- provider credentials;
- private test evidence;
- secrets;
- temporary qualification downloads.

Those belong under the ignored local `private/` boundary or another
explicitly ignored local path.

## Main Repository Boundary

This repository is independent from:

`Asleki/cinewatch-tv`

No Player Lab experiment may directly modify that repository.

## Integration Gate

Player integration into CineWatch TV requires both:

1. Player Foundation qualification.
2. Remote/R2 delivery qualification.

A successful local demo alone is not sufficient for integration.
