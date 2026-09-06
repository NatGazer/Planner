# The design system

Two apps, one material. Everything here lives in
`packages/ui/src/styles/tokens.css`, `base.css` and `anim/motion.ts`; the two
app stylesheets only lay things out.

## Two rules everything else follows from

**1. Every status and accent colour ships twice.** `--x` is decorative — fills,
rims, chart marks, glows. `--x-ink` is measured for contrast and is the *only*
value allowed to carry text or an icon. This is the discipline that stops a
luminous interface from quietly becoming an unreadable one, and it is why eight
equipment accents can exist without any of them being unreadable as a label.

**2. Every panel is opaque.** The WebGL field behind them is atmosphere. Because
nothing is translucent over it, text contrast is a fixed measured number rather
than a function of what the background happens to be doing at that moment.

Contrast was measured on **real composited pixels**, in a browser, in both
themes, across every screen — `tools/a11y.mjs` walks each text node, resolves
the first opaque ancestor background, and computes the WCAG ratio. Not on token
pairs in isolation, which is how palettes pass on paper and fail on screen.

| | dark | light |
|---|---|---|
| secondary text on a card | 8.2 : 1 | 7.8 : 1 |
| tertiary text on a card | 4.7 : 1 | 6.1 : 1 |
| overdue ink | 8.0 : 1 | 6.3 : 1 |
| due-today ink | 11.4 : 1 | 5.4 : 1 |
| white on the primary button | 5.1 : 1 | 5.9 : 1 |

## The material

A panel is four layers: an opaque body, a soft gradient lighting its top edge, a
bevel (a lit rim, a hair of warm dispersion under it, a shaded underside), and a
hairline that closes the object against the deck.

Elevation is an **opacity crossfade between two pre-painted shadow plates**.
A `box-shadow` transition re-rasterises the shadow every frame; this is one
composited opacity. Brightness changes are an overlay's opacity, never
`filter: brightness()`, for the same reason.

## The status language

Overdue, due today, due this week, later — each encoded **three ways over**: a
coloured edge, a wash whose length or presence carries urgency, and a text chip
that says it in words. The list survives a cracked screen, bright sun and
colour blindness, and reads correctly in greyscale.

On the worker's list each row carries a **pressure field**: a wash scaled
`1 - daysUntilDue / 30`, full width when the job is due or late. It is read at
arm's length, before any of the words are.

## Motion

One spring table in `anim/motion.ts` — `snap` for controls under the finger,
`glide` for content arriving, `settle` for whole surfaces, `pop` for
confirmations, `morph` for the two shared elements. Nothing defines a spring
anywhere else.

Only `transform`, `opacity`, `clip-path` and SVG `pathLength` animate. There is
no animated `width`, `height`, `box-shadow`, `filter`, `flex-grow`,
`background-position` or `stroke-dashoffset` anywhere in either app.

The stagger **clamps the index** rather than compressing the step, so the first
dozen rows cascade and everything after them lands together — a sixty-row list
takes the same time to arrive as a twelve-row one, and both feel the same.

**Navigation is an origin-anchored zoom.** `AnimatePresence mode="wait"`
unmounts the old screen before the new one mounts, so a cross-route `layoutId`
can never pair — it teleports. Instead, the point you touched is written to
`--ox`/`--oy` on pointerdown and the incoming screen scales up out of it. Two
composited properties, and the same "this came from there" read.
`layoutId` survives in exactly two places, both intra-screen and both on a small
element: the segmented-control thumb and the rail's active pill.

## The depth

One shared camera: `perspective: 2200px` on the admin grid, `1100px` on the
phone. At a shorter focal length the outer cards of a wide grid sit far enough
off-axis to shear visibly.

Pointer tilt is **narrowly scoped** — the four stat tiles and the discrete
cards. Never a panel containing a chart or a scannable list: rotating a bar
chart while somebody is reading a value puts the animation in the way of the
task. It writes to motion values, so nothing re-renders while the pointer
moves, and the element's box is cached on `pointerenter` rather than measured
on every move.

An element carrying `transform-style: preserve-3d` never also carries
`overflow`, `isolation`, `filter`, `mix-blend-mode` or `contain: paint`. Every
one of those silently forces `flat` and deletes the depth without a warning
anywhere.

## What it actually measures

Not asserted — traced, in a real browser, with `tools/perf.mjs`:

| | frames over 34ms | layout entries | layout time |
|---|---|---|---|
| flinging the 58-row outstanding list | **0** | **0** | **0 ms** |
| a pointer sweep across the whole dashboard grid | 6 of 27 | **0** | **0 ms** |

Zero layout during a scroll and zero during a pointer sweep is the number that
matters: it means the tilt, the sheen and the rows are pure compositing. The
frames that do run long are the background shader on this machine's *software*
GL renderer — the same trace with the canvas hidden holds a 16.7ms median.
Which is why the field caps its own buffer, and why it stands down entirely
if it ever turns out to be the reason frames are being missed.

## The background

One full-screen triangle through one fragment shader: three slow colour fields
folded together plus a pool of light under the pointer. It renders at 45% of
CSS pixels, is capped at 30fps, and stops entirely when the tab is hidden, when
a sheet covers it, when it scrolls out of view, or when the GPU context is
lost. It **clamps its own luminance to ±5%** of the base tone, so it can never
move the contrast of anything on top of it. On the worker app it draws a single
still frame — a phone GPU spends nothing on it. Without WebGL2 it falls back to
a CSS gradient with the same stops.

## Reduced motion

Not a kill switch — a second product. Travel is removed, meaning is not: every
state is carried by colour, glyph, text and sort position independently of
movement. Numbers appear at their value, charts at their final geometry, sheets
cross-fade, the success moment is a static tick, and pull-to-refresh is
replaced by the Refresh control that is visible in the header anyway.

## Typography

System fonts only, so both apps work completely offline with no network request
of any kind. `-apple-system` / `SF Pro` / `Segoe UI Variable` / `Roboto` /
`Inter`, with a display stack for headings and a mono stack for asset codes —
because an asset code is matched character by character against a label on a
machine, and tabular figures make that reliable. Every metric, date and count
is `font-variant-numeric: tabular-nums`, so a number never jitters as it
changes.

## What is deliberately not here

No UI kit, no icon font, no web font, no chart library, no 3D library, no CDN
request at runtime. The icon set is 60 inline paths on a 24-unit grid; the
charts are SVG and divs; the background is 90 lines of GLSL. Both apps are
fully functional with the network switched off after load.
