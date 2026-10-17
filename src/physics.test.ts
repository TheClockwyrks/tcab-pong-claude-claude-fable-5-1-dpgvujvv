import { describe, expect, it } from "vitest";
import {
  BALL_R,
  CUES,
  FIELD_H,
  MAX_BOUNCE_ANGLE,
  OBSTACLE_CENTERS,
  OBSTACLE_HW,
  P1_X0,
  P1_X1,
  P2_X0,
  PADDLE_HALF,
  SPEED_CAP,
  SPEED_MULT,
  SPIN_CLAMP,
  SPIN_FROM_PADDLE,
  SPIN_HALFLIFE,
} from "./constants";
import type { BallState, PaddleState } from "./game";
import { paddleRect, resolveRect, speedOf, stepBall } from "./physics";
import { allObstacles, restingPaddle } from "./state";

const ball = (over: Partial<BallState>): BallState => ({
  x: 640,
  y: 360,
  vx: 0,
  vy: 0,
  spin: 0,
  held: false,
  holdTimer: 0,
  serveSign: 1,
  trail: [],
  ...over,
});

const paddles = (
  left: Partial<PaddleState> = {},
  right: Partial<PaddleState> = {},
): { left: PaddleState; right: PaddleState } => ({
  left: { ...restingPaddle(), ...left },
  right: { ...restingPaddle(), ...right },
});

const DT = 1 / 60;

describe("walls", () => {
  it("reflects off the top wall, keeping speed and spin", () => {
    const b = ball({ y: BALL_R + 0.5, vx: 200, vy: -300, spin: 150 });
    const { ball: next, cues } = stepBall(b, paddles(), allObstacles(), DT);
    expect(next.vy).toBeGreaterThan(0);
    expect(next.y).toBeGreaterThanOrEqual(BALL_R);
    expect(speedOf(next)).toBeCloseTo(speedOf(b), 6);
    expect(next.spin).toBeCloseTo(150 * Math.pow(0.5, DT / SPIN_HALFLIFE), 9);
    expect([...cues]).toEqual([CUES.wallBounce]);
  });

  it("reflects off the bottom wall", () => {
    const b = ball({ y: FIELD_H - BALL_R - 0.5, vy: 300 });
    const { ball: next, cues } = stepBall(b, paddles(), allObstacles(), DT);
    expect(next.vy).toBeLessThan(0);
    expect(next.y).toBeLessThanOrEqual(FIELD_H - BALL_R);
    expect(cues.has(CUES.wallBounce)).toBe(true);
  });
});

describe("circle against a rectangle", () => {
  const rect = { x0: 100, y0: 100, x1: 120, y1: 240 };

  it("ignores a ball outside the expanded rectangle", () => {
    const b = { x: 100 - BALL_R, y: 170, vx: 50, vy: 0, spin: 0 };
    expect(resolveRect(b, rect)).toBeNull();
    expect(b.x).toBe(100 - BALL_R);
  });

  it("places the ball off the nearest face and reverses an inbound velocity", () => {
    const b = { x: 100 - BALL_R + 2, y: 170, vx: 50, vy: 0, spin: 0 };
    expect(resolveRect(b, rect)).toBe("left");
    expect(b.x).toBe(100 - BALL_R);
    expect(b.vx).toBe(-50);
  });

  it("leaves an outbound velocity alone", () => {
    const b = { x: 120 + BALL_R - 2, y: 170, vx: 50, vy: 0, spin: 0 };
    expect(resolveRect(b, rect)).toBe("right");
    expect(b.x).toBe(120 + BALL_R);
    expect(b.vx).toBe(50);
  });

  it("resolves the top and bottom faces", () => {
    const top = { x: 110, y: 100 - BALL_R + 1, vx: 0, vy: 30, spin: 0 };
    expect(resolveRect(top, rect)).toBe("top");
    expect(top.y).toBe(100 - BALL_R);
    expect(top.vy).toBe(-30);
    const bottom = { x: 110, y: 240 + BALL_R - 1, vx: 0, vy: -30, spin: 0 };
    expect(resolveRect(bottom, rect)).toBe("bottom");
    expect(bottom.y).toBe(240 + BALL_R);
    expect(bottom.vy).toBe(30);
  });

  it("breaks a tie in the order left, right, top, bottom", () => {
    // Equidistant from the left and top faces of a square rectangle.
    const square = { x0: 0, y0: 0, x1: 40, y1: 40 };
    const b = { x: 0 - BALL_R + 5, y: 0 - BALL_R + 5, vx: 1, vy: 1, spin: 0 };
    expect(resolveRect(b, square)).toBe("left");
  });
});

