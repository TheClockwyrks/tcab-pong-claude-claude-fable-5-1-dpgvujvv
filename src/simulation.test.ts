import { afterEach, describe, expect, it } from "vitest";
import { ConstantClock } from "@clockwyrks/simple-2d";
import {
  AI_HOME_DEADZONE,
  AI_SPEED,
  BALL_R,
  CUES,
  FIELD_CY,
  FIELD_W,
  HOLD_TIME,
  PADDLE_MAX_CY,
  PADDLE_MIN_CY,
  PADDLE_SPEED,
  SERVE_ANGLE,
  SERVE_SPEED,
  TRAIL_TIME,
} from "./constants";
import { noInput } from "./input";
import { step, winnerOf } from "./simulation";
import { startMatch, titleState } from "./state";
import { createHarness } from "./test-harness";
import type { Harness } from "./test-harness";

let h: Harness;
afterEach(() => h?.destroy());

const DT = 1 / 60;

describe("the win rule", () => {
  it("awards the match at eleven with a two-point lead", () => {
    expect(winnerOf({ p1: 11, p2: 9 })).toBe("left");
    expect(winnerOf({ p1: 9, p2: 11 })).toBe("right");
    expect(winnerOf({ p1: 11, p2: 10 })).toBeNull();
    expect(winnerOf({ p1: 10, p2: 10 })).toBeNull();
    expect(winnerOf({ p1: 12, p2: 10 })).toBe("left");
    expect(winnerOf({ p1: 10, p2: 12 })).toBe("right");
    expect(winnerOf({ p1: 0, p2: 0 })).toBeNull();
  });
});

describe("paddles under input", () => {
  it("moves the solo paddle from either pair of keys at PADDLE_SPEED", async () => {
    h = await createHarness();
    h.tap("Enter");
    await h.advance(1);
    h.keyDown("KeyS");
    await h.advance(1);
    expect(h.snap().paddles.left.vy).toBe(PADDLE_SPEED);
    expect(h.snap().paddles.left.cy).toBeCloseTo(
      FIELD_CY + PADDLE_SPEED * DT,
      6,
    );
    h.keyUp("KeyS");
    h.keyDown("ArrowUp");
    await h.advance(1);
    expect(h.snap().paddles.left.vy).toBe(-PADDLE_SPEED);
    h.keyDown("ArrowDown");
    await h.advance(1);
    expect(h.snap().paddles.left.vy).toBe(0);
  });

  it("gives each versus player their own paddle", async () => {
    h = await createHarness();
    h.tap("KeyS");
    await h.advance(1);
    h.tap("Enter");
    await h.advance(1);
    expect(h.snap().mode).toBe("versus");
    h.keyDown("KeyW");
    h.keyDown("ArrowDown");
    await h.advance(1);
    expect(h.snap().paddles.left.vy).toBe(-PADDLE_SPEED);
    expect(h.snap().paddles.right.vy).toBe(PADDLE_SPEED);
  });

  it("clamps the paddle to the field and reports zero velocity at the bound", async () => {
    h = await createHarness();
    h.tap("Enter");
    await h.advance(1);
    h.keyDown("KeyW");
    await h.advance(60);
    expect(h.snap().paddles.left.cy).toBe(PADDLE_MIN_CY);
    expect(h.snap().paddles.left.vy).toBe(0);
    h.keyUp("KeyW");
    h.keyDown("KeyS");
    await h.advance(120);
    expect(h.snap().paddles.left.cy).toBe(PADDLE_MAX_CY);
    expect(h.snap().paddles.left.vy).toBe(0);
  });

  it("moves the paddles during the countdown but not while paused", async () => {
    h = await createHarness();
    h.tap("Enter");
    await h.advance(1);
    h.keyDown("KeyS");
    await h.advance(1);
    expect(h.snap().screen).toBe("countdown");
    expect(h.snap().paddles.left.cy).toBeGreaterThan(FIELD_CY);
    const before = h.snap();
    h.tap("KeyP");
    await h.advance(5);
    const after = h.snap();
    expect(after.screen).toBe("paused");
    expect(after.paddles.left.cy).toBe(before.paddles.left.cy);
    expect(after.ball?.holdTimer).toBe(before.ball?.holdTimer);
    expect(after.simTime).toBeCloseTo(before.simTime + 5 * DT, 9);
  });
});

