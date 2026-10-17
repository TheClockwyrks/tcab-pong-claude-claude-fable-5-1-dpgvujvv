import { describe, expect, it } from "vitest";
import type { PointerSample } from "@clockwyrks/simple-2d";
import {
  FIELD_CY,
  MATCHOVER_ITEMS,
  PAUSE_ITEMS,
  TITLE_ITEMS,
} from "./constants";
import type { ActionName } from "./constants";
import type { CaromState, Screen } from "./game";
import { noInput } from "./input";
import type { FrameInput } from "./input";
import { hitMenuItem, menuItemRect, menuItems } from "./menus";
import { step } from "./simulation";
import { startMatch, titleState } from "./state";

const DT = 1 / 60;

interface Pointer {
  type: "down" | "move" | "up";
  x: number;
  y: number;
  id?: number;
  device?: "mouse" | "touch";
  button?: "primary" | "secondary";
}

const sample = (p: Pointer): PointerSample => ({
  type: p.type,
  x: p.x,
  y: p.y,
  id: p.id ?? 1,
  primary: true,
  device: p.device ?? "mouse",
  button: p.type === "move" ? null : (p.button ?? "primary"),
  buttons: p.type === "up" ? [] : ["primary"],
});

const input = (
  pressed: ActionName[] = [],
  pointer: Pointer[] = [],
): FrameInput => {
  const base = noInput();
  const edges = { ...base.pressed };
  for (const action of pressed) edges[action] = true;
  return { ...base, pressed: edges, pointer: pointer.map(sample) };
};

const press = (state: CaromState, ...actions: ActionName[]): CaromState =>
  step(state, input(actions), DT).state;

const point = (state: CaromState, ...pointer: Pointer[]): CaromState =>
  step(state, input([], pointer), DT).state;

const center = (screen: Screen, index: number): { x: number; y: number } => {
  const r = menuItemRect(screen, index);
  if (r === null) throw new Error("no such item");
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
};

const title = (): CaromState => titleState(false);
const paused = (resume: "countdown" | "playing" = "playing"): CaromState => ({
  ...startMatch(title(), "versus"),
  screen: "paused",
  resumeScreen: resume,
});
const matchover = (): CaromState => ({
  ...startMatch(title(), "versus"),
  screen: "matchover",
  score: { p1: 11, p2: 4 },
  winner: "left",
});

describe("menu layout", () => {
  it("lists each screen's items", () => {
    expect(menuItems("title")).toEqual([...TITLE_ITEMS]);
    expect(menuItems("paused")).toEqual([...PAUSE_ITEMS]);
    expect(menuItems("matchover")).toEqual([...MATCHOVER_ITEMS]);
    expect(menuItems("howto")).toHaveLength(1);
    expect(menuItems("playing")).toEqual([]);
    expect(menuItems("countdown")).toEqual([]);
  });

  it("reports a region per item and none elsewhere", () => {
    expect(menuItemRect("playing", 0)).toBeNull();
    expect(menuItemRect("countdown", 0)).toBeNull();
    expect(menuItemRect("title", 3)).toBeNull();
    expect(menuItemRect("title", -1)).toBeNull();
    expect(menuItemRect("title", 0.5)).toBeNull();
    const r = menuItemRect("title", 1);
    expect(r).not.toBeNull();
    expect(r?.w).toBeGreaterThan(0);
    expect(r?.h).toBeGreaterThan(0);
  });

  it("lays items out without overlap, each hit-testing to itself", () => {
    for (const screen of ["title", "howto", "paused", "matchover"] as const) {
      const items = menuItems(screen);
      items.forEach((_, index) => {
        const r = menuItemRect(screen, index);
        if (r === null) throw new Error("missing rect");
        expect(hitMenuItem(screen, r.x, r.y)).toBe(index);
        expect(hitMenuItem(screen, r.x + r.w - 1, r.y + r.h - 1)).toBe(index);
        expect(hitMenuItem(screen, r.x + r.w, r.y)).toBeNull();
        expect(hitMenuItem(screen, r.x, r.y + r.h)).toBeNull();
      });
    }
    expect(hitMenuItem("title", 5, 5)).toBeNull();
    expect(hitMenuItem("playing", 640, 400)).toBeNull();
  });
});

