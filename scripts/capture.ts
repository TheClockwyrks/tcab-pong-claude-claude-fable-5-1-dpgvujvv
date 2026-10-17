// Captures the showcase media into `showcase/`: screenshots of the running
// game and a gzipped replay of a rally, both taken from the real engine in
// headless Chromium through the capture rig page.
//
//   node scripts/capture.ts
//
// The dev server is started for the run and stopped afterwards.

import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
import { gzipSync } from "node:zlib";
import { chromium } from "playwright";
import type { Page } from "playwright";
import type { Engine } from "@clockwyrks/simple-2d";
import type { CaromDebugApi, CaromState } from "../src/game";

type CaptureEngine = Engine<CaromState, CaromDebugApi>;

/** What the rig page carries between `evaluate` calls. */
interface RigWindow {
  carom: CaptureEngine;
  rally?: {
    counts: Record<string, number>;
    swipeDir: number;
    frame: number;
    off: () => void;
  };
}

interface RallyParams {
  /** Seconds before contact the swipe through the ball begins. */
  swipeTime: number;
  /** How far off the paddle's centre the ball is met, in units. */
  contactOffset: number;
  /** Which way each swipe goes: toward midfield, away from it, or by turns. */
  style: "inward" | "outward" | "alternate";
}

interface RallyStats {
  counts: Record<string, number>;
  score: { p1: number; p2: number };
  screen: string;
  bestFrame: number;
}

const PORT = 5179;
const ROOT = new URL("..", import.meta.url).pathname;
const OUT = `${ROOT}showcase`;
const RALLY_FRAMES = 600;

// ---- In-page scenario steps -------------------------------------------------
// Each function below runs inside the page, so it is self-contained.

const rallyStart = (): void => {
  const w = window as unknown as RigWindow;
  const engine = w.carom;
  const d = engine.debug;
  w.rally?.off();
  const counts: Record<string, number> = {};
  const off = engine.events.on("cue:played", (e) => {
    counts[e.cue] = (counts[e.cue] ?? 0) + 1;
  });
  engine.apply((s) => d.reset(s));
  engine.apply((s) => d.setMode(s, "solo"));
  engine.apply((s) => d.setScreen(s, "countdown"));
  engine.apply((s) => d.setBallServeSign(s, 1));
  engine.apply((s) => d.setBallHoldTimer(s, 0.3));
  engine.apply((s) => d.setPaddleDriven(s, "left", true));
  engine.apply((s) => d.setPaddleVy(s, "left", 0));
  w.rally = { counts, swipeDir: 1, frame: 0, off };
};

/**
 * Steps `frames` frames, driving the left paddle. It predicts where the ball
 * will reach its face, parks a swipe's distance away, then sweeps through the
 * contact at speed so every return carries spin. Returns the frame that
 * looked best for a still.
 */
const rallyStep = async ([frames, params]: readonly [
  number,
  RallyParams,
]): Promise<RallyStats> => {
  const w = window as unknown as RigWindow;
  const engine = w.carom;
  const d = engine.debug;
  const run = w.rally;
  if (run === undefined) throw new Error("rallyStart first");
  const SPEED = 720;
  const DT = 1 / 60;
  const FACE = 75; // P1_X1 + BALL_R: where the ball's centre meets the paddle.
  const LO = 11;
  const HI = 709;
  const clampVy = (v: number): number => Math.max(-SPEED, Math.min(SPEED, v));
  const clampCy = (y: number): number => Math.max(55, Math.min(665, y));
  /** A straight flight folded off the top and bottom walls. */
  const fold = (y: number): number => {
    const span = HI - LO;
    let m = (y - LO) % (2 * span);
    if (m < 0) m += 2 * span;
    return LO + (m <= span ? m : 2 * span - m);
  };
  let best = { frame: -1, score: -1 };

  for (let i = 0; i < frames; i += 1) {
    const s = engine.state;
    const ball = s.ball;
    const cy = s.paddles.left.cy;
    let vy = 0;
    if (ball !== null && !ball.held && ball.vx < 0) {
      const eta = (ball.x - FACE) / -ball.vx;
      const arrival = fold(ball.y + ball.vy * eta);
      if (params.style === "inward") run.swipeDir = arrival < 360 ? 1 : -1;
      if (params.style === "outward") run.swipeDir = arrival < 360 ? -1 : 1;
      const contactCy = arrival - run.swipeDir * params.contactOffset;
      if (eta <= params.swipeTime) {
        vy = clampVy((contactCy - cy) / Math.max(eta, DT));
      } else {
        const reach = SPEED * params.swipeTime * 0.85;
        const start = clampCy(contactCy - run.swipeDir * reach);
        vy = clampVy((start - cy) / DT);
      }
    } else if (ball !== null && !ball.held) {
      const target = ball.y * 0.3 + 360 * 0.7;
      vy = Math.abs(target - cy) < 6 ? 0 : clampVy((target - cy) / DT);
    }
    engine.apply((st) => d.setPaddleVy(st, "left", vy));
    const hitsBefore = run.counts["paddle-hit"] ?? 0;
    await engine.advance(1);
    run.frame += 1;
    const after = engine.state;
    const hitNow = (run.counts["paddle-hit"] ?? 0) > hitsBefore;
    if (hitNow && after.ball !== null && after.ball.vx > 0) {
      if (params.style === "alternate") run.swipeDir = -run.swipeDir;
    }
    if (after.ball !== null && after.screen === "playing") {
      const b = after.ball;
      const speed = Math.hypot(b.vx, b.vy);
      const nearObstacle = Math.min(
        Math.hypot(b.x - 490, b.y - 220),
        Math.hypot(b.x - 790, b.y - 500),
      );
      const centred = b.x > 260 && b.x < 1020 ? 1 : 0;
      const photo =
        centred * (speed + Math.abs(b.spin) + Math.max(0, 260 - nearObstacle));
      if (photo > best.score) best = { frame: run.frame, score: photo };
    }
    if (after.screen !== "playing" && after.screen !== "countdown") break;
  }
  return {
    counts: { ...run.counts },
    score: { ...engine.state.score },
    screen: engine.state.screen,
    bestFrame: best.frame,
  };
};

