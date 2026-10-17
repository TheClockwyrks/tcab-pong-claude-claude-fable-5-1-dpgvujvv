// Drawing. Everything is shapes and text in logical units on a context the
// engine has already cleared and transformed; nothing here reads input or
// touches the state.

import type { DeepReadonly } from "ts-essentials";
import {
  BALL_R,
  FIELD_CX,
  FIELD_CY,
  FIELD_H,
  FIELD_W,
  NET_X,
  OBSTACLE_H,
  OBSTACLE_W,
  P1_X0,
  P2_X0,
  PADDLE_H,
  PADDLE_W,
  TITLE_TEXT,
  WIN_SCORE,
} from "./constants";
import type { BallState, CaromState, Screen } from "./game";
import { menuItemRect, menuItems } from "./menus";

type S = DeepReadonly<CaromState>;
type Ctx = CanvasRenderingContext2D;

export const PALETTE = {
  line: "rgba(255, 255, 255, 0.07)",
  net: "rgba(255, 255, 255, 0.3)",
  left: "#3ee6ff",
  right: "#ff5c8a",
  ball: "#fff1a8",
  obstacle: "#b48cff",
  text: "#e8ecf8",
  faint: "rgba(232, 236, 248, 0.55)",
  highlight: "#fff1a8",
  highlightText: "#0b0f1e",
  veil: "rgba(11, 15, 30, 0.74)",
} as const;

const FONT = "'Trebuchet MS', 'Segoe UI', Helvetica, Arial, sans-serif";
const font = (px: number, weight: "bold" | "normal" = "bold"): string =>
  `${weight} ${px}px ${FONT}`;

const roundedBar = (
  ctx: Ctx,
  cx: number,
  cy: number,
  w: number,
  h: number,
  color: string,
  glow: number,
): void => {
  ctx.save();
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = glow;
  ctx.beginPath();
  ctx.roundRect(cx - w / 2, cy - h / 2, w, h, w / 2);
  ctx.fill();
  ctx.restore();
};

const text = (
  ctx: Ctx,
  s: string,
  x: number,
  y: number,
  px: number,
  color: string,
  align: CanvasTextAlign = "center",
  weight: "bold" | "normal" = "bold",
): void => {
  ctx.font = font(px, weight);
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  ctx.fillText(s, x, y);
};

// ---- The field -------------------------------------------------------------

const drawField = (ctx: Ctx): void => {
  ctx.save();
  ctx.strokeStyle = PALETTE.line;
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, FIELD_W - 2, FIELD_H - 2);
  ctx.beginPath();
  ctx.arc(FIELD_CX, FIELD_CY, 90, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = PALETTE.net;
  ctx.lineWidth = 4;
  ctx.setLineDash([14, 14]);
  ctx.lineDashOffset = 7;
  ctx.beginPath();
  ctx.moveTo(NET_X, 0);
  ctx.lineTo(NET_X, FIELD_H);
  ctx.stroke();
  ctx.restore();
};

const drawObstacles = (state: S, ctx: Ctx): void => {
  for (const o of state.obstacles) {
    roundedBar(ctx, o.cx, o.cy, OBSTACLE_W, OBSTACLE_H, PALETTE.obstacle, 18);
  }
};

const drawPaddles = (state: S, ctx: Ctx): void => {
  const { left, right } = state.paddles;
  roundedBar(
    ctx,
    P1_X0 + PADDLE_W / 2,
    left.cy,
    PADDLE_W,
    PADDLE_H,
    PALETTE.left,
    22,
  );
  roundedBar(
    ctx,
    P2_X0 + PADDLE_W / 2,
    right.cy,
    PADDLE_W,
    PADDLE_H,
    PALETTE.right,
    22,
  );
};

