// The browser side of the showcase capture rig. It stands the real game up on
// a stepped clock and hands the engine to the page, so `capture.ts` can pose
// scenarios through the debug surface, step exact frames, record, and shoot.
// This page is tooling: it is served by the dev server and never built.

import { ConstantClock, createEngine } from "@clockwyrks/simple-2d";
import type { Engine } from "@clockwyrks/simple-2d";
import { FIELD_H, FIELD_W, LAYOUT } from "../src/constants";
import { BACKGROUND, game } from "../src/game";
import type { CaromDebugApi, CaromState } from "../src/game";

export type CaptureEngine = Engine<CaromState, CaromDebugApi>;

declare global {
  interface Window {
    carom?: CaptureEngine;
  }
}

const canvas = document.querySelector<HTMLCanvasElement>("#stage");
if (canvas === null) throw new Error("capture: the #stage canvas is missing");

const engine = createEngine({
  canvas,
  width: FIELD_W,
  height: FIELD_H,
  game,
  background: BACKGROUND,
  layout: LAYOUT,
  clock: new ConstantClock(1000 / 60),
});

await engine.initialize();
window.carom = engine;