describe("the title menu", () => {
  it("moves and wraps with either player's keys", () => {
    let s = title();
    s = press(s, "p1-down");
    expect(s.menuIndex).toBe(1);
    s = press(s, "p2-down");
    expect(s.menuIndex).toBe(2);
    s = press(s, "p1-down");
    expect(s.menuIndex).toBe(0);
    s = press(s, "p2-up");
    expect(s.menuIndex).toBe(2);
    s = press(s, "p1-up");
    expect(s.menuIndex).toBe(1);
  });

  it("applies up before down, and movement before confirm", () => {
    let s = { ...title(), menuIndex: 1 };
    s = press(s, "p1-up", "p1-down");
    expect(s.menuIndex).toBe(0);
    s = press(s, "p2-down", "confirm");
    expect(s.menuIndex).toBe(1);
    expect(s.screen).toBe("title");
  });

  it("ignores back", () => {
    expect(press(title(), "back").screen).toBe("title");
  });

  it("starts a solo match from SOLO and remembers the selection", () => {
    const s = press(title(), "confirm");
    expect(s.screen).toBe("countdown");
    expect(s.mode).toBe("solo");
    expect(s.titleIndex).toBe(0);
    expect(s.menuIndex).toBe(0);
    expect(s.resumeScreen).toBe("playing");
  });

  it("starts a versus match from VERSUS", () => {
    const s = press({ ...title(), menuIndex: 1 }, "confirm");
    expect(s.screen).toBe("countdown");
    expect(s.mode).toBe("versus");
    expect(s.titleIndex).toBe(1);
  });

  it("opens the how-to screen and returns to the remembered item", () => {
    let s = press({ ...title(), menuIndex: 2 }, "confirm");
    expect(s.screen).toBe("howto");
    expect(s.menuIndex).toBe(0);
    expect(s.titleIndex).toBe(2);
    s = press(s, "confirm");
    expect(s.screen).toBe("title");
    expect(s.menuIndex).toBe(2);
    const viaBack = press(
      press({ ...title(), menuIndex: 2 }, "confirm"),
      "back",
    );
    expect(viaBack.screen).toBe("title");
    expect(viaBack.menuIndex).toBe(2);
  });

  it("gives a reached screen its first input on the following update", () => {
    // Confirm and a movement edge cannot both arrive, so confirm HOW TO PLAY
    // with a pointer confirm on the frame the keyboard also moves: the frame
    // moves and does not confirm. Then confirm into how-to, then the next
    // frame's back returns.
    const s = press({ ...title(), menuIndex: 2 }, "confirm");
    expect(s.screen).toBe("howto");
    const back = press(s, "back");
    expect(back.screen).toBe("title");
  });
});