describe("the AI", () => {
  const playing = async (): Promise<void> => {
    h = await createHarness();
    h.tap("Enter");
    await h.advance(1);
    h.apply((s) => h.debug.setScreen(s, "playing"));
  };

  it("tracks a ball coming toward it at up to AI_SPEED", async () => {
    await playing();
    h.apply((s) => h.debug.setBallPosition(s, 900, 650));
    h.apply((s) => h.debug.setBallVelocity(s, 300, 0));
    await h.advance(1);
    expect(h.snap().paddles.right.vy).toBe(AI_SPEED);
    await h.advance(30);
    expect(h.snap().paddles.right.cy).toBeGreaterThan(FIELD_CY + 100);
  });

  it("stops inside the deadzone rather than overshooting", async () => {
    await playing();
    h.apply((s) => h.debug.setBallPosition(s, 900, FIELD_CY + 6));
    h.apply((s) => h.debug.setBallVelocity(s, 300, 0));
    await h.advance(1);
    expect(h.snap().paddles.right.vy).toBe(0);
    expect(h.snap().paddles.right.cy).toBe(FIELD_CY);
  });

  it("returns home while the ball travels away, and without tracking", async () => {
    await playing();
    h.apply((s) => h.debug.setPaddleCy(s, "right", 600));
    h.apply((s) => h.debug.setBallPosition(s, 900, 650));
    h.apply((s) => h.debug.setBallVelocity(s, -300, 0));
    await h.advance(1);
    expect(h.snap().paddles.right.vy).toBe(-AI_SPEED);
    await h.advance(60);
    expect(Math.abs(h.snap().paddles.right.cy - FIELD_CY)).toBeLessThanOrEqual(
      AI_HOME_DEADZONE,
    );

    h.apply((s) => h.debug.setPaddleCy(s, "right", 600));
    h.apply((s) => h.debug.setBallVelocity(s, 300, 0));
    h.apply((s) => h.debug.setAiTracking(s, false));
    await h.advance(1);
    expect(h.snap().paddles.right.vy).toBe(-AI_SPEED);
  });

  it("stays put with movement off", async () => {
    await playing();
    h.apply((s) => h.debug.setAiMovement(s, false));
    h.apply((s) => h.debug.setPaddleCy(s, "right", 600));
    h.apply((s) => h.debug.setBallPosition(s, 900, 100));
    h.apply((s) => h.debug.setBallVelocity(s, 300, 0));
    await h.advance(10);
    expect(h.snap().paddles.right.vy).toBe(0);
    expect(h.snap().paddles.right.cy).toBe(600);
  });

  it("heads home during the countdown", async () => {
    h = await createHarness();
    h.tap("Enter");
    await h.advance(1);
    h.apply((s) => h.debug.setPaddleCy(s, "right", 200));
    await h.advance(1);
    expect(h.snap().paddles.right.vy).toBe(AI_SPEED);
  });

  it("covers the exact remaining distance in one frame when close", async () => {
    // A 100 ms frame: 12 units in 0.1 s is 120 units per second, under the cap.
    h = await createHarness(new ConstantClock(100));
    h.apply((s) => h.debug.setScreen(s, "playing"));
    h.apply((s) => h.debug.setBallPosition(s, 900, FIELD_CY + 12));
    h.apply((s) => h.debug.setBallVelocity(s, 300, 0));
    await h.advance(1);
    expect(h.snap().paddles.right.vy).toBeCloseTo(120, 6);
    expect(h.snap().paddles.right.cy).toBeCloseTo(FIELD_CY + 12, 6);
  });
});

