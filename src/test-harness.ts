// A headless engine for the tests: the real engine over an `@napi-rs/canvas`
// canvas, a surface of the test's own, and a clock that supplies its own
// deltas, so a scenario is posed through the debug surface, stepped an exact
// number of frames, and read back from the state.

import { createCanvas } from "@napi-rs/canvas";
import type { Canvas } from "@napi-rs/canvas";
import {
  ConstantClock,
  createEngine,
  TOUCH_LAYOUTS,
} from "@clockwyrks/simple-2d";
import type {
  Clock,
  Engine,
  PointerDevice,
  SurfaceMetrics,
} from "@clockwyrks/simple-2d";
import { FIELD_H, FIELD_W, LAYOUT } from "./constants";
import type { CaromDebugApi, CaromSnapshot, CaromState } from "./game";
import { game } from "./game";

export type CaromEngine = Engine<CaromState, CaromDebugApi>;

export interface PlayedCue {
  readonly cue: string;
  readonly gain: number;
}

export interface Harness {
  readonly engine: CaromEngine;
  readonly debug: CaromDebugApi;
  readonly canvas: Canvas;
  readonly target: EventTarget;
  /** Every cue played since the harness was built, in order. */
  readonly cues: PlayedCue[];
  /** The names of every cue played, in order. */
  cueNames(): string[];
  /** Press `code` down. */
  keyDown(code: string): void;
  /** Release `code`. */
  keyUp(code: string): void;
  /** Press and release `code` without a frame in between. */
  tap(code: string): void;
  /** A pointer event at a logical position. */
  pointer(
    type: "pointerdown" | "pointermove" | "pointerup" | "pointercancel",
    x: number,
    y: number,
    options?: { id?: number; device?: PointerDevice; button?: number },
  ): void;
  /** Pose the state through a debug operation. */
  apply(transition: (s: CaromState) => CaromState): void;
  /** The current state. */
  state(): CaromState;
  /** The current snapshot. */
  snap(): CaromSnapshot;
  /** The RGBA bytes of the device pixel under a logical position. */
  pixel(x: number, y: number): readonly [number, number, number, number];
  advance(frames: number): Promise<void>;
  destroy(): void;
}

/** A canvas-sized surface with no document behind it. */
const surfaceFor = (target: EventTarget): SurfaceMetrics => ({
  cssWidth: () => FIELD_W,
  cssHeight: () => FIELD_H,
  dpr: () => 1,
  events: () => target,
});

/**
 * Builds and initializes an engine over a fresh canvas. `clock` defaults to a
 * constant 1/60 s step.
 */
export const createHarness = async (clock?: Clock): Promise<Harness> => {
  const canvas = createCanvas(FIELD_W, FIELD_H);
  const target = new EventTarget();
  const engine = createEngine({
    canvas: canvas as unknown as HTMLCanvasElement,
    width: FIELD_W,
    height: FIELD_H,
    game,
    layout: LAYOUT,
    clock: clock ?? new ConstantClock(1000 / 60),
    surface: surfaceFor(target),
  });
  const cues: PlayedCue[] = [];
  engine.events.on("cue:played", (e) =>
    cues.push({ cue: e.cue, gain: e.gain }),
  );
  await engine.initialize();

  const key = (type: "keydown" | "keyup", code: string): void => {
    target.dispatchEvent(
      Object.assign(new Event(type), { code, repeat: false }),
    );
  };

  return {
    engine,
    debug: engine.debug,
    canvas,
    target,
    cues,
    cueNames: () => cues.map((c) => c.cue),
    keyDown: (code) => key("keydown", code),
    keyUp: (code) => key("keyup", code),
    tap: (code) => {
      key("keydown", code);
      key("keyup", code);
    },
    pointer: (type, x, y, options = {}) => {
      const down = type === "pointerdown";
      target.dispatchEvent(
        Object.assign(new Event(type), {
          clientX: x,
          clientY: y,
          pointerId: options.id ?? 1,
          pointerType: options.device ?? "mouse",
          isPrimary: true,
          button: options.button ?? 0,
          buttons: down || type === "pointermove" ? 1 : 0,
        }),
      );
    },
    apply: (transition) =>
      engine.apply((s) => transition(s as unknown as CaromState)),
    state: () => engine.state as unknown as CaromState,
    snap: () => engine.debug.snapshot(engine.state),
    pixel: (x, y) => {
      const data = canvas.getContext("2d").getImageData(x, y, 1, 1).data;
      return [data[0] ?? 0, data[1] ?? 0, data[2] ?? 0, data[3] ?? 0];
    },
    advance: (frames) => engine.advance(frames),
    destroy: () => engine.destroy(),
  };
};

/** The actions the selected layout brings, for the registration test. */
export const layoutActions = (): readonly string[] =>
  TOUCH_LAYOUTS[LAYOUT]?.actions ?? [];
