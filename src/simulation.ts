// The whole game, one frame at a time: `step` takes the current state, the
// frame's input, and its delta time, and returns the next state beside the
// cues the frame raised. It reads nothing from the renderer and nothing from
// the clock, so a scenario plays out the same at any frame rate.

import type { DeepReadonly } from "ts-essentials";
import {
  BALL_R,
  CUES,
  FIELD_W,
  SERVE_ANGLE,
  SERVE_SPEED,
  TRAIL_TIME,
  WIN_LEAD,
  WIN_SCORE,
} from "./constants";
import type { CueName } from "./constants";
import type { BallState, CaromState, PaddleState, Side } from "./game";
import type { FrameInput } from "./input";
import {
  applyMenuKeys,
  applyMenuPointer,
  isMenuScreen,
  releaseStalePress,
} from "./menus";
import { aiVy, humanVy, integratePaddle } from "./paddles";
import { stepBall } from "./physics";
import { parkedBall } from "./state";

export interface StepResult {
  readonly state: CaromState;
  readonly cues: ReadonlySet<CueName>;
}

const NO_CUES: ReadonlySet<CueName> = new Set();

/** The side the win rule awards the match to, or `null` while it goes on. */
export const winnerOf = (score: {
  readonly p1: number;
  readonly p2: number;
}): Side | null => {
  if (score.p1 >= WIN_SCORE && score.p1 - score.p2 >= WIN_LEAD) return "left";
  if (score.p2 >= WIN_SCORE && score.p2 - score.p1 >= WIN_LEAD) return "right";
  return null;
};

/** Reads the frame's input on the screen it began on. */
const applyInput = (
  state: DeepReadonly<CaromState>,
  input: FrameInput,
): CaromState => {
  const { pressed } = input;
  if (isMenuScreen(state.screen)) {
    const edges = {
      up: pressed["p1-up"] || pressed["p2-up"],
      down: pressed["p1-down"] || pressed["p2-down"],
      confirm: pressed.confirm,
      back: pressed.back,
      pause: pressed.pause,
    };
    const afterKeys = applyMenuKeys(state, edges);
    // A screen reached this frame takes its first input on the next one.
    if (afterKeys.screen !== state.screen) return afterKeys;
    // Movement takes precedence over `confirm`, so a confirm edge acted only
    // when no movement edge came with it.
    const keyboardConfirmed = edges.confirm && !edges.up && !edges.down;
    return applyMenuPointer(afterKeys, input.pointer, keyboardConfirmed);
  }
  const cleared = releaseStalePress(state, input.pointer);
  if (pressed.pause) {
    return {
      ...cleared,
      screen: "paused",
      resumeScreen: state.screen === "countdown" ? "countdown" : "playing",
      menuIndex: 0,
    };
  }
  return cleared;
};

/** Both paddles after the frame, each moved by whoever owns it. */
const movePaddles = (
  state: DeepReadonly<CaromState>,
  input: FrameInput,
  dt: number,
): { left: PaddleState; right: PaddleState } => {
  const { held } = input;
  const solo = state.mode === "solo";
  const left = state.paddles.left;
  const right = state.paddles.right;

  let leftVy: number;
  if (left.driven) leftVy = left.drivenVy;
  else if (solo) {
    leftVy = humanVy(
      Math.max(held["p1-up"], held["p2-up"]),
      Math.max(held["p1-down"], held["p2-down"]),
    );
  } else leftVy = humanVy(held["p1-up"], held["p1-down"]);

  let rightVy: number;
  if (right.driven) rightVy = right.drivenVy;
  else if (solo) rightVy = aiVy(right, state.ai, state.ball, state.screen, dt);
  else rightVy = humanVy(held["p2-up"], held["p2-down"]);

  return {
    left: integratePaddle(left, leftVy, dt),
    right: integratePaddle(right, rightVy, dt),
  };
};

/** The ball with a sample at its position appended and the old ones dropped. */
const sampled = (ball: BallState, simTime: number): BallState => {
  const cutoff = simTime - TRAIL_TIME;
  const kept = ball.trail.filter((s) => s.t >= cutoff);
  return { ...ball, trail: [...kept, { x: ball.x, y: ball.y, t: simTime }] };
};

/** The hold counting down, and the serve on the frame it elapses. */
const countdown = (state: CaromState, dt: number): CaromState => {
  const ball = state.ball;
  if (ball === null) return state;
  const timed = sampled(ball, state.simTime);
  const holdTimer = timed.holdTimer - dt;
  if (holdTimer > 0) return { ...state, ball: { ...timed, holdTimer } };

  const dir = state.receiver === "left" ? -1 : 1;
  return {
    ...state,
    screen: "playing",
    ball: {
      ...timed,
      holdTimer: 0,
      held: false,
      trail: [],
      vx: dir * SERVE_SPEED * Math.cos(SERVE_ANGLE),
      vy: timed.serveSign * SERVE_SPEED * Math.sin(SERVE_ANGLE),
    },
  };
};

/** A point for `scorer`, and either the end of the match or the next hold. */
const scorePoint = (state: CaromState, scorer: Side): CaromState => {
  const score = {
    p1: state.score.p1 + (scorer === "left" ? 1 : 0),
    p2: state.score.p2 + (scorer === "right" ? 1 : 0),
  };
  const winner = winnerOf(score);
  if (winner !== null) {
    return { ...state, score, winner, screen: "matchover", menuIndex: 0 };
  }
  return {
    ...state,
    score,
    receiver: scorer === "left" ? "right" : "left",
    ball: parkedBall(),
    screen: "countdown",
  };
};

/** The ball in flight for one frame, its trail, and any point it scored. */
const play = (state: CaromState, dt: number): StepResult => {
  const ball = state.ball;
  if (ball === null) return { state, cues: NO_CUES };
  const stepped = stepBall(ball, state.paddles, state.obstacles, dt);
  const flown = sampled(stepped.ball, state.simTime);
  const next = { ...state, ball: flown };

  let scorer: Side | null = null;
  if (flown.x - BALL_R > FIELD_W) scorer = "left";
  else if (flown.x + BALL_R < 0) scorer = "right";
  if (scorer === null) return { state: next, cues: stepped.cues };

  const cues = new Set(stepped.cues);
  cues.add(CUES.score);
  return { state: scorePoint(next, scorer), cues };
};

/** One frame of the live field: paddles, then the ball, then scoring. */
const advanceField = (
  state: CaromState,
  input: FrameInput,
  dt: number,
): StepResult => {
  const moved = { ...state, paddles: movePaddles(state, input, dt) };
  if (moved.screen === "countdown") {
    return { state: countdown(moved, dt), cues: NO_CUES };
  }
  return play(moved, dt);
};

/** The next state from the current one, and the cues the frame raised. */
export const step = (
  state: DeepReadonly<CaromState>,
  input: FrameInput,
  dt: number,
): StepResult => {
  const timed: CaromState = { ...state, simTime: state.simTime + dt };
  const after = applyInput(timed, input);
  if (after.screen === "countdown" || after.screen === "playing") {
    return advanceField(after, input, dt);
  }
  return { state: after, cues: NO_CUES };
};
