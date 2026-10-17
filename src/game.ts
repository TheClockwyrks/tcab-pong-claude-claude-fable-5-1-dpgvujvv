// Carom — the game.
//
// This module declares the state the whole game is written against, the debug
// and automation surface that poses and reads it, and the `game` object the
// engine drives. The simulation itself lives beside it: `simulation.ts` steps a
// state against a frame's input and delta time, `render.ts` draws one, and
// `debug.ts` builds the surface. Everything the game carries from one frame to
// the next lives in `CaromState`, and nothing but `update` and the surface's
// poses advances it.

import type {
  Game,
  InitApi,
  RenderApi,
  UpdateApi,
} from "@clockwyrks/simple-2d";
import type { DeepReadonly } from "ts-essentials";
import { defineCues } from "./audio";
import { ACTIONS, BINDINGS } from "./constants";
import { createDebugApi } from "./debug";
import { registerDiagnostics } from "./diagnostics";
import { readInput } from "./input";
import { render } from "./render";
import { step } from "./simulation";
import { titleState } from "./state";

// ---- The state -------------------------------------------------------------

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

/**
 * A pointer or touch contact that pressed on a menu and has not lifted yet:
 * which pointer it is and the item it landed on, or `null` when it landed on no
 * item. A menu confirm needs the press and the release inside one item's
 * region, and the two edges may arrive on different frames, so the press is
 * remembered until its release. It is input bookkeeping rather than game state:
 * it affects nothing a player sees, and `reset` clears it with the rest.
 */
export interface MenuPress {
  readonly pointerId: number;
  readonly index: number | null;
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

  /** See {@link MenuPress}. Derived from input alone; never shown or reported. */
  readonly menuPress: MenuPress | null;
}

// ---- The debug surface -----------------------------------------------------

/** A menu item's hit region, in logical units, with `(x, y)` its top-left. */
export interface MenuRect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** The ball as `snapshot` reports it: the declared fields plus `speed`. */
export interface BallSnapshot {
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly speed: number;
  readonly spin: number;
  readonly held: boolean;
  readonly holdTimer: number;
  readonly serveSign: 1 | -1;
  readonly trail: readonly TrailSample[];
}

/** The whole declared state, as `specs/instrumentation.md` shapes it. */
export interface CaromSnapshot {
  readonly version: number;
  readonly screen: Screen;
  readonly mode: Mode;
  readonly menuIndex: number;
  readonly titleIndex: number;
  readonly resumeScreen: "countdown" | "playing";
  readonly score: { readonly p1: number; readonly p2: number };
  readonly winner: Side | null;
  readonly muted: boolean;
  readonly paddles: { readonly left: PaddleState; readonly right: PaddleState };
  readonly ai: AiState;
  readonly receiver: Side;
  readonly ball: BallSnapshot | null;
  readonly obstacles: readonly ObstacleState[];
  readonly simTime: number;
}

type S = DeepReadonly<CaromState>;

/**
 * The debug and automation surface. Every pose takes the current state and
 * returns the next one; every reading takes the current state and returns what
 * it read. A caller drives a pose through `engine.apply` and a reading against
 * `engine.state`.
 */
export interface CaromDebugApi {
  readonly version: number;

  // The world.
  clearWorld(state: S): CaromState;
  spawnBall(state: S): CaromState;
  spawnObstacle(state: S, index: number): CaromState;
  reset(state: S): CaromState;
  reconcile(state: S): CaromState;

  // Screens and menus.
  setScreen(state: S, screen: Screen): CaromState;
  setMode(state: S, mode: Mode): CaromState;
  setMenuIndex(state: S, index: number): CaromState;
  setTitleIndex(state: S, index: number): CaromState;
  setResumeScreen(state: S, screen: "countdown" | "playing"): CaromState;

  // Match state.
  setScore(state: S, p1: number, p2: number): CaromState;
  setWinner(state: S, side: Side | null): CaromState;
  setReceiver(state: S, side: Side): CaromState;

  // Paddles.
  setPaddleCy(state: S, side: Side, cy: number): CaromState;
  setPaddleVy(state: S, side: Side, vy: number): CaromState;
  setPaddleDriven(state: S, side: Side, driven: boolean): CaromState;

  // The ball.
  setBallPosition(state: S, x: number, y: number): CaromState;
  setBallVelocity(state: S, vx: number, vy: number): CaromState;
  setBallSpin(state: S, spin: number): CaromState;
  setBallHeld(state: S, held: boolean): CaromState;
  setBallHoldTimer(state: S, seconds: number): CaromState;
  setBallServeSign(state: S, sign: 1 | -1): CaromState;
  drawBallServeSign(state: S): CaromState;

  // The AI opponent.
  setAiTracking(state: S, enabled: boolean): CaromState;
  setAiMovement(state: S, enabled: boolean): CaromState;

  // Audio.
  setMuted(state: S, muted: boolean): CaromState;

  // Readings.
  snapshot(state: S): CaromSnapshot;
  menuItemRect(state: S, index: number): MenuRect | null;
}

// ---- The game --------------------------------------------------------------

/**
 * The field background, a CSS color string. `src/main.ts` hands it to the engine
 * as the color the canvas is cleared to each frame, so the letterbox bars around
 * the field match the field itself.
 */
export const BACKGROUND = "#0b0f1e";

/** The game this build's engine drives. */
export const game: Game<CaromState, CaromDebugApi> = {
  initialize(api: InitApi<CaromState>): [CaromState, CaromDebugApi] {
    for (const action of ACTIONS) {
      api.input.register(action, { keys: [...BINDINGS[action]] });
    }
    defineCues(api.audio);
    registerDiagnostics(api.diagnostics);
    // The runtime's mute bit starts clear; `update` mirrors it from then on.
    return [titleState(false), createDebugApi()];
  },

  update(state: S, api: UpdateApi, dt: number): CaromState {
    const input = readInput(api.input);

    // The state's `muted` and the runtime's bit agree at the end of every
    // update, so a disagreement at the start is a pose: the runtime follows it.
    if (state.muted !== api.audio.muted()) api.audio.setMuted(state.muted);
    if (input.pressed.mute) api.audio.setMuted(!api.audio.muted());

    const { state: next, cues } = step(state, input, dt);
    for (const cue of cues) api.audio.play(cue);

    return { ...next, muted: api.audio.muted() };
  },

  render(state: S, api: RenderApi): void {
    render(state, api.ctx);
  },
};
