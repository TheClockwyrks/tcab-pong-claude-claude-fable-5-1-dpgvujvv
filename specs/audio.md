# Carom — Audio

This file defines the sounds the game plays, when each one plays, and how muting
behaves. The events themselves are defined by `specs/balls.md` and
`specs/playfield.md`; this file names the sound each one makes.

## Cues

Audio plays through the runtime's cue bus, which the runtime documents. Define
and play exactly the cues below, under exactly these names, which the seeded
`CUES` constant carries:

| Cue | Constant | Played when |
| --- | --- | --- |
| `paddle-hit` | `CUES.paddleHit` | The ball hits a paddle's left or right face. |
| `wall-bounce` | `CUES.wallBounce` | The ball reflects off the top or bottom wall, or off a paddle's end cap. |
| `obstacle-bounce` | `CUES.obstacleBounce` | The ball bounces off an obstacle. |
| `score` | `CUES.score` | A point is scored. |

Each cue is a distinct short blip, so the four events are told apart by ear.

Each plays on the frame its event happens, from the game's update, once on that
frame however many sub-steps raised it.

## Muting

Muting and the first-gesture unlock belong to the runtime. The game binds the
`mute` action to the runtime's mute bit and toggles it from any screen, then
mirrors that bit into the `muted` value `specs/state.md` declares, which a
snapshot reports.

The game stays fully playable with sound muted: muting silences the cues and
changes nothing else.