/** The ball's path over its recent samples, fading and thinning toward the tail. */
const drawTrail = (ball: DeepReadonly<BallState>, ctx: Ctx): void => {
  const samples = ball.trail;
  if (samples.length < 2) return;
  ctx.save();
  ctx.lineCap = "round";
  ctx.strokeStyle = PALETTE.ball;
  const last = samples.length - 1;
  for (let i = 1; i <= last; i += 1) {
    const a = samples[i - 1];
    const b = samples[i];
    if (a === undefined || b === undefined) continue;
    const p = i / last;
    ctx.globalAlpha = 0.06 + 0.42 * p;
    ctx.lineWidth = 2 + (BALL_R * 1.6 - 2) * p;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  ctx.restore();
};

const drawBall = (ball: DeepReadonly<BallState>, ctx: Ctx): void => {
  ctx.save();
  ctx.fillStyle = PALETTE.ball;
  ctx.shadowColor = PALETTE.ball;
  ctx.shadowBlur = 24;
  ctx.beginPath();
  ctx.arc(ball.x, ball.y, BALL_R, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
};

const drawFurniture = (state: S, ctx: Ctx): void => {
  drawObstacles(state, ctx);
  drawPaddles(state, ctx);
  if (state.ball !== null) {
    drawTrail(state.ball, ctx);
    drawBall(state.ball, ctx);
  }
};

// ---- The match's chrome ----------------------------------------------------

const drawHud = (state: S, ctx: Ctx): void => {
  text(ctx, String(state.score.p1), FIELD_CX - 96, 74, 72, PALETTE.left);
  text(ctx, String(state.score.p2), FIELD_CX + 96, 74, 72, PALETTE.right);
  const label =
    state.mode === "solo"
      ? `SOLO  ·  YOU vs THE MACHINE  ·  FIRST TO ${WIN_SCORE}`
      : `VERSUS  ·  TWO PLAYERS  ·  FIRST TO ${WIN_SCORE}`;
  text(ctx, label, FIELD_CX, FIELD_H - 24, 16, PALETTE.faint);
};

const drawMuted = (state: S, ctx: Ctx): void => {
  if (!state.muted) return;
  text(ctx, "MUTED  [M]", FIELD_W - 24, 26, 15, PALETTE.faint, "right");
};

const drawCountdown = (state: S, ctx: Ctx): void => {
  const ball = state.ball;
  if (ball === null || !ball.held) return;
  text(ctx, "READY", FIELD_CX, FIELD_CY - 74, 40, PALETTE.text);
  // A chevron toward the side the serve travels to.
  const dir = state.receiver === "left" ? -1 : 1;
  const x = FIELD_CX + dir * 60;
  ctx.save();
  ctx.fillStyle = PALETTE.faint;
  ctx.beginPath();
  ctx.moveTo(x + dir * 14, FIELD_CY);
  ctx.lineTo(x - dir * 6, FIELD_CY - 12);
  ctx.lineTo(x - dir * 6, FIELD_CY + 12);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
};

// ---- Menus -----------------------------------------------------------------

const drawVeil = (ctx: Ctx): void => {
  ctx.fillStyle = PALETTE.veil;
  ctx.fillRect(0, 0, FIELD_W, FIELD_H);
};

const drawMenu = (state: S, ctx: Ctx, screen: Screen): void => {
  const items = menuItems(screen);
  items.forEach((label, index) => {
    const r = menuItemRect(screen, index);
    if (r === null) return;
    const selected = index === state.menuIndex;
    ctx.save();
    if (selected) {
      ctx.fillStyle = PALETTE.highlight;
      ctx.shadowColor = PALETTE.highlight;
      ctx.shadowBlur = 18;
      ctx.beginPath();
      ctx.roundRect(r.x, r.y, r.w, r.h, r.h / 2);
      ctx.fill();
    } else {
      ctx.strokeStyle = PALETTE.line;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(r.x, r.y, r.w, r.h, r.h / 2);
      ctx.stroke();
    }
    ctx.restore();
    text(
      ctx,
      selected ? `›  ${label}  ‹` : label,
      r.x + r.w / 2,
      r.y + r.h / 2 + 1,
      24,
      selected ? PALETTE.highlightText : PALETTE.text,
    );
  });
};

const drawTitle = (state: S, ctx: Ctx): void => {
  ctx.save();
  ctx.shadowColor = PALETTE.left;
  ctx.shadowBlur = 40;
  text(ctx, TITLE_TEXT, FIELD_CX, 220, 132, PALETTE.text);
  ctx.restore();
  text(ctx, "A TOP-DOWN PADDLE DUEL", FIELD_CX, 306, 20, PALETTE.faint);
  drawMenu(state, ctx, "title");
  text(
    ctx,
    "W / S  and  ↑ / ↓  move   ·   ENTER selects   ·   M mutes",
    FIELD_CX,
    FIELD_H - 36,
    16,
    PALETTE.faint,
  );
};

const HOWTO_LINES: readonly (readonly [string, number, string])[] = [
  ["HOW TO PLAY", 48, PALETTE.text],
  ["", 0, PALETTE.text],
  ["PLAYER ONE   W / S          PLAYER TWO   ↑ / ↓", 24, PALETTE.text],
  [
    "In Solo either pair moves your paddle; the machine takes the right side.",
    19,
    PALETTE.faint,
  ],
  [
    "ENTER or SPACE confirms   ·   P or ESC pauses   ·   M mutes",
    19,
    PALETTE.faint,
  ],
  ["", 0, PALETTE.text],
  ["SPIN", 28, PALETTE.left],
  [
    "Strike the ball while your paddle is moving and its flight curves afterward.",
    19,
    PALETTE.faint,
  ],
  [
    "Moving down curves it clockwise, moving up the other way, and spin fades over time.",
    19,
    PALETTE.faint,
  ],
  ["", 0, PALETTE.text],
  ["BANK SHOTS", 28, PALETTE.obstacle],
  [
    "Two bars stand in midfield. The ball bounces off them without losing pace,",
    19,
    PALETTE.faint,
  ],
  [
    "so a curved shot can bank around the defence. First to 11, win by 2.",
    19,
    PALETTE.faint,
  ],
];

const drawHowto = (state: S, ctx: Ctx): void => {
  let y = 96;
  for (const [line, px, color] of HOWTO_LINES) {
    if (px === 0) {
      y += 14;
      continue;
    }
    text(ctx, line, FIELD_CX, y, px, color);
    y += px + 14;
  }
  drawMenu(state, ctx, "howto");
};

const drawPaused = (state: S, ctx: Ctx): void => {
  drawVeil(ctx);
  text(ctx, "PAUSED", FIELD_CX, 250, 64, PALETTE.text);
  drawMenu(state, ctx, "paused");
};

const drawMatchover = (state: S, ctx: Ctx): void => {
  drawVeil(ctx);
  const left = state.winner !== "right";
  const color = left ? PALETTE.left : PALETTE.right;
  const heading =
    state.mode === "solo"
      ? left
        ? "YOU WIN"
        : "THE MACHINE WINS"
      : left
        ? "PLAYER ONE WINS"
        : "PLAYER TWO WINS";
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = 30;
  text(ctx, heading, FIELD_CX, 222, 64, color);
  ctx.restore();
  text(ctx, String(state.score.p1), FIELD_CX - 70, 320, 72, PALETTE.left);
  text(ctx, "–", FIELD_CX, 318, 48, PALETTE.faint);
  text(ctx, String(state.score.p2), FIELD_CX + 70, 320, 72, PALETTE.right);
  drawMenu(state, ctx, "matchover");
};

// ---- The frame -------------------------------------------------------------

/** Draws `state` onto `ctx`, in logical units. */
export const render = (state: S, ctx: Ctx): void => {
  const { screen } = state;
  drawField(ctx);
  drawFurniture(state, ctx);
  // The menus outside a match sit over the field furniture, dimmed by a veil.
  if (screen === "title" || screen === "howto") drawVeil(ctx);
  else drawHud(state, ctx);

  switch (screen) {
    case "title":
      drawTitle(state, ctx);
      break;
    case "howto":
      drawHowto(state, ctx);
      break;
    case "countdown":
      drawCountdown(state, ctx);
      break;
    case "paused":
      drawPaused(state, ctx);
      break;
    case "matchover":
      drawMatchover(state, ctx);
      break;
    case "playing":
      break;
  }
  drawMuted(state, ctx);
};
