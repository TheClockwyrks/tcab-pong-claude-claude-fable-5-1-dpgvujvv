import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BALL_R,
  FIELD_CX,
  FIELD_CY,
  HOLD_TIME,
  OBSTACLE_CENTERS,
} from "./constants";
import { createDebugApi, snapshot } from "./debug";
import type { CaromState } from "./game";
import { createHarness } from "./test-harness";
import type { Harness } from "./test-harness";
import { titleState } from "./state";

const debug = createDebugApi();
const base = (): CaromState => titleState(false);

describe("the world", () => {
  it("clears the field and spawns the pieces back", () => {
    const cleared = debug.clearWorld(base());
    expect(cleared.ball).toBeNull();
    expect(cleared.obstacles).toEqual([]);
    expect(snapshot(cleared).ball).toBeNull();
    expect(snapshot(cleared).obstacles).toEqual([]);
    expect(cleared.paddles).toEqual(base().paddles);

    const withB = debug.spawnObstacle(cleared, 1);
    expect(withB.obstacles).toEqual([
      { index: 1, cx: OBSTACLE_CENTERS[1]?.x, cy: OBSTACLE_CENTERS[1]?.y },
    ]);
    const withBoth = debug.spawnObstacle(withB, 0);
    expect(withBoth.obstacles.map((o) => o.index)).toEqual([0, 1]);
    const again = debug.spawnObstacle(withBoth, 0);
    expect(again.obstacles.map((o) => o.index)).toEqual([0, 1]);

    const flying = debug.setBallVelocity(
      debug.setBallPosition(debug.spawnBall(cleared), 100, 100),
      300,
      0,
    );
    const parked = debug.spawnBall(flying);
    expect(parked.ball).toMatchObject({
      x: FIELD_CX,
      y: FIELD_CY,
      vx: 0,
      vy: 0,
      spin: 0,
      held: true,
      holdTimer: HOLD_TIME,
      trail: [],
    });
  });

  it("refuses an obstacle index it has none for", () => {
    expect(() => debug.spawnObstacle(base(), 2)).toThrow(/index/);
    expect(() => debug.spawnObstacle(base(), -1)).toThrow();
    expect(() => debug.spawnObstacle(base(), 0.5)).toThrow();
  });

  it("resets to the title-screen state, leaving the mute bit alone", () => {
    const posed: CaromState = {
      ...debug.clearWorld(base()),
      screen: "playing",
      mode: "versus",
      menuIndex: 2,
      titleIndex: 1,
      resumeScreen: "countdown",
      score: { p1: 4, p2: 9 },
      winner: "right",
      receiver: "right",
      ai: { tracking: false, movement: false },
      paddles: {
        left: { cy: 100, vy: 5, driven: true, drivenVy: 40 },
        right: { cy: 600, vy: -5, driven: true, drivenVy: -40 },
      },
      simTime: 42,
      muted: true,
      menuPress: { pointerId: 1, index: 0 },
    };
    const reset = debug.reset(posed);
    const expected = { ...titleState(true) };
    expect(snapshot(reset)).toMatchObject({
      ...snapshot(expected),
      ball: expect.objectContaining({ x: FIELD_CX, held: true }) as unknown,
    });
    expect(reset.muted).toBe(true);
    expect(reset.simTime).toBe(0);
    expect(reset.titleIndex).toBe(0);
    expect(reset.menuPress).toBeNull();
    expect(reset.obstacles).toHaveLength(2);
  });

  it("reconciles to an equal state, however often", () => {
    const posed = debug.setBallVelocity(base(), 30, 40);
    const once = debug.reconcile(posed);
    expect(once).toEqual(posed);
    expect(once).not.toBe(posed);
    expect(debug.reconcile(once)).toEqual(once);
    expect(snapshot(once).ball?.speed).toBe(50);
  });
});

describe("screens, menus, and the match", () => {
  it("sets each field alone", () => {
    const s = base();
    expect(debug.setScreen(s, "paused").screen).toBe("paused");
    expect(debug.setScreen(s, "paused").ball).toEqual(s.ball);
    expect(debug.setMode(s, "versus").mode).toBe("versus");
    expect(debug.setMenuIndex(s, 2).menuIndex).toBe(2);
    expect(debug.setTitleIndex(s, 1).titleIndex).toBe(1);
    expect(debug.setResumeScreen(s, "countdown").resumeScreen).toBe(
      "countdown",
    );
    expect(debug.setScore(s, 7, 3).score).toEqual({ p1: 7, p2: 3 });
    expect(debug.setWinner(s, "right").winner).toBe("right");
    expect(debug.setWinner(debug.setWinner(s, "left"), null).winner).toBeNull();
    expect(debug.setReceiver(s, "right").receiver).toBe("right");
  });

  it("refuses values outside their vocabularies", () => {
    const s = base();
    expect(() => debug.setScreen(s, "lobby" as "title")).toThrow(/screen/);
    expect(() => debug.setMode(s, "coop" as "solo")).toThrow(/mode/);
    expect(() => debug.setMenuIndex(s, -1)).toThrow(/index/);
    expect(() => debug.setTitleIndex(s, 1.5)).toThrow(/index/);
    expect(() => debug.setResumeScreen(s, "title" as "playing")).toThrow();
    expect(() => debug.setScore(s, -1, 0)).toThrow(/p1/);
    expect(() => debug.setScore(s, 0, Number.NaN)).toThrow(/p2/);
    expect(() => debug.setWinner(s, "up" as "left")).toThrow(/side/);
    expect(() => debug.setReceiver(s, "up" as "left")).toThrow(/side/);
  });
});

