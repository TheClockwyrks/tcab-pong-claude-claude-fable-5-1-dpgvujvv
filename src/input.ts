// One frame's input, read off the engine once into a plain value so the
// simulation can be stepped against it with no engine in the loop.

import type { PointerSample, UpdateApi } from "@clockwyrks/simple-2d";
import { ACTIONS } from "./constants";
import type { ActionName } from "./constants";

export interface FrameInput {
  /** Each action's held magnitude, `0` or `1`. */
  readonly held: Readonly<Record<ActionName, number>>;
  /** Each action's press edge for the frame. */
  readonly pressed: Readonly<Record<ActionName, boolean>>;
  /** Every pointer sample the frame delivered, in arrival order. */
  readonly pointer: readonly PointerSample[];
}

const record = <T>(value: (action: ActionName) => T): Record<ActionName, T> => {
  const out = {} as Record<ActionName, T>;
  for (const action of ACTIONS) out[action] = value(action);
  return out;
};

/** A frame on which nothing was pressed, held, or pointed at. */
export const noInput = (): FrameInput => ({
  held: record(() => 0),
  pressed: record(() => false),
  pointer: [],
});

/** Reads every action and the pointer for the frame. */
export const readInput = (input: UpdateApi["input"]): FrameInput => ({
  held: record((action) => input.value(action)),
  pressed: record((action) => input.pressed(action)),
  pointer: input.pointerSamples(),
});