describe("the paddle bounce", () => {
  it("sends a center hit straight back, faster, with the paddle-hit cue", () => {
    const b = ball({ x: P1_X1 + BALL_R + 1, y: 360, vx: -520, vy: 0 });
    const { ball: next, cues } = stepBall(b, paddles(), allObstacles(), DT);
    expect(next.vx).toBeCloseTo(520 * SPEED_MULT, 6);
    expect(next.vy).toBeCloseTo(0, 6);
    expect(next.x).toBeGreaterThanOrEqual(P1_X1 + BALL_R);
    expect(next.spin).toBe(0);
    expect([...cues]).toEqual([CUES.paddleHit]);
  });

  it("angles the bounce by the contact offset, up to the maximum", () => {
    const top = ball({ x: P1_X1 + BALL_R + 1, y: 360 - PADDLE_HALF, vx: -400 });
    const up = stepBall(top, paddles(), allObstacles(), DT).ball;
    expect(Math.atan2(up.vy, up.vx)).toBeCloseTo(-MAX_BOUNCE_ANGLE, 6);

    const bottom = ball({
      x: P1_X1 + BALL_R + 1,
      y: 360 + PADDLE_HALF,
      vx: -400,
    });
    const down = stepBall(bottom, paddles(), allObstacles(), DT).ball;
    expect(Math.atan2(down.vy, down.vx)).toBeCloseTo(MAX_BOUNCE_ANGLE, 6);
  });

  it("travels toward the opponent off the right paddle", () => {
    const b = ball({ x: P2_X0 - BALL_R - 1, y: 360, vx: 520 });
    const next = stepBall(b, paddles(), allObstacles(), DT).ball;
    expect(next.vx).toBeLessThan(0);
    expect(next.x).toBeLessThanOrEqual(P2_X0 - BALL_R);
  });

  it("adds spin from the paddle's integrated velocity, clamped", () => {
    const b = ball({ x: P1_X1 + BALL_R + 1, y: 360, vx: -520 });
    const moving = stepBall(b, paddles({ vy: 400 }), [], DT).ball;
    // The hit lands in the first of three sub-steps; the spin then decays
    // over the two that follow.
    expect(moving.spin).toBeCloseTo(
      400 * SPIN_FROM_PADDLE * Math.pow(0.5, (2 * DT) / 3 / SPIN_HALFLIFE),
      6,
    );
    const upward = stepBall(b, paddles({ vy: -400 }), [], DT).ball;
    expect(upward.spin).toBeLessThan(0);
    const spun = ball({ ...b, spin: 800 });
    const clamped = stepBall(spun, paddles({ vy: 1000 }), [], DT).ball;
    expect(clamped.spin).toBeLessThanOrEqual(SPIN_CLAMP);
    expect(clamped.spin).toBeGreaterThan(SPIN_CLAMP * 0.98);
  });

  it("caps the speed at SPEED_CAP", () => {
    const b = ball({ x: P1_X1 + BALL_R + 1, y: 360, vx: -(SPEED_CAP - 1) });
    const next = stepBall(b, paddles(), [], DT).ball;
    expect(speedOf(next)).toBeCloseTo(SPEED_CAP, 6);
  });

  it("treats an end cap like a wall", () => {
    const b = ball({
      x: (P1_X0 + P1_X1) / 2,
      y: 360 - PADDLE_HALF - BALL_R + 1,
      vx: 0,
      vy: 120,
      spin: 40,
    });
    const { ball: next, cues } = stepBall(b, paddles(), [], DT);
    expect(next.vy).toBeLessThan(0);
    expect(speedOf(next)).toBeCloseTo(120, 6);
    expect([...cues]).toEqual([CUES.wallBounce]);
  });

  it("keeps the ball out of the paddle at the speed cap", () => {
    const b = ball({ x: P1_X1 + BALL_R + 2, y: 360, vx: -SPEED_CAP });
    const next = stepBall(b, paddles(), [], 0.1).ball;
    expect(next.x).toBeGreaterThanOrEqual(P1_X1 + BALL_R);
    expect(next.vx).toBeGreaterThan(0);
  });

  it("describes each paddle's rectangle", () => {
    expect(paddleRect("left", 300)).toEqual({
      x0: P1_X0,
      x1: P1_X1,
      y0: 300 - PADDLE_HALF,
      y1: 300 + PADDLE_HALF,
    });
    expect(paddleRect("right", 300).x0).toBe(P2_X0);
  });
});