describe("serving", () => {
  it("serves toward the receiver with the drawn sign", () => {
    const match = { ...startMatch(titleState(false), "versus") };
    const ball = match.ball;
    if (ball === null) throw new Error("no ball");
    const ready = {
      ...match,
      receiver: "right" as const,
      ball: { ...ball, holdTimer: 0.001, serveSign: -1 as const },
    };
    const served = step(ready, noInput(), DT).state;
    expect(served.screen).toBe("playing");
    expect(served.ball?.vx).toBeCloseTo(SERVE_SPEED * Math.cos(SERVE_ANGLE), 6);
    expect(served.ball?.vy).toBeCloseTo(
      -SERVE_SPEED * Math.sin(SERVE_ANGLE),
      6,
    );
    expect(served.ball?.held).toBe(false);
    expect(served.ball?.holdTimer).toBe(0);
    expect(served.ball?.serveSign).toBe(-1);
    expect(served.ball?.x).toBe(ball.x);
  });

  it("serves the first ball of a match toward the left", async () => {
    h = await createHarness();
    h.tap("Enter");
    await h.advance(61);
    expect(h.snap().screen).toBe("playing");
    expect(h.snap().ball?.vx).toBeLessThan(0);
    expect(h.snap().receiver).toBe("left");
  });

  it("samples the trail while the ball waits and clears it on the serve", async () => {
    h = await createHarness();
    h.tap("Enter");
    await h.advance(5);
    const waiting = h.snap().ball;
    expect(waiting?.trail.length).toBe(5);
    expect(waiting?.trail.every((s) => s.x === 640 && s.y === 360)).toBe(true);
    expect(waiting?.holdTimer).toBeCloseTo(HOLD_TIME - 5 * DT, 9);
    await h.advance(55);
    expect(h.snap().screen).toBe("playing");
    expect(h.snap().ball?.trail).toEqual([]);
  });
});

describe("the trail", () => {
  it("keeps the last TRAIL_TIME of samples, oldest first", async () => {
    h = await createHarness();
    h.apply((s) => h.debug.setScreen(s, "playing"));
    h.apply((s) => h.debug.setBallPosition(s, 200, 360));
    h.apply((s) => h.debug.setBallVelocity(s, 300, 0));
    await h.advance(30);
    const trail = h.snap().ball?.trail ?? [];
    const now = h.snap().simTime;
    expect(trail.length).toBe(Math.floor(TRAIL_TIME / DT) + 1);
    for (let i = 1; i < trail.length; i += 1) {
      expect(trail[i]?.t).toBeGreaterThan(trail[i - 1]?.t ?? Infinity);
      expect(trail[i]?.x).toBeGreaterThan(trail[i - 1]?.x ?? Infinity);
    }
    expect(trail[0]?.t).toBeGreaterThanOrEqual(now - TRAIL_TIME);
    expect(trail[trail.length - 1]).toEqual({
      x: h.snap().ball?.x,
      y: h.snap().ball?.y,
      t: now,
    });
  });
});

describe("scoring", () => {
  const live = async (): Promise<void> => {
    h = await createHarness();
    h.tap("Enter");
    await h.advance(1);
    h.apply((s) => h.debug.setScreen(s, "playing"));
    h.apply((s) => h.debug.setBallHeld(s, false));
  };

  it("scores for the left player past the right edge and parks the ball", async () => {
    await live();
    h.apply((s) => h.debug.setBallPosition(s, FIELD_W - BALL_R - 2, 100));
    h.apply((s) => h.debug.setBallVelocity(s, 600, 0));
    // Ten units a frame: the ball is wholly past the edge on the third.
    await h.advance(3);
    const s = h.snap();
    expect(s.score).toEqual({ p1: 1, p2: 0 });
    expect(s.screen).toBe("countdown");
    expect(s.receiver).toBe("right");
    expect(s.ball).toMatchObject({
      x: 640,
      y: 360,
      vx: 0,
      vy: 0,
      held: true,
      holdTimer: HOLD_TIME,
      trail: [],
    });
    expect(h.cueNames()).toEqual([CUES.score]);
  });

  it("scores for the right player past the left edge", async () => {
    await live();
    h.apply((s) => h.debug.setBallPosition(s, BALL_R + 2, 100));
    h.apply((s) => h.debug.setBallVelocity(s, -600, 0));
    await h.advance(3);
    expect(h.snap().score).toEqual({ p1: 0, p2: 1 });
    expect(h.snap().receiver).toBe("left");
  });

  it("ends the match at match point, leaving the ball where it is", async () => {
    await live();
    h.apply((s) => h.debug.setScore(s, 10, 6));
    h.apply((s) => h.debug.setMenuIndex(s, 1));
    h.apply((s) => h.debug.setBallPosition(s, FIELD_W - BALL_R - 2, 100));
    h.apply((s) => h.debug.setBallVelocity(s, 600, 0));
    // Ten units a frame: the ball is wholly past the edge on the third.
    await h.advance(3);
    const s = h.snap();
    expect(s.score).toEqual({ p1: 11, p2: 6 });
    expect(s.winner).toBe("left");
    expect(s.screen).toBe("matchover");
    expect(s.menuIndex).toBe(0);
    expect(s.ball?.x).toBeGreaterThan(FIELD_W);
    expect(s.ball?.held).toBe(false);
    await h.advance(10);
    expect(h.snap().ball?.x).toBe(s.ball?.x);
  });

  it("plays on at deuce until someone leads by two", async () => {
    await live();
    h.apply((s) => h.debug.setScore(s, 10, 10));
    h.apply((s) => h.debug.setBallPosition(s, BALL_R + 2, 100));
    h.apply((s) => h.debug.setBallVelocity(s, -600, 0));
    await h.advance(3);
    expect(h.snap().score).toEqual({ p1: 10, p2: 11 });
    expect(h.snap().screen).toBe("countdown");
    h.apply((s) => h.debug.setScreen(s, "playing"));
    h.apply((s) => h.debug.setBallPosition(s, BALL_R + 2, 100));
    h.apply((s) => h.debug.setBallVelocity(s, -600, 0));
    await h.advance(3);
    expect(h.snap().winner).toBe("right");
    expect(h.snap().screen).toBe("matchover");
  });
});

