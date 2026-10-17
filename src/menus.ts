// The menus: which items each screen shows, where each item's hit region lies,
// and how keyboard edges and pointer samples drive them. The layout here is
// the one `render.ts` draws and the one `menuItemRect` reports, so a pointer
// selects exactly what it sees.

import type { PointerSample } from "@clockwyrks/simple-2d";
import type { DeepReadonly } from "ts-essentials";
import {
  FIELD_CX,
  MATCHOVER_ITEMS,
  PAUSE_ITEMS,
  TITLE_ITEMS,
} from "./constants";
import type { CaromState, MenuPress, MenuRect, Screen } from "./game";
import { returnToTitle, startMatch } from "./state";

/** The how-to screen's single item, whose copy is the build's. */
export const HOWTO_ITEMS = ["BACK"] as const;

interface MenuLayout {
  readonly items: readonly string[];
  /** The top of the first item. */
  readonly top: number;
  /** The distance from one item's top to the next. */
  readonly pitch: number;
  readonly width: number;
  readonly height: number;
}

const LAYOUTS: Readonly<Record<Screen, MenuLayout | null>> = {
  title: { items: TITLE_ITEMS, top: 392, pitch: 68, width: 340, height: 54 },
  howto: { items: HOWTO_ITEMS, top: 624, pitch: 60, width: 240, height: 50 },
  paused: { items: PAUSE_ITEMS, top: 334, pitch: 68, width: 340, height: 54 },
  matchover: {
    items: MATCHOVER_ITEMS,
    top: 430,
    pitch: 68,
    width: 340,
    height: 54,
  },
  countdown: null,
  playing: null,
};

/** The items the menu on `screen` shows, empty where there is no menu. */
export const menuItems = (screen: Screen): readonly string[] =>
  LAYOUTS[screen]?.items ?? [];

/** Whether `screen` shows a menu. */
export const isMenuScreen = (screen: Screen): boolean =>
  LAYOUTS[screen] !== null;

/** The hit region of item `index` on `screen`, or `null` where there is none. */
export const menuItemRect = (
  screen: Screen,
  index: number,
): MenuRect | null => {
  const layout = LAYOUTS[screen];
  if (
    layout === null ||
    !Number.isInteger(index) ||
    index < 0 ||
    index >= layout.items.length
  ) {
    return null;
  }
  return {
    x: FIELD_CX - layout.width / 2,
    y: layout.top + index * layout.pitch,
    w: layout.width,
    h: layout.height,
  };
};

/** The item under `(x, y)` on `screen`, or `null`. */
export const hitMenuItem = (
  screen: Screen,
  x: number,
  y: number,
): number | null => {
  const items = menuItems(screen);
  for (let index = 0; index < items.length; index += 1) {
    const r = menuItemRect(screen, index);
    if (r !== null && x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) {
      return index;
    }
  }
  return null;
};

/** The edges a menu reads on one frame. */
export interface MenuEdges {
  readonly up: boolean;
  readonly down: boolean;
  readonly confirm: boolean;
  readonly back: boolean;
  readonly pause: boolean;
}

const wrap = (index: number, count: number): number =>
  count === 0 ? 0 : ((index % count) + count) % count;

/** The effect of confirming the item at `menuIndex` on the current screen. */
export const confirmItem = (state: DeepReadonly<CaromState>): CaromState => {
  const index = state.menuIndex;
  switch (state.screen) {
    case "title": {
      const remembered = { ...state, titleIndex: index };
      if (index === 0) return startMatch(remembered, "solo");
      if (index === 1) return startMatch(remembered, "versus");
      return { ...remembered, screen: "howto", menuIndex: 0, menuPress: null };
    }
    case "howto":
      return returnToTitle(state);
    case "paused":
      if (index === 0) return resume(state);
      if (index === 1) return startMatch(state, state.mode);
      return returnToTitle(state);
    case "matchover":
      if (index === 0) return startMatch(state, state.mode);
      return returnToTitle(state);
    default:
      return { ...state };
  }
};

const resume = (state: DeepReadonly<CaromState>): CaromState => ({
  ...state,
  screen: state.resumeScreen,
  menuPress: null,
});

/**
 * Applies one frame's keyboard edges to the menu on the current screen. Up is
 * applied before down and movement before confirm; on `paused`, `pause` and
 * `back` resume and nothing else is read.
 */
export const applyMenuKeys = (
  state: DeepReadonly<CaromState>,
  edges: MenuEdges,
): CaromState => {
  const { screen } = state;
  if (screen === "paused" && (edges.pause || edges.back)) return resume(state);
  if (screen === "howto") {
    return edges.confirm || edges.back ? returnToTitle(state) : { ...state };
  }
  const count = menuItems(screen).length;
  if (edges.up)
    return { ...state, menuIndex: wrap(state.menuIndex - 1, count) };
  if (edges.down) {
    return { ...state, menuIndex: wrap(state.menuIndex + 1, count) };
  }
  if (edges.confirm) return confirmItem(state);
  if (edges.back && screen === "matchover") return returnToTitle(state);
  return { ...state };
};

/**
 * Applies one frame's pointer samples to the menu on the current screen. A
 * sample inside an item's region selects it; a primary press and its release
 * inside one item's region confirm it, unless `keyboardConfirmed` already acted
 * this frame.
 */
export const applyMenuPointer = (
  state: DeepReadonly<CaromState>,
  samples: readonly PointerSample[],
  keyboardConfirmed: boolean,
): CaromState => {
  const { screen } = state;
  let menuIndex = state.menuIndex;
  let press: MenuPress | null = state.menuPress;
  let confirmed: number | null = null;

  for (const sample of samples) {
    const hit = hitMenuItem(screen, sample.x, sample.y);
    if (sample.type === "move") {
      if (hit !== null) menuIndex = hit;
    } else if (sample.button === "primary") {
      if (sample.type === "down") {
        press = { pointerId: sample.id, index: hit };
        if (hit !== null) menuIndex = hit;
      } else if (press !== null && press.pointerId === sample.id) {
        if (hit !== null && press.index === hit) {
          menuIndex = hit;
          confirmed = hit;
        }
        press = null;
      }
    }
  }

  const selected: CaromState = { ...state, menuIndex, menuPress: press };
  if (confirmed === null || keyboardConfirmed) return selected;
  return confirmItem(selected);
};

/**
 * Forgets a remembered menu press once its pointer lifts on a screen with no
 * menu, so a press that outlived its menu cannot confirm on a later one.
 */
export const releaseStalePress = (
  state: DeepReadonly<CaromState>,
  samples: readonly PointerSample[],
): CaromState => {
  const press = state.menuPress;
  if (press === null) return { ...state };
  const lifted = samples.some(
    (s) => s.type === "up" && s.id === press.pointerId,
  );
  return lifted ? { ...state, menuPress: null } : { ...state };
};
