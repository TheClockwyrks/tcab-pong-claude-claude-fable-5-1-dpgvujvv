# Carom — Debug and automation surface

Carom carries a small debugging and automation surface so the game can be driven
and inspected from code without touching the keyboard or waiting on real time.

You implement it. Every operation this file specifies is a deliverable, and the
build's `initialize` returns the finished surface beside the state it built, as
the pair `[state, debug]`. The engine returns that same value from
`engine.debug`, and it is reached that way alone: nothing is installed on the
page. Every scenario driven from code reaches the game through it, so it is
present and exactly as specified here.

Each operation is a reading or a pose of `CaromState`, written in the shape of
`update`, because the engine holds the state by value and nothing holds a
writable one. A pose takes the current state, as `DeepReadonly<CaromState>`, and
returns the next `CaromState`; a reading takes the state the same way and returns
what it read. A caller drives a pose through the engine's `apply`, as
`engine.apply((s) => debug.setScreen(s, "countdown"))`, and a reading against the
engine's current state, as `debug.snapshot(engine.state)`. A pose sets one field,
places one entity, or clears the field, and the game's own `update` runs the real
collisions and the real AI from there on the next frame, so a scenario driven from
code behaves exactly like one played by hand. `src/game.ts` declares and exports
its type, `CaromDebugApi`.

The surface is inert during normal play, doing nothing until something calls it.

## A render-free core

The surface rests on a render-free core. Game state advances from the elapsed
simulation time the game is handed, independent of a canvas, of the frame loop
that measured it, and of wall-clock time, so a step means the same thing whatever
the frame rate. The dependency runs one way: the simulation reads nothing from
the renderer.

Every rate is integrated against that delta time, so a scenario driven twice
under frame lengths anywhere between `2` and `16` milliseconds plays out the
same way. Both drives reach the same paddle contacts, the same wall bounces, and
the same points; the ball's speed agrees within `10` units per second; its
direction agrees axis by axis, with a vertical speed under `120` units per second
counting as level; and the scenario takes the same game time within `8` per
cent. Positions carry the drift a change in step size explains and are held to
no bound.

## What the runtime provides instead

The clock, the keyboard, and the overlay belong to the Simple 2D engine,
which documents them in the `engine/` directory, and the surface carries no
operation for any of them. The engine advances the game frame by frame and can
take it off real time, it drives the actions the game registers, and it draws and
toggles the debug overlay.

What the overlay shows is Carom's, under Diagnostics below.

## Driving the paddles

The surface takes each paddle from the player on its own side.

- While a paddle is not driven it plays normally: the registered actions move the
  human paddles and, in Solo, the AI moves the right one.
- `setPaddleDriven(side, driven)` is the only pose that changes whether a paddle
  is driven, and driving one side leaves the other as it was. Every other pose
  leaves both paddles' driven flags as it found them. `reset` releases both,
  along with every other declared field it restores.
- While a paddle is driven it moves at that side's `drivenVy`, integrated and
  clamped exactly as `specs/playfield.md` states. The input actions and the AI
  leave that paddle alone.

Each paddle carries `drivenVy` and `vy` as two separate fields, both of which
`specs/state.md` declares and the snapshot below reports. `setPaddleVy` is the
only pose that sets `drivenVy`, which `reset` returns to `0` with every other
declared field. `drivenVy` holds its value across frames whether or not that
paddle is driven. A paddle's `vy` is the integrated velocity for the frame that
`specs/playfield.md` fixes, whoever moved the paddle, so a `drivenVy` set while
the paddle stands still reaches `vy` on the first frame advanced with that side
driven.

## The operations

The surface carries `version` (`CAROM_DEBUG_VERSION`, `1`), a plain number, and
the operations below. Values are plain numbers, strings, and booleans, and
coordinates and velocities are in the field's logical units.
Each operation sets one field or one fixed pair of fields, places or removes one
entity, or reads the state. `reset` is the exception: it restores every declared
field at once.

A pose reaches the value it names whatever the game's own rules would have
allowed a player, and it acts from wherever the game stands: which screen is up,
where a paddle is, and whether the field is in play are how a person reaches an
effect and are none of a pose's conditions. What a pose never does is refuse
quietly. A call the game has nothing to act on — an index naming no ball and no
obstacle, a field of a ball that is not on the playfield — fails loudly instead,
so a caller never reads a refusal as a pose. A caller reads what a pose left from
`snapshot` rather than from a return value.

Each operation's first parameter is the current state, `DeepReadonly<CaromState>`,
and the tables below name the parameters that follow it. A pose returns the next
`CaromState`, built from the one it was handed, which it leaves as it was; a
reading returns what it read. `setScore(p1, p2)` below is therefore
`setScore(state, p1, p2)`.

### The world

The game has one ball, which every operation below acts on. Obstacle indices are
`0` and `1`, in the order of `OBSTACLE_CENTERS`.

