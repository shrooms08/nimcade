# Sound credits

Every sound in this folder is built from **The Essential Retro Video Game Sound Effects Collection
[512 sounds]** by **Juhani Junkala**, released under
[CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/) (public domain).
CC0 asks for nothing in return, so these credits are voluntary.

- Pack: <https://opengameart.org/content/512-sound-effects-8-bit-style>
- Author: Juhani Junkala (<https://juhanijunkala.com/>)

## What each cue is made of

Each file is trimmed of silence, loudness-matched, and encoded as mono Ogg Vorbis (oggenc `-q 3`).
Sources are listed by their folder in the pack.

| Cue | Source sample | Treatment |
| --- | --- | --- |
| tap | Menu Sounds / `sfx_menu_select2.wav` | trimmed to 0.18 s |
| score | Coins / `sfx_coin_single3.wav` | trimmed to 0.20 s |
| perfect | Positive Sounds / `sfx_sounds_powerup10.wav` | trimmed to 0.38 s |
| wave | Positive Sounds / `sfx_sounds_powerup14.wav` | trimmed to 0.55 s |
| power | Positive Sounds / `sfx_sounds_powerup3.wav` | trimmed to 0.42 s |
| eat | Simple Bleeps / `sfx_sounds_Blip6.wav` | trimmed to 0.11 s; the gentlest bleep in the folder |
| eat-chaser | Impacts / `sfx_sounds_impact13.wav` | trimmed to 0.30 s |
| fail | Explosions / Short / `sfx_exp_short_soft6.wav` | the soft variant, trimmed to 0.48 s |
| coin | Coins / `sfx_coin_double1.wav` | trimmed to 0.22 s |
| tick | Menu Sounds / `sfx_menu_move1.wav` | as is (39 ms) |
| countdown-beep | Menu Sounds / `sfx_menu_move3.wav` | as is (76 ms) |
| countdown-go | Menu Sounds / `sfx_menu_move3.wav` | the same tone pitched up ×1.5 |
| swipe | Menu Sounds / `sfx_menu_move5.wav` | low-passed to 1.4 kHz and faded in; the pack has no whoosh |
| tip-success | Fanfares / `sfx_sounds_fanfare3.wav` | trimmed to 0.68 s |
| new-best | Fanfares / `sfx_sounds_fanfare1.wav` | trimmed to 1.1 s |
| boost-hum | Movement / Vehicles / `sfx_vehicle_engineloop.wav` | pitched down ×0.85, low-passed, levelled and looped seamlessly |

`countdown-go` is pitch-shifted and `swipe` is filtered because the pack has no separate sound for
either; everything else is used as recorded, only trimmed and loudness-matched.

The hum file carries 20 ms of the loop's own tail before it and head after it, so the engine can
loop inside clean audio (Vorbis rings at file edges). The loop is 41,375 samples starting at 0.02 s.

The build script that produced these files (download, cut, normalise, encode) is not part of the
app; the sources above are enough to reproduce them.
