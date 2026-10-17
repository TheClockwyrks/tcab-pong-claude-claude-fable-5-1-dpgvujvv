// What the debug overlay shows: the facts `snapshot` reports, each short
// enough to read on a line. Every source is a pure read of the state it is
// handed.

import type { InitApi } from "@clockwyrks/simple-2d";
import type { CaromState, PaddleState } from "./game";
import { speedOf } from "./physics";

const num = (value: number): string => value.toFixed(1);

const paddleLine = (p: PaddleState): string =>
  `cy ${num(p.cy)} vy ${num(p.vy)}${p.driven ? ` driven ${num(p.drivenVy)}` : ""}`;

/** Registers Carom's diagnostic sources. */
export const registerDiagnostics = (
  diagnostics: InitApi<CaromState>["diagnostics"],
): void => {
  diagnostics.register("screen", (s) => s.screen);
  diagnostics.register("mode", (s) => s.mode);
  diagnostics.register("score", (s) => `${s.score.p1} - ${s.score.p2}`);
  diagnostics.register("receiver", (s) => s.receiver);
  diagnostics.register("ball.pos", (s) =>
    s.ball === null ? "none" : `${num(s.ball.x)}, ${num(s.ball.y)}`,
  );
  diagnostics.register("ball.vel", (s) =>
    s.ball === null ? "none" : `${num(s.ball.vx)}, ${num(s.ball.vy)}`,
  );
  diagnostics.register("ball.speed", (s) =>
    s.ball === null ? "none" : num(speedOf(s.ball)),
  );
  diagnostics.register("ball.spin", (s) =>
    s.ball === null ? "none" : num(s.ball.spin),
  );
  diagnostics.register("ball.hold", (s) =>
    s.ball === null ? "none" : s.ball.held ? num(s.ball.holdTimer) : "flying",
  );
  diagnostics.register("paddle.left", (s) => paddleLine(s.paddles.left));
  diagnostics.register("paddle.right", (s) => paddleLine(s.paddles.right));
  diagnostics.register(
    "ai",
    (s) => `tracking ${s.ai.tracking} movement ${s.ai.movement}`,
  );
  diagnostics.register("simTime", (s) => s.simTime.toFixed(2));
  diagnostics.register("muted", (s) => s.muted);
};