describe("obstacles", () => {
  const a = OBSTACLE_CENTERS[0] ?? { x: 0, y: 0 };

  it("bounces the ball with speed and spin unchanged", () => {
    const b = ball({
      x: a.x - OBSTACLE_HW - BALL_R - 1,
      y: a.y,
      vx: 300,
      vy: 0,
      spin: 200,
    });
    const { ball: next, cues } = stepBall(b, paddles(), allObstacles(), DT);
    expect(next.vx).toBeLessThan(0);
    expect(speedOf(next)).toBeCloseTo(300, 6);
    expect(next.spin).toBeCloseTo(200 * Math.pow(0.5, DT / SPIN_HALFLIFE), 9);
    expect([...cues]).toEqual([CUES.obstacleBounce]);
  });

  it("has no collision while absent", () => {
    const b = ball({ x: a.x - OBSTACLE_HW - BALL_R - 1, y: a.y, vx: 300 });
    const next = stepBall(b, paddles(), [], DT).ball;
    expect(next.vx).toBe(300);
    expect(next.x).toBeGreaterThan(b.x);
  });

  it("resolves only the obstacles present", () => {
    const second = allObstacles().filter((o) => o.index === 1);
    const b = ball({ x: a.x - OBSTACLE_HW - BALL_R - 1, y: a.y, vx: 300 });
    expect(stepBall(b, paddles(), second, DT).ball.vx).toBe(300);
  });
});

describe("spin", () => {
  it("curves the flight clockwise for positive spin without changing speed", () => {
    const b = ball({ x: 300, y: 360, vx: 500, vy: 0, spin: SPIN_CLAMP });
    const next = stepBall(b, paddles(), [], 0.1).ball;
    expect(next.vy).toBeGreaterThan(0);
    expect(speedOf(next)).toBeCloseTo(500, 6);
    expect(next.spin).toBeCloseTo(
      SPIN_CLAMP * Math.pow(0.5, 0.1 / SPIN_HALFLIFE),
      6,
    );
  });

  it("curves counter-clockwise for negative spin", () => {
    const b = ball({ x: 300, y: 360, vx: 500, vy: 0, spin: -SPIN_CLAMP });
    expect(stepBall(b, paddles(), [], 0.1).ball.vy).toBeLessThan(0);
  });

  it("leaves a motionless ball motionless", () => {
    const b = ball({ spin: 500 });
    const next = stepBall(b, paddles(), [], 0.1).ball;
    expect(next.vx).toBe(0);
    expect(next.vy).toBe(0);
    expect(next.x).toBe(640);
    expect(Number.isFinite(next.spin)).toBe(true);
  });

  it("reaches the same curve under different step sizes", () => {
    const start = ball({ x: 300, y: 300, vx: 600, vy: 50, spin: 700 });
    let fine = start;
    for (let i = 0; i < 100; i += 1) {
      fine = stepBall(fine, paddles(), [], 0.002).ball;
    }
    const coarse = stepBall(start, paddles(), [], 0.2).ball;
    expect(coarse.x).toBeCloseTo(fine.x, 0);
    expect(coarse.y).toBeCloseTo(fine.y, 0);
    expect(speedOf(coarse)).toBeCloseTo(speedOf(fine), 3);
  });
});