describe("the pause menu", () => {
  it("opens from countdown and playing, remembering the screen", () => {
    const match = startMatch(title(), "solo");
    const fromCountdown = press(match, "pause");
    expect(fromCountdown.screen).toBe("paused");
    expect(fromCountdown.resumeScreen).toBe("countdown");
    expect(fromCountdown.menuIndex).toBe(0);
    const playing = { ...match, screen: "playing" as const, menuIndex: 2 };
    const fromPlaying = press(playing, "pause");
    expect(fromPlaying.screen).toBe("paused");
    expect(fromPlaying.resumeScreen).toBe("playing");
    expect(fromPlaying.menuIndex).toBe(0);
  });

  it("opens on Escape and stays open, then resumes once on the next Escape", () => {
    const match = {
      ...startMatch(title(), "solo"),
      screen: "playing" as const,
    };
    const opened = press(match, "pause", "back");
    expect(opened.screen).toBe("paused");
    const resumed = press(opened, "pause", "back");
    expect(resumed.screen).toBe("playing");
  });

  it("resumes on pause or back before reading the menu", () => {
    const s = { ...paused("countdown"), menuIndex: 1 };
    const viaPause = press(s, "pause", "p1-down", "confirm");
    expect(viaPause.screen).toBe("countdown");
    expect(viaPause.menuIndex).toBe(1);
    const viaBack = press(s, "back", "p1-up");
    expect(viaBack.screen).toBe("countdown");
    expect(viaBack.menuIndex).toBe(1);
  });

  it("moves over the three items, wrapping both ways", () => {
    let s = paused();
    s = press(s, "p2-up");
    expect(s.menuIndex).toBe(2);
    s = press(s, "p1-down");
    expect(s.menuIndex).toBe(0);
    s = press(s, "p2-down");
    expect(s.menuIndex).toBe(1);
  });

  it("confirms RESUME, RESTART, and QUIT TO MENU", () => {
    expect(press(paused("playing"), "confirm").screen).toBe("playing");

    const played = {
      ...paused(),
      score: { p1: 3, p2: 5 },
      paddles: {
        left: { cy: 100, vy: 0, driven: false, drivenVy: 0 },
        right: { cy: 600, vy: 0, driven: true, drivenVy: 50 },
      },
    };
    const restarted = press({ ...played, menuIndex: 1 }, "confirm");
    expect(restarted.screen).toBe("countdown");
    expect(restarted.mode).toBe("versus");
    expect(restarted.score).toEqual({ p1: 0, p2: 0 });
    expect(restarted.paddles.left.cy).toBe(FIELD_CY);
    // The restart frame advances the countdown it reached, so the driven
    // right paddle has already moved one frame at its drivenVy.
    expect(restarted.paddles.right.cy).toBeCloseTo(FIELD_CY + 50 * DT, 9);
    expect(restarted.paddles.right.driven).toBe(true);
    expect(restarted.paddles.right.drivenVy).toBe(50);
    expect(restarted.receiver).toBe("left");
    expect(restarted.ball?.held).toBe(true);

    const quit = press(
      { ...played, menuIndex: 2, titleIndex: 1, simTime: 9, muted: true },
      "confirm",
    );
    expect(quit.screen).toBe("title");
    expect(quit.menuIndex).toBe(1);
    expect(quit.titleIndex).toBe(1);
    expect(quit.simTime).toBeCloseTo(9 + DT, 9);
    expect(quit.muted).toBe(true);
    expect(quit.score).toEqual({ p1: 0, p2: 0 });
    expect(quit.paddles.right.driven).toBe(false);
    expect(quit.mode).toBe("solo");
  });
});

describe("the match-over menu", () => {
  it("moves over two items and wraps", () => {
    let s = matchover();
    s = press(s, "p1-down");
    expect(s.menuIndex).toBe(1);
    s = press(s, "p1-down");
    expect(s.menuIndex).toBe(0);
    s = press(s, "p2-up");
    expect(s.menuIndex).toBe(1);
  });

  it("plays again in the current mode, or returns to the title", () => {
    const again = press(matchover(), "confirm");
    expect(again.screen).toBe("countdown");
    expect(again.mode).toBe("versus");
    expect(again.winner).toBeNull();
    expect(again.score).toEqual({ p1: 0, p2: 0 });
    const menu = press({ ...matchover(), menuIndex: 1 }, "confirm");
    expect(menu.screen).toBe("title");
    expect(menu.winner).toBeNull();
    const back = press(matchover(), "back");
    expect(back.screen).toBe("title");
  });
});

