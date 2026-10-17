// The debug and automation surface `specs/instrumentation.md` fixes. Every
// pose builds the next state from the one it is handed; every reading returns
// what it read. A call with nothing to act on fails loudly rather than
// returning the state unchanged.

import type { DeepReadonly } from "ts-essentials";
import { CAROM_DEBUG_VERSION } from "./constants";
import type {
  BallState,
  CaromDebugApi,
  CaromSnapshot,
  CaromState,
  MenuRect,
  Mode,
  Screen,
  Side,
} from "./game";
import { menuItemRect } from "./menus";
import { speedOf } from "./physics";
import { drawServeSign, obstacleAt, parkedBall, titleState } from "./state";

type S = DeepReadonly<CaromState>;

const SCREENS: readonly Screen[] = [
  "title",
  "howto",
  "countdown",
  "playing",
  "paused",
  "matchover",
];

const fail = (message: string): never => {
  throw new Error(`Carom debug: ${message}`);
};

const finite = (name: string, value: number): number =>
  typeof value === "number" && Number.isFinite(value)
    ? value
    : fail(`${name} must be a finite number, got ${String(value)}`);

const index = (name: string, value: number): number =>
  Number.isInteger(value) && value >= 0
    ? value
    : fail(`${name} must be a non-negative integer, got ${String(value)}`);

const flag = (name: string, value: boolean): boolean =>
  typeof value === "boolean"
    ? value
    : fail(`${name} must be a boolean, got ${String(value)}`);

const oneOf = <T extends string>(
  name: string,
  value: T,
  allowed: readonly T[],
): T =>
  allowed.includes(value)
    ? value
    : fail(
        `${name} must be one of ${allowed.join(", ")}, got ${String(value)}`,
      );

const side = (value: Side): Side => oneOf("side", value, ["left", "right"]);

/** The ball, or a loud failure while the field carries none. */
const requireBall = (state: S): DeepReadonly<BallState> =>
  state.ball ?? fail("there is no ball on the field to set");

const withBall = (
  state: S,
  change: (ball: DeepReadonly<BallState>) => Partial<BallState>,
): CaromState => {
  const ball = requireBall(state);
  return { ...state, ball: { ...ball, ...change(ball) } };
};

const withPaddle = (
  state: S,
  which: Side,
  change: Partial<CaromState["paddles"]["left"]>,
): CaromState => ({
  ...state,
  paddles: {
    ...state.paddles,
    [side(which)]: { ...state.paddles[which], ...change },
  },
});

/** The whole declared state, as plain copies. */
export const snapshot = (state: S): CaromSnapshot => ({
  version: CAROM_DEBUG_VERSION,
  screen: state.screen,
  mode: state.mode,
  menuIndex: state.menuIndex,
  titleIndex: state.titleIndex,
  resumeScreen: state.resumeScreen,
  score: { p1: state.score.p1, p2: state.score.p2 },
  winner: state.winner,
  muted: state.muted,
  paddles: {
    left: { ...state.paddles.left },
    right: { ...state.paddles.right },
  },
  ai: { ...state.ai },
  receiver: state.receiver,
  ball:
    state.ball === null
      ? null
      : {
          x: state.ball.x,
          y: state.ball.y,
          vx: state.ball.vx,
          vy: state.ball.vy,
          speed: speedOf(state.ball),
          spin: state.ball.spin,
          held: state.ball.held,
          holdTimer: state.ball.holdTimer,
          serveSign: state.ball.serveSign,
          trail: state.ball.trail.map((s) => ({ ...s })),
        },
  obstacles: state.obstacles.map((o) => ({ ...o })),
  simTime: state.simTime,
});

/** Builds the surface. It holds nothing: every operation works off its state. */
export const createDebugApi = (): CaromDebugApi => ({
  version: CAROM_DEBUG_VERSION,

  clearWorld: (s) => ({ ...s, ball: null, obstacles: [] }),
  spawnBall: (s) => ({ ...s, ball: parkedBall() }),
  spawnObstacle: (s, i) => {
    const obstacle = obstacleAt(index("index", i));
    const others = s.obstacles.filter((o) => o.index !== obstacle.index);
    return {
      ...s,
      obstacles: [...others, obstacle].sort((a, b) => a.index - b.index),
    };
  },
  reset: (s) => titleState(s.muted),
  // Every reading is worked out at the read, so there is nothing to bring back
  // into agreement: the state comes back as it stands.
  reconcile: (s) => ({ ...s }),

  setScreen: (s, screen) => ({
    ...s,
    screen: oneOf("screen", screen, SCREENS),
  }),
  setMode: (s, mode) => ({
    ...s,
    mode: oneOf<Mode>("mode", mode, ["solo", "versus"]),
  }),
  setMenuIndex: (s, i) => ({ ...s, menuIndex: index("index", i) }),
  setTitleIndex: (s, i) => ({ ...s, titleIndex: index("index", i) }),
  setResumeScreen: (s, screen) => ({
    ...s,
    resumeScreen: oneOf("screen", screen, ["countdown", "playing"]),
  }),

  setScore: (s, p1, p2) => ({
    ...s,
    score: { p1: index("p1", p1), p2: index("p2", p2) },
  }),
  setWinner: (s, w) => ({ ...s, winner: w === null ? null : side(w) }),
  setReceiver: (s, r) => ({ ...s, receiver: side(r) }),

  setPaddleCy: (s, which, cy) => withPaddle(s, which, { cy: finite("cy", cy) }),
  setPaddleVy: (s, which, vy) =>
    withPaddle(s, which, { drivenVy: finite("vy", vy) }),
  setPaddleDriven: (s, which, driven) =>
    withPaddle(s, which, { driven: flag("driven", driven) }),

  setBallPosition: (s, x, y) =>
    withBall(s, () => ({ x: finite("x", x), y: finite("y", y) })),
  setBallVelocity: (s, vx, vy) =>
    withBall(s, () => ({ vx: finite("vx", vx), vy: finite("vy", vy) })),
  setBallSpin: (s, spin) => withBall(s, () => ({ spin: finite("spin", spin) })),
  setBallHeld: (s, held) => withBall(s, () => ({ held: flag("held", held) })),
  setBallHoldTimer: (s, seconds) =>
    withBall(s, () => ({ holdTimer: finite("seconds", seconds) })),
  setBallServeSign: (s, sign) =>
    withBall(s, () => ({
      serveSign:
        sign === 1 || sign === -1
          ? sign
          : fail(`sign must be 1 or -1, got ${String(sign)}`),
    })),
  drawBallServeSign: (s) => withBall(s, () => ({ serveSign: drawServeSign() })),

  setAiTracking: (s, enabled) => ({
    ...s,
    ai: { ...s.ai, tracking: flag("enabled", enabled) },
  }),
  setAiMovement: (s, enabled) => ({
    ...s,
    ai: { ...s.ai, movement: flag("enabled", enabled) },
  }),

  // The runtime's bit follows the state on the next update, which is the one
  // place the game can reach it; `muted` reports what was set from here on.
  setMuted: (s, muted) => ({ ...s, muted: flag("muted", muted) }),

  snapshot,
  menuItemRect: (s, i): MenuRect | null => menuItemRect(s.screen, i),
});