describe("paddles", () => {
  it("poses each paddle's fields on their own", () => {
    const s = base();
    const moved = debug.setPaddleCy(s, "right", 123);
    expect(moved.paddles.right.cy).toBe(123);
    expect(moved.paddles.left).toEqual(s.paddles.left);

    const driven = debug.setPaddleVy(s, "left", -200);
    expect(driven.paddles.left.drivenVy).toBe(-200);
    expect(driven.paddles.left.vy).toBe(0);
    expect(driven.paddles.left.driven).toBe(false);

    const taken = debug.setPaddleDriven(s, "left", true);
    expect(taken.paddles.left.driven).toBe(true);
    expect(taken.paddles.right.driven).toBe(false);
  });

  it("refuses a side it has no paddle for and non-finite values", () => {
    const s = base();
    expect(() => debug.setPaddleCy(s, "middle" as "left", 1)).toThrow(/side/);
    expect(() =>
      debug.setPaddleCy(s, "left", Number.POSITIVE_INFINITY),
    ).toThrow(/cy/);
    expect(() => debug.setPaddleVy(s, "left", Number.NaN)).toThrow(/vy/);
    expect(() =>
      debug.setPaddleDriven(s, "left", "yes" as unknown as boolean),
    ).toThrow(/driven/);
  });
});

describe("the ball", () => {
  it("poses each field and reads it back through the snapshot", () => {
    let s = base();
    s = debug.setBallPosition(s, 10, 20);
    s = debug.setBallVelocity(s, 3, 4);
    s = debug.setBallSpin(s, 55);
    s = debug.setBallHeld(s, false);
    s = debug.setBallHoldTimer(s, 0.25);
    s = debug.setBallServeSign(s, -1);
    expect(snapshot(s).ball).toMatchObject({
      x: 10,
      y: 20,
      vx: 3,
      vy: 4,
      speed: 5,
      spin: 55,
      held: false,
      holdTimer: 0.25,
      serveSign: -1,
      trail: [],
    });
    expect(debug.setBallServeSign(s, 1).ball?.serveSign).toBe(1);
  });

  it("draws the serve sign afresh and changes nothing else", () => {
    const s = debug.setBallServeSign(base(), 1);
    const random = vi.spyOn(Math, "random");
    random.mockReturnValue(0.9);
    const drawn = debug.drawBallServeSign(s);
    expect(drawn.ball?.serveSign).toBe(-1);
    expect({ ...drawn.ball, serveSign: 1 }).toEqual(s.ball);
    random.mockReturnValue(0.1);
    expect(debug.drawBallServeSign(s).ball?.serveSign).toBe(1);
    random.mockRestore();
  });

  it("fails loudly while there is no ball", () => {
    const empty = debug.clearWorld(base());
    expect(() => debug.setBallPosition(empty, 1, 1)).toThrow(/no ball/);
    expect(() => debug.setBallVelocity(empty, 1, 1)).toThrow(/no ball/);
    expect(() => debug.setBallSpin(empty, 1)).toThrow(/no ball/);
    expect(() => debug.setBallHeld(empty, true)).toThrow(/no ball/);
    expect(() => debug.setBallHoldTimer(empty, 1)).toThrow(/no ball/);
    expect(() => debug.setBallServeSign(empty, 1)).toThrow(/no ball/);
    expect(() => debug.drawBallServeSign(empty)).toThrow(/no ball/);
  });

  it("refuses values it cannot pose", () => {
    const s = base();
    expect(() => debug.setBallPosition(s, Number.NaN, 0)).toThrow(/x/);
    expect(() => debug.setBallVelocity(s, 0, Number.NaN)).toThrow(/vy/);
    expect(() => debug.setBallSpin(s, Number.NEGATIVE_INFINITY)).toThrow(
      /spin/,
    );
    expect(() => debug.setBallHoldTimer(s, Number.NaN)).toThrow(/seconds/);
    expect(() => debug.setBallServeSign(s, 0 as 1)).toThrow(/sign/);
    expect(() => debug.setBallHeld(s, 1 as unknown as boolean)).toThrow(/held/);
  });
});

describe("the AI and audio flags", () => {
  it("gates each faculty on its own", () => {
    const s = base();
    expect(debug.setAiTracking(s, false).ai).toEqual({
      tracking: false,
      movement: true,
    });
    expect(debug.setAiMovement(s, false).ai).toEqual({
      tracking: true,
      movement: false,
    });
    expect(() => debug.setAiTracking(s, 0 as unknown as boolean)).toThrow();
  });

  it("sets the mute bit the snapshot reports", () => {
    expect(snapshot(debug.setMuted(base(), true)).muted).toBe(true);
    expect(() => debug.setMuted(base(), "on" as unknown as boolean)).toThrow();
  });
});