// ---- The driver ----------------------------------------------------------

const waitForServer = async (url: string): Promise<void> => {
  for (let i = 0; i < 100; i += 1) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // Not up yet.
    }
    await sleep(200);
  }
  throw new Error(`capture: no dev server at ${url}`);
};

const shoot = async (page: Page, name: string): Promise<void> => {
  await page.locator("#stage").screenshot({ path: `${OUT}/${name}` });
  console.log(`wrote ${name}`);
};

const main = async (): Promise<void> => {
  mkdirSync(OUT, { recursive: true });
  // Detached and silent, so the whole server process group can be stopped
  // and nothing it inherits keeps this process's output open.
  const server = spawn(
    "npx",
    ["vite", "--port", String(PORT), "--strictPort", "--logLevel", "warn"],
    { cwd: ROOT, stdio: "ignore", detached: true },
  );
  const browser = await chromium.launch({ args: ["--no-sandbox"] });
  try {
    const url = `http://localhost:${PORT}/scripts/capture.html`;
    await waitForServer(url);
    const page = await browser.newPage({
      viewport: { width: 1280, height: 720 },
      deviceScaleFactor: 1,
    });
    page.on("pageerror", (e) => console.error("page error:", e));
    await page.goto(url);
    await page.waitForFunction(() => "carom" in window);

    // The title screen.
    await page.evaluate(async () => {
      const { carom } = window as unknown as RigWindow;
      await carom.advance(1);
    });
    await shoot(page, "title.png");

    // Search a few paddle styles for the rally that banks the most: banks
    // and returns count for it, a point conceded to the machine against it,
    // and a point won late in the window is a fine way to end.
    const quality = (stats: RallyStats): number =>
      (stats.counts["obstacle-bounce"] ?? 0) * 3 +
      (stats.counts["paddle-hit"] ?? 0) -
      stats.score.p2 * 6 +
      (stats.score.p1 > 0 && stats.bestFrame > 0 ? 2 : 0);
    let chosen: { params: RallyParams; stats: RallyStats } | null = null;
    for (const style of ["inward", "alternate", "outward"] as const) {
      for (const swipeTime of [0.15, 0.25]) {
        for (const contactOffset of [0, 18]) {
          const params: RallyParams = { style, swipeTime, contactOffset };
          await page.evaluate(rallyStart);
          const stats = await page.evaluate(rallyStep, [
            RALLY_FRAMES,
            params,
          ] as const);
          console.log(
            JSON.stringify({
              params,
              counts: stats.counts,
              score: stats.score,
            }),
          );
          if (chosen === null || quality(stats) > quality(chosen.stats)) {
            chosen = { params, stats };
          }
        }
      }
    }
    if (chosen === null) throw new Error("no rally");
    console.log("chosen", JSON.stringify(chosen));

    // Re-run the chosen rally under the recorder, shooting its best frame.
    const { params, stats } = chosen;
    const pauseAt = Math.max(1, stats.bestFrame);
    await page.evaluate(rallyStart);
    await page.evaluate(() => {
      (window as unknown as RigWindow).carom.startRecording();
    });
    await page.evaluate(rallyStep, [pauseAt, params] as const);
    await shoot(page, "rally.png");
    await page.evaluate(rallyStep, [RALLY_FRAMES - pauseAt, params] as const);
    const json = await page.evaluate(() => {
      const { carom } = window as unknown as RigWindow;
      return JSON.stringify(carom.stopRecording());
    });
    const gz = gzipSync(Buffer.from(json));
    writeFileSync(`${OUT}/rally.json.gz`, gz);
    console.log(
      `wrote rally.json.gz (${(gz.length / 1024).toFixed(0)} KiB gzipped, ${(json.length / 1024 / 1024).toFixed(1)} MiB raw)`,
    );

    // Match point.
    await page.evaluate(async () => {
      const { carom } = window as unknown as RigWindow;
      const d = carom.debug;
      carom.apply((s) => d.setScreen(s, "matchover"));
      carom.apply((s) => d.setScore(s, 11, 9));
      carom.apply((s) => d.setWinner(s, "left"));
      await carom.advance(1);
    });
    await shoot(page, "matchover.png");
  } finally {
    await browser.close();
    if (server.pid !== undefined) process.kill(-server.pid, "SIGTERM");
  }
};

await main();
