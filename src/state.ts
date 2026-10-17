// State constructors: the title-screen state, a parked ball, the obstacles, and
// the two transitions every menu shares, starting a match and returning to the
// title. Each builds a whole value; nothing here writes into a state it was
// handed.

import type { DeepReadonly } from "ts-essentials";
import { FIELD_CX, FIELD_CY, HOLD_TIME, OBSTACLE_CENTERS } from "./constants";
import type {
  BallState,
  CaromState,
  Mode,
  ObstacleState,
  PaddleState,
} from "./game";

export const clamp = (value: number, lo: number, hi: number): number =>
  Math.min(hi, Math.max(lo, value));

/** A fresh serve sign, `1` and `-1` each equally likely. */
export const drawServeSign = (): 1 | -1 => (Math.random() < 0.5 ? 1 : -1);

/** A paddle at rest at the vertical center, not driven. */
export const restingPaddle = (): PaddleState => ({
  cy: FIELD_CY,
  vy: 0,
  driven: false,
  drivenVy: 0,
});

/**
 * A ball parked at its home point: held for `HOLD_TIME`, motionless, spinless,
 * with an empty trail and a freshly drawn serve sign.
 */
export const parkedBall = (): BallState => ({
  x: FIELD_CX,
  y: FIELD_CY,
  vx: 0,
  vy: 0,
  spin: 0,
  held: true,
  holdTimer: HOLD_TIME,
  serveSign: drawServeSign(),
  trail: [],
});

/** Obstacle `index` at its fixed center. */
export const obstacleAt = (index: number): ObstacleState => {
  const center = OBSTACLE_CENTERS[index];
  if (center === undefined) {
    throw new RangeError(
      `Carom: no obstacle has index ${String(index)}; the indices are 0 and 1`,
    );
  }
  return { index, cx: center.x, cy: center.y };
};

/** Both obstacles, in the order of `OBSTACLE_CENTERS`. */
export const allObstacles = (): ObstacleState[] =>
  OBSTACLE_CENTERS.map((_, index) => obstacleAt(index));

/** The state the game opens on, holding the runtime's mute bit. */
export const titleState = (muted: boolean): CaromState => ({
  screen: "title",
  mode: "solo",
  menuIndex: 0,
  titleIndex: 0,
  resumeScreen: "playing",
  score: { p1: 0, p2: 0 },
  winner: null,
  paddles: { left: restingPaddle(), right: restingPaddle() },
  ai: { tracking: true, movement: true },
  receiver: "left",
  ball: parkedBall(),
  obstacles: allObstacles(),
  simTime: 0,
  muted,
  menuPress: null,
});

/**
 * Starts a match in `mode`, as `SOLO`, `VERSUS`, `RESTART`, and `PLAY AGAIN`
 * all do. The paddles keep their driven flags and `drivenVy`, which only the
 * debug surface changes.
 */
export const startMatch = (
  state: DeepReadonly<CaromState>,
  mode: Mode,
): CaromState => ({
  ...state,
  mode,
  screen: "countdown",
  resumeScreen: "playing",
  menuIndex: 0,
  score: { p1: 0, p2: 0 },
  winner: null,
  receiver: "left",
  ball: parkedBall(),
  paddles: {
    left: { ...state.paddles.left, cy: FIELD_CY, vy: 0 },
    right: { ...state.paddles.right, cy: FIELD_CY, vy: 0 },
  },
  menuPress: null,
});

/**
 * Returns to the title: every declared field goes back to its title-screen
 * value except `titleIndex`, `simTime`, and `muted`, which keep theirs, and
 * `menuIndex`, which becomes `titleIndex`.
 */
export const returnToTitle = (state: DeepReadonly<CaromState>): CaromState => ({
  ...titleState(state.muted),
  titleIndex: state.titleIndex,
  menuIndex: state.titleIndex,
  simTime: state.simTime,
});
