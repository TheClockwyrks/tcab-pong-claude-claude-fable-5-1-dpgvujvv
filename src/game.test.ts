import { afterEach, describe, expect, it } from "vitest";
import {
  ACTIONS,
  FIELD_CX,
  FIELD_CY,
  HOLD_TIME,
  OBSTACLE_CENTERS,
  SERVE_SPEED,
} from "./constants";
import { BACKGROUND } from "./game";
import { createHarness, layoutActions } from "./test-harness";
import type { Harness } from "./test-harness";

let h: Harness;

afterEach(() => h?.destroy());

describe("the game over the engine", () => {
  it("opens on the title screen with the declared title-screen values", async () => {
    h = await createHarness();
    const s = h.snap();
    expect(s.version).toBe(1);
    expect(s.screen).toBe("title");
    expect(s.mode).toBe("solo");
    expect(s.menuIndex).toBe(0);
    expect(s.titleIndex).toBe(0);
    expect(s.resumeScreen).toBe("playing");
    expect(s.score).toEqual({ p1: 0, p2: 0 });
    expect(s.winner).toBeNull();
    expect(s.receiver).toBe("left");
    expect(s.paddles.left).toEqual({
      cy: FIELD_CY,
      vy: 0,
      driven: false,
      drivenVy: 0,
    });
    expect(s.paddles.right).toEqual({
      cy: FIELD_CY,
      vy: 0,
      driven: false,
      drivenVy: 0,
    });
    expect(s.ai).toEqual({ tracking: true, movement: true });
    expect(s.ball).toMatchObject({
      x: FIELD_CX,
      y: FIELD_CY,
      vx: 0,
      vy: 0,
      speed: 0,
      spin: 0,
      held: true,
      holdTimer: HOLD_TIME,
      trail: [],
    });
    expect([1, -1]).toContain(s.ball?.serveSign);
    expect(s.obstacles).toEqual(
      OBSTACLE_CENTERS.map((c, index) => ({ index, cx: c.x, cy: c.y })),
    );
    expect(s.simTime).toBe(0);
    expect(s.muted).toBe(false);
  });

  it("registers exactly the layout's actions and exports a background color", async () => {
    h = await createHarness();
    expect([...ACTIONS]).toEqual([...layoutActions()]);
    expect(BACKGROUND).toMatch(/^#[0-9a-f]{3,8}$/i);
  });

  it("accumulates simTime on every screen and renders every frame", async () => {
    h = await createHarness();
    await h.advance(6);
    expect(h.snap().simTime).toBeCloseTo(0.1, 6);
    expect(h.snap().screen).toBe("title");
    expect(h.engine.frame().count).toBe(6);
  });

  it("starts a solo match from the title and serves after the hold", async () => {
    h = await createHarness();
    h.tap("Enter");
    await h.advance(1);
    expect(h.snap().screen).toBe("countdown");
    expect(h.snap().mode).toBe("solo");
    // 60 frames of 1/60 s elapse the one-second hold on the 60th frame.
    await h.advance(58);
    expect(h.snap().screen).toBe("countdown");
    await h.advance(1);
    const s = h.snap();
    expect(s.screen).toBe("playing");
    expect(s.ball?.held).toBe(false);
    expect(s.ball?.holdTimer).toBe(0);
    expect(s.ball?.speed).toBeCloseTo(SERVE_SPEED, 6);
    expect(s.ball?.vx).toBeLessThan(0);
    expect(s.ball?.trail).toEqual([]);
    await h.advance(1);
    expect(h.snap().ball?.trail.length).toBe(1);
  });

  it("reports diagnostics for the facts the snapshot carries", async () => {
    h = await createHarness();
    const names = h.engine.diagnostics().map((d) => d.name);
    for (const name of [
      "screen",
      "mode",
      "score",
      "ball.pos",
      "ball.vel",
      "ball.speed",
      "ball.spin",
      "paddle.left",
      "paddle.right",
    ]) {
      expect(names).toContain(name);
    }
    for (const reading of h.engine.diagnostics()) {
      expect(reading.error).toBeUndefined();
    }
    h.apply((s) => h.debug.clearWorld(s));
    const ball = h.engine.diagnostics().find((d) => d.name === "ball.pos");
    expect(ball?.value).toBe("none");
  });
});
