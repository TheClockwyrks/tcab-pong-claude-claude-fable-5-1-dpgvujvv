# Carom — The field, the paddles, and the obstacles

This file defines the walls and goals of the field, the paddles, and the
obstacles, including how a ball is resolved against an obstacle. All positions
and sizes are in the field's logical units, and every figure below carries the
name this specification gives it.

## Walls and goals

- The top wall (`y = 0`) and the bottom wall (`y = FIELD_H`) are solid, and a
  ball reflects off them.
- The left and right edges are goals. `specs/balls.md` states when a ball has
  passed one and what it scores.

## Paddles

- Each paddle is a rounded bar `PADDLE_W` wide by `PADDLE_H` tall (`16 x 110`),
  with `PADDLE_HALF` (`55`) its half-height.
- The left (player one) paddle occupies `x` in `[P1_X0, P1_X1]` (`[48, 64]`), so
  `P1_X1` is its field-facing face. The right (player two or AI) paddle occupies
  `x` in `[P2_X0, P2_X1]` (`[1216, 1232]`), so `P2_X0` is its field-facing face.
- A paddle moves only vertically. Its center `cy` is clamped to
  `[PADDLE_MIN_CY, PADDLE_MAX_CY]` (`[55, 665]`), keeping the paddle fully on the
  field.
- A human-controlled paddle moves at `PADDLE_SPEED` (`720`) units per second
  while a movement action is held and is otherwise stationary: with `up` and
  `down` each `1` while held and `0` otherwise, `axis = down - up` and
  `vy = axis * PADDLE_SPEED`.
- Every mover of a paddle (input, the AI, and the debug driver) sets `vy` and then
  integrates it the same way: `next = clamp(cy + vy * dt, PADDLE_MIN_CY,
  PADDLE_MAX_CY)`; if the clamp changed the value and `dt > 0`, then
  `vy = (next - cy) / dt`; then `cy = next`.
- A paddle's `vy` after integration is its actual vertical velocity for the
  frame, which is what the spin mechanic reads at contact. A paddle pinned against
  a bound therefore carries `vy = 0` while the action is held into the bound.

`specs/balls.md` states how both paddles move while a ball is held.

## Obstacles

Two obstacles sit in the field, fixed in place. Each is a rounded bar
`OBSTACLE_W` wide by `OBSTACLE_H` tall (`20 x 140`), placed mirror-symmetrically
through the field center `(FIELD_CX, FIELD_CY)`:

- Obstacle A is centered at `OBSTACLE_CENTERS[0]` (`490, 220`).
- Obstacle B is centered at `OBSTACLE_CENTERS[1]` (`790, 500`).

`OBSTACLES` holds the same two obstacles as axis-aligned rectangles, which is what
the collision below resolves against.

### Collision

Each obstacle is an axis-aligned rectangle with half-extents
`(OBSTACLE_HW, OBSTACLE_HH)` (`10, 70`) centered on its fixed center, the rounded
corners cosmetic. A ball is resolved against it by the circle against an
axis-aligned rectangle rule `specs/balls.md` states, and the bounce leaves speed
and spin unchanged.
