# Carom — The ball, physics, and scoring

This file defines the ball and how it is served, how it moves and interacts with
the field, and what the ball crossing a goal scores. Every figure below carries
the name this specification gives it.

## The ball

One ball is in play: a circle of radius `BALL_R` (`11`) that serves at
`SERVE_SPEED` (`520`) units per second and has its speed multiplied by
`SPEED_MULT` (`1.04`) on every paddle hit, up to the speed cap `SPEED_CAP`
(`980`) units per second. Wall and obstacle bounces leave speed unchanged. Its
home point is the field center `(FIELD_CX, FIELD_CY)`, where it waits before
every serve.

## Physics

The runtime hands the game the real elapsed time for each frame and imposes no
timestep of its own. Every rate in this specification is integrated against that
delta time: the speeds in units per second, the spin in units per second squared,
the spin decay per second, and the hold in seconds.

`specs/instrumentation.md` states the render-free core this rests on and the
agreement two step sizes reach.

### Sub-steps

On every `playing` frame the ball is advanced in `n` sub-steps of `h = dt / n`
seconds each, where `n = max(1, ceil(speed * dt / MAX_SUBSTEP))`, `speed` is
the ball's speed at the start of the frame, and `MAX_SUBSTEP` (`4`) is the most
units the ball's center travels in one sub-step.

Each sub-step does the following, in order:

1. Spin turns the velocity. With `speed = hypot(vx, vy)` and `speed > 0`, rotate
   `(vx, vy)` by `(spin / speed) * h` radians. A positive angle turns the
   direction of travel from `+x` toward `+y`, clockwise on screen. Speed is
   unchanged. A ball with `speed = 0` skips this.
2. Spin decays: `spin *= 0.5 ^ (h / SPIN_HALFLIFE)`.
3. Advance: `x += vx * h`, `y += vy * h`.
4. Resolve collisions in this order: the walls, the left paddle, the right
   paddle, obstacle A, obstacle B.

## Collision

The ball is a circle of radius `BALL_R`. Each paddle is the axis-aligned
rectangle `PADDLE_W` by `PADDLE_H` centered vertically on `cy`, spanning
`[P1_X0, P1_X1]` or `[P2_X0, P2_X1]` horizontally.

### Walls

The walls are resolved first in every sub-step:

- If `y - BALL_R < 0` and `vy < 0`: `y = BALL_R` and `vy = -vy`.
- Otherwise, if `y + BALL_R > FIELD_H` and `vy > 0`: `y = FIELD_H - BALL_R` and
  `vy = -vy`.

A wall bounce leaves speed and spin unchanged.

### Circle against an axis-aligned rectangle

This rule resolves a ball against a paddle and against an obstacle alike.
`specs/playfield.md` gives each obstacle's rectangle.

1. Expand the rectangle `[x0, x1] x [y0, y1]` by `BALL_R` on every side. The ball
   overlaps the rectangle when its center is strictly inside the expanded
   rectangle.
2. Compute the four penetration depths: `left = x - (x0 - BALL_R)`,
   `right = (x1 + BALL_R) - x`, `top = y - (y0 - BALL_R)`,
   `bottom = (y1 + BALL_R) - y`. The struck face is the one with the smallest
   depth; on a tie the first of left, right, top, bottom wins.
3. Place the ball with its center `BALL_R` off the struck face: `x = x0 - BALL_R`
   for the left face, `x = x1 + BALL_R` for the right, `y = y0 - BALL_R` for the
   top, `y = y1 + BALL_R` for the bottom.
4. Reverse the velocity component normal to the struck face if it points into the
   face (`vx > 0` into the left face, `vx < 0` into the right, `vy > 0` into the
   top, `vy < 0` into the bottom); otherwise leave the velocity as it is.

### Paddles

A contact whose struck face is the paddle's left or right face is a paddle hit,
resolved by the paddle bounce below. A contact whose struck face is the paddle's
top or bottom face (an end cap) is resolved like a wall: the ball is placed
`BALL_R` off that face, `vy` is reversed if it points into the face, speed and
spin are unchanged.

The ball stays inside the field and on the outside of every paddle and obstacle
at every speed up to `SPEED_CAP`.

## Paddle bounce and spin

When the ball hits a paddle:

1. Reflection angle from contact point. Let
   `offset = (ballCenterY - paddleCenterY) / PADDLE_HALF`, clamped to `[-1, 1]`.
   The outgoing angle from horizontal is `theta = offset * MAX_BOUNCE_ANGLE`
   (`55deg`). Hitting the paddle center sends the ball straight across; hitting
   the top edge sends it upward at `-MAX_BOUNCE_ANGLE` and the bottom edge
   downward at `+MAX_BOUNCE_ANGLE`.
