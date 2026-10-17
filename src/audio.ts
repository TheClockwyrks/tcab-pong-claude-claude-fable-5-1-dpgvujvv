// The four cues, each a distinct short blip. `specs/audio.md` names them and
// says when each one plays; the simulation raises them and `update` plays them.

import type { CueSpec, InitApi } from "@clockwyrks/simple-2d";
import { CUES } from "./constants";
import type { CueName } from "./constants";

export const CUE_SPECS: Readonly<Record<CueName, CueSpec>> = {
  [CUES.paddleHit]: {
    wave: "square",
    freq: 440,
    freqTo: 330,
    durationMs: 70,
    gain: 0.16,
  },
  [CUES.wallBounce]: {
    wave: "triangle",
    freq: 260,
    freqTo: 200,
    durationMs: 50,
    gain: 0.16,
  },
  [CUES.obstacleBounce]: {
    wave: "sawtooth",
    freq: 620,
    freqTo: 760,
    durationMs: 60,
    gain: 0.1,
  },
  [CUES.score]: {
    wave: "sine",
    freq: 880,
    freqTo: 220,
    durationMs: 280,
    gain: 0.2,
  },
};

/** Declares every cue on the runtime's bus. */
export const defineCues = (audio: InitApi["audio"]): void => {
  for (const [name, spec] of Object.entries(CUE_SPECS)) {
    audio.define(name, spec);
  }
};
