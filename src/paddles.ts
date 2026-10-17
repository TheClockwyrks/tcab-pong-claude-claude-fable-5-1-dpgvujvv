// Paddle movement: the one integration every mover shares, the human rule, the
// AI rule, and the debug driver.

import type { DeepReadonly } from "ts-essentials";
import {
  AI_DEADZONE,
  AI_HOME_DEADZONE,
  AI_HOME_Y,
  AI_REACT,
  AI_SPEED,
  PADDLE_MAX_CY,
  PADDLE_MIN_CY,
  PADDLE_SPEED,
} from "./constants";
import type { AiState, BallState, PaddleState, Screen } from "./game";
import { clamp } from "./state";

/**
 * Moves a paddle at `vy` for `dt` seconds. The center is clamped to the field,
 * and where the clamp bit the velocity becomes the distance actually covered,
 * so a paddle pinned against a bound carries `vy = 0`.
 */
export const integratePaddle = (
  paddle: PaddleState,
  vy: number,
  dt: number,
): PaddleState => {
  const next = clamp(paddle.cy + vy * dt, PADDLE_MIN_CY, PADDLE_MAX_CY);
  const actualVy =
    next !== paddle.cy + vy * dt && dt > 0 ? (next - paddle.cy) / dt : vy;
  return { ...paddle, cy: next, vy: actualVy };
};

/** The velocity a human paddle takes from its two held movement values. */
export const humanVy = (up: number, down: number): number =>
  (down - up) * PADDLE_SPEED;

/**
 * The AI's velocity for the frame, from `specs/modes/single-player.md`. With
 * tracking off the target is home; with movement off the paddle stays put.
 */
export const aiVy = (
  paddle: PaddleState,
  ai: DeepReadonly<AiState>,
  ball: DeepReadonly<BallState> | null,
  screen: Screen,
  dt: number,
): number => {
  if (!ai.movement) return 0;
  let target = AI_HOME_Y;
  let deadzone = AI_HOME_DEADZONE;
  if (ai.tracking && screen === "playing" && ball !== null && ball.vx > 0) {
    target = ball.y - ball.vy * AI_REACT;
    deadzone = AI_DEADZONE;
  }
  const diff = target - paddle.cy;
  if (Math.abs(diff) <= deadzone) return 0;
  return Math.sign(diff) * Math.min(AI_SPEED, Math.abs(diff) / dt);
};