| Operation | Effect |
| --- | --- |
| `clearWorld()` | Removes every ball and every obstacle from the field, leaving it empty. The paddles stay. |
| `spawnBall()` | Places the ball at its home point, held, with `holdTimer` at `HOLD_TIME`, zero velocity, zero spin, an empty trail, and a fresh `serveSign`, drawn as `specs/balls.md` states. |
| `spawnObstacle(index)` | Places obstacle `index` at `OBSTACLE_CENTERS[index]`. |
| `reset()` | Returns the game to its title-screen state. |
| `reconcile()` | Brings every reading this surface reports into agreement with the world as it stands, advancing nothing. |

An absent ball takes no part in a frame: it is not advanced, it is not drawn, it
collides with nothing, and it scores no point. An absent obstacle is not drawn and
has no collision. Spawning an entity that is already present returns it to the
arrangement its row states.

`reset` sets every declared field to the title-screen value `specs/state.md`
gives it, with the world placed exactly as `spawnBall` and `spawnObstacle` place
it.

`reset` leaves the mute bit alone, so `muted` is unchanged. Every value the build
keeps across frames is rebuilt from what a reset restores.

`reconcile` brings every value this surface reports into agreement with the game
as it now stands, without advancing anything.
A ball's `speed` follows from its velocity, so after a pose it answers for the
ball as it is now rather than as it was before. A build that works it out at the
read has nothing to do here and this call changes nothing; a build that keeps it
as a stored copy rewrites that copy from what it is a copy of.

It moves no clock and runs no system: `simTime` is untouched, nothing is
integrated, no collision is resolved, no ball is served, no hold timer counts
down, no trail sample is written, and no serve sign is drawn. It plays
no sound, changes no screen, and writes nothing a player would see. It moves
nothing to make a reading agree, so a ball posed inside a paddle stays where it
was put and reads as it is. A paddle's `vy` is the value the last frame
integrated and stays the update's to change. Calling it twice leaves the same
state as calling it once.

It is never an error and may be called on any screen.

`reconcile(state)` returns the next `CaromState`, built from the one it was
handed, which it leaves as it was. A build that works every one of those readings
out at the call returns a state equal to the one it was given.

### Screens and menus

| Operation | Effect |
| --- | --- |
| `setScreen(screen)` | Sets the current screen to one of the six `specs/ui.md` names. |
| `setMode(mode)` | Sets the mode to `"solo"` or `"versus"`. |
| `setMenuIndex(index)` | Sets the highlighted item on whichever menu the current screen shows. |
| `setTitleIndex(index)` | Sets the title menu's remembered selection. |
| `setResumeScreen(screen)` | Sets the screen a pause resumes to, `countdown` or `playing`. |

Each sets its own field alone. `setScreen` leaves the scores, the world, and the
menu indices as they are, and the screen it sets then behaves exactly as
`specs/ui.md` states for that screen.

### Match state

| Operation | Effect |
| --- | --- |
| `setScore(p1, p2)` | Sets both scores. |
| `setWinner(side)` | Sets the winning side to `"left"` or `"right"`, or clears it with `null`. |
| `setReceiver(side)` | Sets the side the next serve travels toward. |

The win rule `specs/balls.md` states still resolves through real play, so a
match ends when a real point is driven.

### Paddles

`side` is `"left"` or `"right"`.

| Operation | Effect |
| --- | --- |
| `setPaddleCy(side, cy)` | Sets that paddle's center y. |
| `setPaddleVy(side, vy)` | Sets that paddle's `drivenVy`, in units per second, and leaves its `vy` as it is. |
| `setPaddleDriven(side, driven)` | Takes that paddle from the player, or hands it back. |

Each sets its own field alone. Driving the paddles above states how `drivenVy` and
`vy` differ and what a driven paddle does.

### The ball

| Operation | Effect |
| --- | --- |
| `setBallPosition(x, y)` | Places the ball. |
| `setBallVelocity(vx, vy)` | Sets the ball's velocity, in units per second. |
| `setBallSpin(spin)` | Sets the ball's spin, in units per second squared. |
| `setBallHeld(held)` | Sets whether the ball waits at its home point rather than flying. |
| `setBallHoldTimer(seconds)` | Sets the seconds remaining of the ball's hold. |
| `setBallServeSign(sign)` | Sets the ball's `serveSign` to `1` or `-1`. |
| `drawBallServeSign()` | Draws the ball's `serveSign` afresh, exactly as parking it does, and changes nothing else. |

Each sets its own field alone. An absent ball is no ball to set, so every one of
them fails loudly while the field carries none. Setting the hold timer to `0`
ends the hold.
The ball is served on the next advanced frame through the game's own rule, as
`specs/balls.md` states, with the `serveSign` it holds at that moment.

### The AI opponent

The AI's two faculties are gated on their own. Both start `true`, and `reset`
returns both to `true`.