describe("cues", () => {
  it("plays each cue once per frame however many sub-steps raised it", async () => {
    h = await createHarness(new ConstantClock(100));
    h.apply((s) => h.debug.setScreen(s, "playing"));
    h.apply((s) => h.debug.setBallPosition(s, 640, BALL_R + 1));
    h.apply((s) => h.debug.setBallVelocity(s, 0, -900));
    await h.advance(1);
    expect(h.cueNames()).toEqual([CUES.wallBounce]);
  });

  it("names the paddle, wall, and obstacle cues after their events", async () => {
    h = await createHarness();
    h.apply((s) => h.debug.setScreen(s, "playing"));
    h.apply((s) => h.debug.setBallPosition(s, 80, 360));
    h.apply((s) => h.debug.setBallVelocity(s, -400, 0));
    await h.advance(1);
    expect(h.cueNames()).toEqual([CUES.paddleHit]);
    h.apply((s) => h.debug.setBallPosition(s, 470, 220));
    h.apply((s) => h.debug.setBallVelocity(s, 300, 0));
    await h.advance(1);
    expect(h.cueNames()).toEqual([CUES.paddleHit, CUES.obstacleBounce]);
  });
});

describe("frame-rate independence", () => {
  const drive = async (stepMs: number, seconds: number): Promise<Harness> => {
    const hz = await createHarness(new ConstantClock(stepMs));
    hz.tap("Enter");
    await hz.advance(1);
    hz.apply((s) => hz.debug.setBallServeSign(s, 1));
    hz.apply((s) => hz.debug.setBallHoldTimer(s, 0));
    hz.apply((s) => hz.debug.setPaddleDriven(s, "left", true));
    hz.apply((s) => hz.debug.setPaddleVy(s, "left", 0));
    await hz.advance(Math.round((seconds * 1000) / stepMs));
    return hz;
  };

  it("plays the same rally under 2 ms and 16 ms frames", async () => {
    const fine = await drive(2, 2.5);
    const coarse = await drive(16, 2.5);
    try {
      const a = fine.snap();
      const b = coarse.snap();
      expect(fine.cueNames()).toEqual(coarse.cueNames());
      expect(a.score).toEqual(b.score);
      expect(a.screen).toBe(b.screen);
      if (a.ball !== null && b.ball !== null) {
        expect(Math.abs(a.ball.speed - b.ball.speed)).toBeLessThan(10);
        expect(Math.sign(a.ball.vx)).toBe(Math.sign(b.ball.vx));
      }
    } finally {
      fine.destroy();
      coarse.destroy();
    }
  });
});
