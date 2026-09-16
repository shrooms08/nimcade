# Sound credits

Sound effects generated with [ElevenLabs](https://elevenlabs.io) (text to sound effects), then
trimmed, loudness-matched and encoded for the app. Three variants were generated per cue and one
was picked by ear; the raw candidates are kept out of the repo (`sfx-raw/`, gitignored).

## How each cue was made

Every file is mono Ogg Vorbis (oggenc `-q 3`), trimmed of silence and capped to the length below.
Cues under 250 ms are peak-matched; the rest are matched to -16 LUFS, and a few that would clip
before reaching it are lifted with a gentle limiter (capped at +6 dB).

| Cue | Prompt | Length |
| --- | --- | --- |
| tap | soft rounded UI tap, warm, mobile game, no click harshness | 300 ms |
| score | short bright pop with a tiny pitch rise, casual mobile game point sound | 400 ms |
| perfect | glassy two-note chime rising, satisfying, casual puzzle game | 600 ms |
| wave | short ascending three-note jingle, warm synth bells, level up | 880 ms |
| power | warm synth sweep rising into a soft bell hit, power up granted | 680 ms |
| eat | tiny soft bubble pop, very gentle, repeating pickup sound | 157 ms |
| eat-chaser | thick satisfying pop with a low thump, enemy captured, casual game | 400 ms |
| fail | soft low descending wobble, game over, casual mobile, not harsh | 622 ms |
| coin | warm coin ping with a bell tone, mobile game | 400 ms |
| tick | very quiet soft wooden tick, timer | 150 ms |
| countdown-beep | soft marimba note, countdown | 300 ms |
| countdown-go | soft marimba note higher pitched with a small sparkle, go | 480 ms |
| swipe | very soft fabric swish, quiet, short, subtle interface transition | 261 ms |
| tip-success | warm short success jingle, three ascending bell notes, payment sent | 1000 ms |
| new-best | celebratory jingle, bright bells and a soft sparkle tail, new high score | 927 ms |
| boost-hum | smooth airy engine hum, steady, seamless loop, low volume | 1494 ms |
| dodge-flip | quick soft dash swish, light and airy, lane change in a casual runner game, no click | 480 ms |
| dodge-coin | gentle soft coin pickup, muted bell, quiet, repeating collectible in a runner, not sharp | 480 ms |

Dodge uses `dodge-flip` and `dodge-coin` in place of the shared `tap` and `coin`, at a gentler
0.35 gain, because a round fires them far more often than any other game fires its cues.

The hum is cut to a whole loop and crossfaded by 150 ms, then padded with 20 ms of its own tail and
head so the engine can loop inside clean audio (Vorbis rings at file edges). The loop is 64,139
samples starting at 0.02 s.

Per-cue playback gains live in [src/lib/sound.ts](../../src/lib/sound.ts): repeating cues 0.4,
chimes and one-off effects 0.7, jingles 0.75, and the hum 0.3 under a 0.6 master gain.