| Operation | Effect |
| --- | --- |
| `setAiTracking(enabled)` | Whether the AI senses the ball and chooses a target. |
| `setAiMovement(enabled)` | Whether the AI's paddle travels toward its target. |

They act on the rule `specs/modes/single-player.md` states, on every frame that
rule runs. With tracking `false` the AI's target is `AI_HOME_Y` with
`AI_HOME_DEADZONE`, whatever the ball is doing. With movement `false` the AI
leaves its paddle where it is, with `vy` of `0`.

### Audio

| Operation | Effect |
| --- | --- |
| `setMuted(muted)` | Sets the mute bit to `true` or `false`. It is the bit the `mute` action toggles, so `muted` reports what this set. |

The bit is the runtime's, as `specs/audio.md` states, and this sets it through
the game exactly as the `mute` action does.

### Readings

| Operation | Returns |
| --- | --- |
| `snapshot()` | The whole declared state, as the shape below. |
| `menuItemRect(index)` | The hit region of item `index` on the menu the current screen shows. |

Both leave the game as they found it.

`menuItemRect` returns `{ x, y, w, h }` in logical units, with `x` and `y` the
region's top-left corner and `w` and `h` its size: the region a pointer selects
that item from, as `specs/ui.md` states. It returns `null` on `countdown` and
`playing`, which show no menu, and when `index` names no item of the menu the
current screen shows.

## Snapshot shape

`snapshot` returns:

```js
{
  version: 1,
  screen: "title" | "howto" | "countdown" | "playing" | "paused" | "matchover",
  mode: "solo" | "versus",
  menuIndex: <number>,       // the highlighted item on the current menu
  titleIndex: <number>,      // the title menu's remembered selection
  resumeScreen: "countdown" | "playing",
  score: { p1: <number>, p2: <number> },
  winner: "left" | "right" | null,   // the winning side once the match is over
  muted: <boolean>,                  // whether the mute toggle is currently on
  paddles: {
    // `vy` is the velocity the last frame integrated; `drivenVy` is the velocity
    // `setPaddleVy` last set for that side.
    left:  { cy: <number>, vy: <number>, drivenVy: <number>, driven: <boolean> },
    right: { cy: <number>, vy: <number>, drivenVy: <number>, driven: <boolean> },
  },
  ai: { tracking: <boolean>, movement: <boolean> },

  receiver: "left" | "right",
  // The ball, or null while no ball is present. Its `trail` carries the ball's
  // samples, oldest first, as `specs/state.md` declares them, and `serveSign`
  // is the vertical sign its serve takes.
  ball: { x: <number>, y: <number>, vx: <number>, vy: <number>,
          speed: <number>, spin: <number>, held: <boolean>,
          holdTimer: <number>, serveSign: 1 | -1,
          trail: [{ x: <number>, y: <number>, t: <number> }] } | null,

  // Every obstacle present, at its fixed center.
  obstacles: [
    { index: <number>, cx: <number>, cy: <number> },
  ],
  simTime: <number>,   // accumulated simulation time, in seconds
}
```

Every field an operation of this surface sets appears here, so every operation is
verified by setting a value and reading it back.

Four fields are read rather than posed. `version` is the constant above, `speed`
is `hypot(vx, vy)`, a paddle's `vy` is the integrated value
`specs/playfield.md` fixes rather than the value `setPaddleVy` writes, and
`simTime` is the accumulator every update adds its delta time to, which `reset`
returns to `0` and no other operation writes.

`speed` is derived rather than held, being a function of the velocity. A build is
free to work it out at the read or to keep it as a stored copy, and `reconcile()`
is what brings a stored copy back into agreement after a pose.

The `obstacles` array carries only the obstacles present, each entry under its own
`index`, and `ball` is `null` while no ball is present, so a cleared field reports
an empty array and a `null` ball.

The ball's `holdTimer` is posed by `setBallHoldTimer` and then counted down by
the game on every frame, by the rule `specs/balls.md` states. The ball's `trail`
is emptied by `spawnBall` and written by the game alone, by the rule
`specs/state.md` states. The ball's `serveSign` is posed by `setBallServeSign`
and drawn by `drawBallServeSign` and by every parking, by the rule
`specs/balls.md` states.

## Diagnostics

The runtime's debug overlay shows the values the game registers with it as
diagnostic sources. Register at least the current `screen` and `mode`, both
scores, the ball's position, velocity, speed, and spin, and each paddle's center
and velocity, the same facts `snapshot` reports. Keep each one short enough to
read on a line, and keep every source a pure read, so watching the overlay leaves
the simulation as it is.

Registering those values is the whole of Carom's part, through
`InitApi.diagnostics`. Each source is called with the state current at the read,
as `DeepReadonly<CaromState>`, and reports the value that state carries. Drawing
the panel, toggling it, and keeping it read-only are the engine's.