2. Speed. `speed = min(speed * SPEED_MULT, SPEED_CAP)`, with `speed` the ball's
   speed at contact. The new velocity is `vx = dir * speed * cos(theta)` and
   `vy = speed * sin(theta)`, with `dir = +1` off the left paddle and `-1` off
   the right, so the ball travels toward the opponent.
3. Spin from paddle motion. `spin = clamp(spin + paddleVy * SPIN_FROM_PADDLE,
   -SPIN_CLAMP, SPIN_CLAMP)` (`0.85`, `+/-900`), with `paddleVy` the paddle's
   integrated `vy` for the frame. A paddle moving downward as it strikes adds
   positive spin, a paddle moving upward adds negative spin, and a stationary
   paddle leaves the spin as it was.
4. Placement. The ball's center is placed `BALL_R` beyond the paddle's front face:
   `x = P1_X1 + BALL_R` off the left paddle, `x = P2_X0 - BALL_R` off the right.

A paddle hit is the only collision that changes speed or spin.

## Spin

Spin is a signed scalar carried by the ball, whose magnitude is the lateral
acceleration in units per second squared. It turns the velocity every sub-step as
the physics section states, decays by half every `SPIN_HALFLIFE` (`0.8`) seconds,
and persists across wall and obstacle bounces. Paddle hits and the decay are the
only things that change it.

## Serving

A ball is either waiting to be served or in flight, and `held` says which: it is
`true` while the ball waits and `false` from the frame it is served.

Parking the ball puts it at its home point, held, with zero velocity, zero spin,
an empty trail, and a fresh `serveSign`, `1` and `-1` each equally likely. The
ball is parked at the title screen, when a match starts, by `spawnBall`, and
after a point. Between one parking and the next, `serveSign` keeps the value it
was drawn or posed at.

A waiting ball sits parked while its `holdTimer` counts down from `HOLD_TIME`
(`1.0` second). The screen is `countdown` while the ball waits. Every
`countdown` frame subtracts `dt` from `holdTimer`; on the first frame on which
the result is `<= 0`, the ball is served on that same frame:

- `holdTimer` becomes `0`, `held` becomes `false`, the trail is cleared, and
  `screen` becomes `playing`.
- The serve travels toward `receiver`, the player who was just scored on. The
  first serve of a match travels toward player one (`"left"`).
- The serve leaves at `SERVE_SPEED` at `SERVE_ANGLE` (`12deg`) from horizontal:
  `vx = dir * SERVE_SPEED * cos(SERVE_ANGLE)` with `dir = -1` toward `"left"` and
  `+1` toward `"right"`, and `vy = serveSign * SERVE_SPEED * sin(SERVE_ANGLE)`.
  The serve leaves `serveSign` as it is.
- Every parking draws `serveSign` afresh, so the first serve of a match and every
  serve after a point each take their own draw. Over a run of serves toward the
  same receiver the ball leaves upward on some and downward on others.

The ball is not advanced on the frame it is served. An elapsed `holdTimer` is the
one thing that serves the ball.

### The paddles during the countdown

On every `countdown` frame both paddles move exactly as they do on a `playing`
frame: a paddle under a player moves from the movement actions held that frame,
at `PADDLE_SPEED`, and the AI's paddle moves from the AI's own rule.

## The win rule

First to `WIN_SCORE` (`11`) points wins, and the winner leads by at least
`WIN_LEAD` (`2`): the match is over when `p1 >= WIN_SCORE` and
`p1 - p2 >= WIN_LEAD` (player one, the left side, wins) or when
`p2 >= WIN_SCORE` and `p2 - p1 >= WIN_LEAD` (player two, the right side, wins).
At `10-10` play continues until one player is two points ahead.

## After a point

A point is scored on the frame, after the ball has been advanced and resolved, on
which `x - BALL_R > FIELD_W` (player one scores) or `x + BALL_R < 0` (player two
scores). The scorer's score increments.

If the win rule then holds, `winner` becomes the scorer, `screen` becomes
`matchover`, `menuIndex` becomes `0`, and the ball is left where it is.
Otherwise the ball is parked at its home point, which clears the trail and draws
`serveSign`, `receiver` becomes the side that was scored on, `holdTimer` becomes
`HOLD_TIME`, and `screen` becomes `countdown`.
