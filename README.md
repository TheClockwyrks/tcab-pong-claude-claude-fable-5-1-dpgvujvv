# Carom

Carom is a top-down paddle duel that runs entirely in the browser. Two paddles
face each other across a dark field while a ball ricochets between them, off the
top and bottom walls, and off a pair of obstacles standing in midfield. A player
scores when the ball passes the far edge behind the opponent's paddle; first to
11 wins, by two clear points.

Carom's defining mechanic is **spin**: the motion of a paddle at the moment it
strikes the ball curves the ball's flight afterward. A paddle moving down as it
hits adds clockwise curve, a paddle moving up adds the opposite, and the curve
fades over time. The two obstacles turn the open field into a bank-shot puzzle:
they return the ball without slowing it, so a well-curved shot can bend around
the defence.

Play it solo against the machine or as two local players sharing one keyboard.
Everything is drawn and synthesized in code; there are no assets, no backend,
and nothing fetched at runtime.

## Install

Node.js 20 or later is required.

```sh
npm ci
```

## Run in development

```sh
npm run dev
```

Vite serves the game with hot reload and prints the URL to open.

## Build the static site

```sh
npm run build
```

This type-checks the project and emits the complete site into `dist/`, with
`index.html` at its root. The output is self-contained and runs when served as-is
from any static file server, at the root or under a sub-path. To check the
build locally:

```sh
npm run preview
```

## Controls

| Action                          | Keys                          |
| ------------------------------- | ----------------------------- |
| Player one (left paddle) up     | `W`                           |
| Player one (left paddle) down   | `S`                           |
| Player two (right paddle) up    | `↑`                           |
| Player two (right paddle) down  | `↓`                           |
| Confirm a menu item             | `Enter`, `Space`              |
| Back                            | `Esc`                         |
| Pause / resume                  | `P`, `Esc`                    |
| Mute                            | `M`                           |
| Toggle the debug overlay        | `` ` `` (backtick)            |

In **Solo** either pair of movement keys moves your paddle on the left, and the
machine plays the right. In **Versus** `W`/`S` move the left paddle and `↑`/`↓`
the right.

Menus can also be driven with the mouse or by touch: hovering or touching an
item selects it, and a click or tap confirms it. On a touchscreen the engine
draws a vertical slider along each edge for the paddles.

## Checks

```sh
npm run typecheck   # tsc --noEmit
npm run lint        # eslint
npm run format      # prettier --check
npm test            # vitest, with coverage over src/
```

The tests live beside the sources as `src/**/*.test.ts`. They stand the engine up
over a headless canvas, pose scenarios through the game's debug surface, step an
exact number of frames, and read the result back, so no browser is needed.

## Project layout

- `src/game.ts` declares the game state, the debug surface, and the `game` the
  engine drives.
- `src/simulation.ts` steps one frame: input, paddles, ball, scoring.
- `src/physics.ts`, `src/paddles.ts`, `src/menus.ts` hold the ball, paddle, and
  menu rules; `src/render.ts` draws; `src/debug.ts` builds the debug surface.
- `src/constants.ts` holds every figure the specification fixes.
- `specs/` is the specification and `engine/` the engine's own documentation.
- `showcase/` holds the store-page description, the carousel manifest, and its
  media. `node scripts/capture.ts` regenerates the media from the running game.
