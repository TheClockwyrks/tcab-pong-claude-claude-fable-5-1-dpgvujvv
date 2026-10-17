# Carom — Game state

`src/game.ts` declares and exports the state the game is written against. This
section is that declaration: write it into `src/game.ts` exactly as it stands
here. The state is a value the engine holds and every frame replaces, so every
field and every array is declared `readonly`: a frame builds the next state from
the current one rather than writing into it, and every reader is handed the state
as `DeepReadonly<CaromState>`.

```ts
export type Screen =
  "title" | "howto" | "countdown" | "playing" | "paused" | "matchover";

export type Mode = "solo" | "versus";

export type Side = "left" | "right";

export interface PaddleState {
  readonly cy: number;
  readonly vy: number;
  readonly driven: boolean;
  readonly drivenVy: number;
}

export interface AiState {
  readonly tracking: boolean;
  readonly movement: boolean;
}

export interface TrailSample {
  readonly x: number;
  readonly y: number;
  readonly t: number;
}

export interface BallState {
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly spin: number;
  readonly held: boolean;
  readonly holdTimer: number;
  readonly serveSign: 1 | -1;
  readonly trail: readonly TrailSample[];
}

export interface ObstacleState {
  readonly index: number;
  readonly cx: number;
  readonly cy: number;
}

export interface CaromState {
  readonly screen: Screen;
  readonly mode: Mode;
  readonly menuIndex: number;
  readonly titleIndex: number;
  readonly resumeScreen: "countdown" | "playing";

  readonly score: { readonly p1: number; readonly p2: number };
  readonly winner: Side | null;

  readonly paddles: { readonly left: PaddleState; readonly right: PaddleState };
  readonly ai: AiState;

  readonly receiver: Side;
  readonly ball: BallState | null;
  readonly obstacles: readonly ObstacleState[];

  readonly simTime: number;
  readonly muted: boolean;
}
```

## The contract

The declaration above is what the debug surface reads and poses.

- Keep every field under its declared name, type, and meaning.
- `initialize` builds the whole state in one go, so every field is present by the
  time a frame can observe it, and none of them is optional.
- The declared fields are the whole of the authoritative state. Fields you add
  hold derived data you can rebuild from them.
- The state handed to `update` is the whole of the game, and the state `update`
  returns is the whole of the next frame. Every value the game carries from one
  frame to the next lives in it, and none of them in a module-level variable or a
  closure.
- The state is handed over read-only, as `DeepReadonly<CaromState>`, to `update`,
  to `render`, to every diagnostic source, and to every operation of the debug
  surface. `update` and the surface's poses return a new `CaromState` built from
  the one they received; `render` and the diagnostic sources return no state, and
  the surface's readings return what they read.

## What the state carries

The state carries the following, and the rest of this specification refers to
each by the name used here.

### Screens and menus

| Field | Holds |
| --- | --- |
| `screen` | The screen currently shown, one of the six `specs/ui.md` names. |
| `mode` | The mode the current or most recent match is played in. |
| `menuIndex` | The highlighted item on whichever menu `screen` is showing. |
| `titleIndex` | The title menu's remembered selection. `specs/ui.md` states what sets it and what restores `menuIndex` from it. |
| `resumeScreen` | The screen the pause menu resumes to, `countdown` or `playing`. |

### The match

| Field | Holds |
| --- | --- |
| `score` | The two scores, `p1` the left player's and `p2` the right player's. |
| `winner` | The winning side once the match is over, and `null` until then. |
| `receiver` | The side the next serve travels toward, as `specs/balls.md` states. |

### The paddles

There are two paddles, left and right, and both are always present. A paddle's
`x` is fixed by the side it is on, so only the vertical axis is state. Each
paddle carries:

| Field | Holds |
| --- | --- |
| `cy` | Center y, in logical units, clamped as `specs/playfield.md` states. |
| `vy` | That paddle's vertical velocity for the frame, in units per second, after the integration `specs/playfield.md` fixes. The spin mechanic reads it at contact. |
| `driven` | Whether the debug surface is moving that paddle rather than the player or the AI. `specs/instrumentation.md` states what a driven paddle does. |
| `drivenVy` | The velocity a driven paddle moves at, in units per second. `specs/instrumentation.md` states what sets it and how it differs from `vy`. |

### The AI opponent

The AI's two faculties are each declared state, and both gate the rule
`specs/modes/single-player.md` states.

| Field | Holds |
| --- | --- |
| `tracking` | Whether the AI senses the ball and chooses a target. |
| `movement` | Whether the AI's paddle travels toward that target. |

### The ball

Whether the ball is present is state. `specs/instrumentation.md` states what
places it and what removes it. The ball carries:

| Field | Holds |
| --- | --- |
| `x`, `y` | The ball's center, in logical units. |
| `vx`, `vy` | The ball's velocity, in units per second. |
| `spin` | The signed spin scalar, in units per second squared, as `specs/balls.md` states. |
| `held` | Whether the ball waits at its home point rather than flying. It is the ball's own flag, and a pause leaves it as it was. |
| `holdTimer` | Seconds remaining of that wait. |
| `serveSign` | The vertical sign the ball's serve takes, `1` or `-1`. `specs/balls.md` states when it is drawn and how the serve uses it. |
| `trail` | The ball's trail samples, oldest first, each a position in logical units and the simulation time it was recorded at. |

On every `countdown` or `playing` frame, after the ball has been advanced, the
ball's `(x, y)` and the simulation time are appended as a sample, and every
sample older than `TRAIL_TIME` is dropped.

### The obstacles

Which obstacles are present is state. The obstacles in the field are carried in
the order of `OBSTACLE_CENTERS`, each under its own `index`, `0` or `1`.
`specs/instrumentation.md` states what places an obstacle and what removes it.
Each obstacle carries `cx` and `cy`, its fixed center in logical units, which is
`OBSTACLE_CENTERS[index]`.

### Time and sound

| Field | Holds |
| --- | --- |
| `simTime` | Accumulated simulation time, in seconds. The game adds every update's delta time to it, whatever the screen, the paused screen and the menus included. |
| `muted` | The game's readable copy of the runtime's mute bit, which `specs/audio.md` states the game mirrors. |

## The state at the title screen

The game opens on the title screen holding the values below.

| Field | Value |
| --- | --- |
| `screen` | `title` |
| `mode` | `solo` |
| `menuIndex`, `titleIndex` | `0` |
| `resumeScreen` | `playing` |
| `score` | `0` and `0` |
| `winner` | `null` |
| `receiver` | `left` |
| Each paddle | `cy` at `FIELD_CY`, `vy` and `drivenVy` `0`, not driven |
| The AI | `tracking` and `movement` both `true` |
| The ball | present at its home point, held, `holdTimer` at `HOLD_TIME`, zero velocity, zero spin, empty trail, `serveSign` drawn as `specs/balls.md` states |
| The obstacles | both present at `OBSTACLE_CENTERS` |
| `simTime` | `0` |
| `muted` | the runtime's mute bit |
