// The ball: spin, sub-stepped advance, and every collision it resolves. The
// cues an advance raised come back beside the ball, once each, for the update
// to play.

import type { DeepReadonly } from "ts-essentials";
import {
  BALL_R,
  CUES,
  FIELD_H,
  MAX_BOUNCE_ANGLE,
  MAX_SUBSTEP,
  OBSTACLES,
  P1_X0,
  P1_X1,
  P2_X0,
  P2_X1,
  PADDLE_HALF,
  SPEED_CAP,
  SPEED_MULT,
  SPIN_CLAMP,
  SPIN_FROM_PADDLE,
  SPIN_HALFLIFE,
} from "./constants";
import type { CueName, Rect } from "./constants";
import type { BallState, ObstacleState, PaddleState } from "./game";
import { clamp } from "./state";

/** The ball's kinematic fields, which the collisions below rewrite. */
interface Body {
  x: number;
  y: number;
  vx: number;
  vy: number;
  spin: number;
}

/** Which face of a rectangle a ball struck. */
type Face = "left" | "right" | "top" | "bottom";

/** The ball's speed, `hypot(vx, vy)`. */
export const speedOf = (ball: { vx: number; vy: number }): number =>
  Math.hypot(ball.vx, ball.vy);

/** The rectangle a paddle on `side` occupies. */
export const paddleRect = (side: "left" | "right", cy: number): Rect => ({
  x0: side === "left" ? P1_X0 : P2_X0,
  x1: side === "left" ? P1_X1 : P2_X1,
  y0: cy - PADDLE_HALF,
  y1: cy + PADDLE_HALF,
});

/**
 * Circle against an axis-aligned rectangle. Returns the struck face after
 * placing the ball off it and reversing the normal velocity component if it
 * pointed into the face, or `null` when the ball's center was not strictly
 * inside the rectangle expanded by `BALL_R`.
 */
export const resolveRect = (b: Body, r: Rect): Face | null => {
  const left = b.x - (r.x0 - BALL_R);
  const right = r.x1 + BALL_R - b.x;
  const top = b.y - (r.y0 - BALL_R);
  const bottom = r.y1 + BALL_R - b.y;
  if (left <= 0 || right <= 0 || top <= 0 || bottom <= 0) return null;

  const least = Math.min(left, right, top, bottom);
  if (least === left) {
    b.x = r.x0 - BALL_R;
    if (b.vx > 0) b.vx = -b.vx;
    return "left";
  }
  if (least === right) {
    b.x = r.x1 + BALL_R;
    if (b.vx < 0) b.vx = -b.vx;
    return "right";
  }
  if (least === top) {
    b.y = r.y0 - BALL_R;
    if (b.vy > 0) b.vy = -b.vy;
    return "top";
  }
  b.y = r.y1 + BALL_R;
  if (b.vy < 0) b.vy = -b.vy;
  return "bottom";
};

/** The top and bottom walls. Returns whether the ball reflected. */
const resolveWalls = (b: Body): boolean => {
  if (b.y - BALL_R < 0 && b.vy < 0) {
    b.y = BALL_R;
    b.vy = -b.vy;
    return true;
  }
  if (b.y + BALL_R > FIELD_H && b.vy > 0) {
    b.y = FIELD_H - BALL_R;
    b.vy = -b.vy;
    return true;
  }
  return false;
};

/**
 * The paddle bounce: the outgoing angle from the contact point, the speed
 * multiplier up to the cap, spin from the paddle's motion, and placement off
 * the front face.
 */
const bounceOffPaddle = (
  b: Body,
  side: "left" | "right",
  paddle: PaddleState,
): void => {
  const offset = clamp((b.y - paddle.cy) / PADDLE_HALF, -1, 1);
  const theta = offset * MAX_BOUNCE_ANGLE;
  const speed = Math.min(speedOf(b) * SPEED_MULT, SPEED_CAP);
  const dir = side === "left" ? 1 : -1;
  b.vx = dir * speed * Math.cos(theta);
  b.vy = speed * Math.sin(theta);
  b.spin = clamp(
    b.spin + paddle.vy * SPIN_FROM_PADDLE,
    -SPIN_CLAMP,
    SPIN_CLAMP,
  );
  b.x = side === "left" ? P1_X1 + BALL_R : P2_X0 - BALL_R;
};

/** A paddle: a front or back face is a paddle hit, an end cap plays as a wall. */
const resolvePaddle = (
  b: Body,
  side: "left" | "right",
  paddle: PaddleState,
  cues: Set<CueName>,
): void => {
  const face = resolveRect(b, paddleRect(side, paddle.cy));
  if (face === null) return;
  if (face === "left" || face === "right") {
    bounceOffPaddle(b, side, paddle);
    cues.add(CUES.paddleHit);
  } else {
    cues.add(CUES.wallBounce);
  }
};

export interface BallStep {
  readonly ball: BallState;
  readonly cues: ReadonlySet<CueName>;
}

/**
 * Advances a ball in flight by `dt` seconds against the paddles as they stand
 * after this frame's integration and the obstacles present.
 */
export const stepBall = (
  ball: DeepReadonly<BallState>,
  paddles: { readonly left: PaddleState; readonly right: PaddleState },
  obstacles: readonly DeepReadonly<ObstacleState>[],
  dt: number,
): BallStep => {
  const b: Body = {
    x: ball.x,
    y: ball.y,
    vx: ball.vx,
    vy: ball.vy,
    spin: ball.spin,
  };
  const cues = new Set<CueName>();
  const rects = obstacles.map((o) => OBSTACLES[o.index]);
  const n = Math.max(1, Math.ceil((speedOf(b) * dt) / MAX_SUBSTEP));
  const h = dt / n;
  const decay = Math.pow(0.5, h / SPIN_HALFLIFE);

  for (let i = 0; i < n; i += 1) {
    const speed = speedOf(b);
    if (speed > 0) {
      const angle = (b.spin / speed) * h;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const vx = b.vx * cos - b.vy * sin;
      const vy = b.vx * sin + b.vy * cos;
      b.vx = vx;
      b.vy = vy;
    }
    b.spin *= decay;
    b.x += b.vx * h;
    b.y += b.vy * h;

    if (resolveWalls(b)) cues.add(CUES.wallBounce);
    resolvePaddle(b, "left", paddles.left, cues);
    resolvePaddle(b, "right", paddles.right, cues);
    for (const rect of rects) {
      if (rect !== undefined && resolveRect(b, rect) !== null) {
        cues.add(CUES.obstacleBounce);
      }
    }
  }

  return { ball: { ...ball, ...b }, cues };
};
