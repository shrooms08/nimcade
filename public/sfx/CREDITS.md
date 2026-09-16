# Sound credits

Every sound in this folder is built from Kenney's CC0 sample packs. CC0 asks for nothing in
return, so these credits are voluntary.

| Pack | Source |
| --- | --- |
| UI Audio | <https://kenney.nl/assets/ui-audio> |
| Digital Audio | <https://kenney.nl/assets/digital-audio> |
| Impact Sounds | <https://kenney.nl/assets/impact-sounds> |
| Interface Sounds | <https://kenney.nl/assets/interface-sounds> |

Created by Kenney (<https://kenney.nl>) and released under
[CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/) (public domain).

## What each cue is made of

Each file is trimmed of silence, loudness-matched, and encoded as mono Ogg Vorbis (oggenc `-q 3`).

| Cue | Source sample(s) | Treatment |
| --- | --- | --- |
| tap | Interface Sounds `click_001.ogg` | high-pass 180 Hz |
| score | Interface Sounds `select_002.ogg` | high-pass 150 Hz |
| perfect | Digital Audio `twoTone2.ogg` | trimmed to 0.42 s |
| wave | Digital Audio `threeTone2.ogg` | trimmed to 0.44 s |
| power | Digital Audio `phaserUp2.ogg` | trimmed to 0.38 s |
| eat | Interface Sounds `pluck_001.ogg` | trimmed to 0.14 s, high-pass 200 Hz |
| eat-chaser | Impact Sounds `impactPunch_medium_001.ogg` | trimmed to 0.30 s |
| fail | Impact Sounds `impactSoft_heavy_002.ogg` + `footstep_snow_001.ogg` | layered (thud plus noise at -9.6 dB), 0.44 s |
| coin | Interface Sounds `glass_005.ogg` + `pluck_001.ogg` | layered, the pluck pitched up ×1.26 |
| tick | Interface Sounds `tick_002.ogg` | high-pass 300 Hz |
| countdown-beep | Digital Audio `tone1.ogg` | trimmed to 0.13 s |
| countdown-go | Digital Audio `tone1.ogg` | the same tone pitched up ×1.5 |
| swipe | Interface Sounds `scratch_004.ogg` | low-pass 2.2 kHz, faded both ends |
| tip-success | Digital Audio `threeTone1.ogg` | trimmed to 0.62 s |
| new-best | Digital Audio `zapThreeToneUp.ogg` | trimmed to 0.85 s, faded out |
| boost-hum | Digital Audio `zap2.ogg` | steady slice pitched down ×0.55, low-passed, levelled and looped seamlessly |

`fail` and `coin` are layered, and `countdown-go` and `boost-hum` are pitch-shifted, because no
single sample in the packs matched those cues.

The build script that produced these files (download, measure, cut, normalise, encode) is not part
of the app; the sources above are enough to reproduce them.
