import { afterEach, describe, expect, it } from "vitest";
import { createCanvas } from "@napi-rs/canvas";
import {
  FIELD_CX,
  FIELD_CY,
  FIELD_H,
  FIELD_W,
  P1_X0,
  P2_X0,
} from "./constants";
import type { CaromState, Screen } from "./game";
import { PALETTE, render } from "./render";
import { startMatch, titleState } from "./state";
import { createHarness } from "./test-harness";
import type { Harness } from "./test-harness";

let h: Harness;
afterEach(() => h?.destroy());

const brightness = (p: readonly [number, number, number, number]): number =>
  (p[0] ?? 0) + (p[1] ?? 0) + (p[2] ?? 0);

describe("rendering over the engine", () => {
  it("draws the furniture in bright colors over the dark field while playing", async () => {
    h = await createHarness();
    h.tap("Enter");
    await h.advance(1);
    const background = h.pixel(200, 100);
    expect(brightness(background)).toBeLessThan(120);
    const left = h.pixel(P1_X0 + 8, FIELD_CY);
    const right = h.pixel(P2_X0 + 8, FIELD_CY);
    const ball = h.pixel(FIELD_CX, FIELD_CY);
    const obstacle = h.pixel(490, 220);
    for (const body of [left, right, ball, obstacle]) {
      expect(brightness(body)).toBeGreaterThan(400);
    }
    // The paddles are told apart by color, and the obstacles from both.
    expect(left).not.toEqual(right);
    expect(obstacle).not.toEqual(left);
    expect(obstacle).not.toEqual(right);
  });

  it("dims the furniture behind the title menu", async () => {
    h = await createHarness();
    await h.advance(1);
    expect(brightness(h.pixel(P1_X0 + 8, FIELD_CY))).toBeLessThan(400);
    expect(brightness(h.pixel(P1_X0 + 8, FIELD_CY))).toBeGreaterThan(60);
  });

  it("draws a trail behind a moving ball", async () => {
    h = await createHarness();
    h.apply((s) => h.debug.setScreen(s, "playing"));
    h.apply((s) => h.debug.setBallPosition(s, 300, 600));
    h.apply((s) => h.debug.setBallVelocity(s, 700, 0));
    await h.advance(8);
    const ball = h.snap().ball;
    if (ball === null) throw new Error("no ball");
    const behind = h.pixel(Math.round(ball.x - 40), 600);
    const ahead = h.pixel(Math.round(ball.x + 40), 600);
    expect(brightness(behind)).toBeGreaterThan(brightness(ahead) + 30);
  });
});

describe("every screen renders", () => {
  const canvas = createCanvas(FIELD_W, FIELD_H);
  const ctx = canvas.getContext("2d") as unknown as CanvasRenderingContext2D;
  const screens: Screen[] = [
    "title",
    "howto",
    "countdown",
    "playing",
    "paused",
    "matchover",
  ];

  it.each(screens)("draws the %s screen without throwing", (screen) => {
    const base = startMatch(titleState(true), "solo");
    const state: CaromState = {
      ...base,
      screen,
      winner: screen === "matchover" ? "right" : null,
      score: { p1: 3, p2: 11 },
    };
    ctx.fillStyle = PALETTE.highlightText;
    ctx.fillRect(0, 0, FIELD_W, FIELD_H);
    expect(() => render(state, ctx)).not.toThrow();
  });

  it("draws the match-over screen for each winner in each mode", () => {
    for (const mode of ["solo", "versus"] as const) {
      for (const winner of ["left", "right"] as const) {
        const state: CaromState = {
          ...startMatch(titleState(false), mode),
          screen: "matchover",
          winner,
        };
        expect(() => render(state, ctx)).not.toThrow();
      }
    }
  });

  it("draws an empty field and a ball in flight", () => {
    const empty: CaromState = {
      ...startMatch(titleState(false), "solo"),
      screen: "playing",
      ball: null,
      obstacles: [],
    };
    expect(() => render(empty, ctx)).not.toThrow();
    const flying: CaromState = {
      ...startMatch(titleState(false), "versus"),
      screen: "playing",
      ball: {
        x: 400,
        y: 300,
        vx: 500,
        vy: 100,
        spin: 200,
        held: false,
        holdTimer: 0,
        serveSign: 1,
        trail: [
          { x: 380, y: 296, t: 0.01 },
          { x: 390, y: 298, t: 0.02 },
          { x: 400, y: 300, t: 0.03 },
        ],
      },
    };
    expect(() => render(flying, ctx)).not.toThrow();
  });
});