describe("pointer and touch", () => {
  it("selects the item a pointer moves onto", () => {
    const s = point(title(), { type: "move", ...center("title", 1) });
    expect(s.menuIndex).toBe(1);
    const off = point(s, { type: "move", x: 5, y: 5 });
    expect(off.menuIndex).toBe(1);
  });

  it("confirms a press and release inside one item", () => {
    const c = center("title", 1);
    const s = point(title(), { type: "down", ...c }, { type: "up", ...c });
    expect(s.screen).toBe("countdown");
    expect(s.mode).toBe("versus");
    expect(s.titleIndex).toBe(1);
  });

  it("confirms a press and a release that arrive on different frames", () => {
    const c = center("title", 2);
    const pressed = point(title(), { type: "down", ...c });
    expect(pressed.screen).toBe("title");
    expect(pressed.menuIndex).toBe(2);
    const released = point(pressed, { type: "up", ...c });
    expect(released.screen).toBe("howto");
  });

  it("confirms nothing when the edges fall in different regions", () => {
    const a = center("title", 0);
    const b = center("title", 1);
    const s = point(
      title(),
      { type: "down", ...a },
      { type: "move", ...b },
      { type: "up", ...b },
    );
    expect(s.screen).toBe("title");
    expect(s.menuIndex).toBe(1);
  });

  it("confirms nothing when the press landed outside every region", () => {
    const b = center("title", 1);
    const s = point(
      title(),
      { type: "down", x: 10, y: 10 },
      { type: "move", ...b },
      { type: "up", ...b },
    );
    expect(s.screen).toBe("title");
    expect(s.menuIndex).toBe(1);
  });

  it("confirms nothing for a release outside every region", () => {
    const a = center("title", 0);
    const s = point(
      title(),
      { type: "down", ...a },
      { type: "up", x: 1, y: 1 },
    );
    expect(s.screen).toBe("title");
    expect(s.menuPress).toBeNull();
  });

  it("ignores the secondary button", () => {
    const a = center("title", 1);
    const s = point(
      title(),
      { type: "down", ...a, button: "secondary" },
      { type: "up", ...a, button: "secondary" },
    );
    expect(s.screen).toBe("title");
  });

  it("takes a touch that lands and lifts inside an item", () => {
    const c = center("paused", 2);
    const landed = point(paused(), {
      type: "down",
      ...c,
      device: "touch",
      id: 7,
    });
    expect(landed.menuIndex).toBe(2);
    const lifted = point(landed, { type: "up", ...c, device: "touch", id: 7 });
    expect(lifted.screen).toBe("title");
  });

  it("selects the item a touch travels onto without confirming it", () => {
    const b = center("paused", 1);
    const s = point(
      paused(),
      { type: "down", x: 20, y: 20, device: "touch", id: 3 },
      { type: "move", ...b, device: "touch", id: 3 },
      { type: "up", ...b, device: "touch", id: 3 },
    );
    expect(s.menuIndex).toBe(1);
    expect(s.screen).toBe("paused");
  });

  it("lets the pointer's selection win over a keyboard movement", () => {
    const c = center("title", 2);
    const s = step(
      title(),
      input(["p1-down"], [{ type: "move", ...c }]),
      DT,
    ).state;
    expect(s.menuIndex).toBe(2);
  });

  it("confirms the keyboard's item alone when both confirm", () => {
    const c = center("title", 1);
    const s = step(
      title(),
      input(
        ["confirm"],
        [
          { type: "down", ...c },
          { type: "up", ...c },
        ],
      ),
      DT,
    ).state;
    expect(s.mode).toBe("solo");
    expect(s.screen).toBe("countdown");
  });

  it("forgets a press whose pointer lifts on a screen with no menu", () => {
    const c = center("title", 0);
    const pressed = point(title(), { type: "down", ...c });
    const playing: CaromState = { ...pressed, screen: "playing" };
    const lifted = point(playing, { type: "up", ...c });
    expect(lifted.menuPress).toBeNull();
    const stillHeld = point(playing, { type: "move", ...c });
    expect(stillHeld.menuPress).not.toBeNull();
  });

  it("does nothing on the live field", () => {
    const match = {
      ...startMatch(title(), "solo"),
      screen: "playing" as const,
    };
    const s = point(
      match,
      { type: "down", x: 640, y: 400 },
      { type: "up", x: 640, y: 400 },
    );
    expect(s.screen).toBe("playing");
  });
});