describe("readings", () => {
  it("reports a menu item's region only where the screen shows a menu", () => {
    const s = base();
    expect(debug.menuItemRect(s, 0)).toMatchObject({ w: expect.any(Number) });
    expect(debug.menuItemRect(s, 3)).toBeNull();
    expect(debug.menuItemRect(debug.setScreen(s, "playing"), 0)).toBeNull();
    expect(debug.menuItemRect(debug.setScreen(s, "countdown"), 0)).toBeNull();
    expect(debug.menuItemRect(debug.setScreen(s, "paused"), 2)).not.toBeNull();
    expect(debug.menuItemRect(debug.setScreen(s, "matchover"), 2)).toBeNull();
    expect(debug.menuItemRect(debug.setScreen(s, "howto"), 0)).not.toBeNull();
  });

  it("snapshots plain copies that do not alias the state", () => {
    const s = base();
    const snap = snapshot(s);
    expect(snap.version).toBe(1);
    expect(snap.paddles.left).not.toBe(s.paddles.left);
    expect(snap.obstacles).not.toBe(s.obstacles);
    expect(snap.ball?.trail).not.toBe(s.ball?.trail);
    expect(snap).not.toHaveProperty("menuPress");
  });
});

describe("over the engine", () => {
  let h: Harness;
  afterEach(() => h?.destroy());

  it("drives a paddle at drivenVy and reports vy from the integration", async () => {
    h = await createHarness();
    h.apply((s) => h.debug.setScreen(s, "playing"));
    h.apply((s) => h.debug.setPaddleVy(s, "left", 300));
    await h.advance(1);
    expect(h.snap().paddles.left.vy).toBe(0);
    expect(h.snap().paddles.left.cy).toBe(FIELD_CY);
    h.apply((s) => h.debug.setPaddleDriven(s, "left", true));
    await h.advance(1);
    expect(h.snap().paddles.left.vy).toBe(300);
    expect(h.snap().paddles.left.cy).toBeCloseTo(FIELD_CY + 300 / 60, 9);
    expect(h.snap().paddles.left.drivenVy).toBe(300);
    // Pinned against the bound the integrated velocity reads zero.
    h.apply((s) => h.debug.setPaddleVy(s, "left", -100000));
    await h.advance(2);
    expect(h.snap().paddles.left.vy).toBe(0);
    expect(h.snap().paddles.left.drivenVy).toBe(-100000);
    // Handing it back leaves the input in charge: it stands still.
    h.apply((s) => h.debug.setPaddleDriven(s, "left", false));
    h.apply((s) => h.debug.setPaddleVy(s, "left", 300));
    await h.advance(1);
    expect(h.snap().paddles.left.vy).toBe(0);
  });

  it("serves on the next frame once the hold timer is set to zero", async () => {
    h = await createHarness();
    h.apply((s) => h.debug.setScreen(s, "countdown"));
    h.apply((s) => h.debug.setReceiver(s, "right"));
    h.apply((s) => h.debug.setBallServeSign(s, -1));
    h.apply((s) => h.debug.setBallHoldTimer(s, 0));
    await h.advance(1);
    const ball = h.snap().ball;
    expect(h.snap().screen).toBe("playing");
    expect(ball?.held).toBe(false);
    expect(ball?.vx).toBeGreaterThan(0);
    expect(ball?.vy).toBeLessThan(0);
  });

  it("mutes the runtime through the state, so cues play silent", async () => {
    h = await createHarness();
    h.apply((s) => h.debug.setMuted(s, true));
    h.apply((s) => h.debug.setScreen(s, "playing"));
    h.apply((s) => h.debug.setBallPosition(s, 640, BALL_R + 1));
    h.apply((s) => h.debug.setBallVelocity(s, 0, -300));
    await h.advance(1);
    expect(h.cues).toEqual([{ cue: "wall-bounce", gain: 0 }]);
    expect(h.snap().muted).toBe(true);
    h.tap("KeyM");
    await h.advance(1);
    expect(h.snap().muted).toBe(false);
    h.apply((s) => h.debug.setMuted(s, false));
    await h.advance(1);
    expect(h.snap().muted).toBe(false);
  });

  it("leaves an absent ball out of the frame entirely", async () => {
    h = await createHarness();
    h.apply((s) => h.debug.setScreen(s, "playing"));
    h.apply((s) => h.debug.clearWorld(s));
    await h.advance(30);
    expect(h.snap().ball).toBeNull();
    expect(h.snap().score).toEqual({ p1: 0, p2: 0 });
    expect(h.snap().screen).toBe("playing");
    expect(h.cues).toEqual([]);
    h.apply((s) => h.debug.setScreen(s, "countdown"));
    await h.advance(90);
    expect(h.snap().screen).toBe("countdown");
  });
});
