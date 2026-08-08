# SuitedPoker — Design System

The visual language for the whole product. Substage 0.2 turns this into tokens and
code; every substage after inherits it. If you are about to hardcode a color, a
radius, or a spacing value anywhere in this codebase, the value belongs here
instead.

---

## Where this came from

Two references, both measured rather than eyeballed — computed styles pulled from
the live sites, pixel distances measured off frame captures.

**[flighty.com](https://flighty.com)** — the violet-shifted black, the bimodal
line-height, the floating glass bar, the spacing rhythm, the ambient glow.

**[flysoar.ai](https://flysoar.ai)** — the hairline glass surface, the lit-from-below
gradient button, the pill-inside-pill nesting, TWK Lausanne.

Deliberately **not** taken: Flighty's 846px content column and 160px section gaps
(marketing pacing, wrong for a data-dense product), its light/dark theme flip (we
are dark throughout), and `backdrop-filter: blur(40px)` on persistent chrome (it
repaints every scroll frame and will drop frames on mid-range Android during a
hand replay).

---

## 1. Color

### Canvas and surfaces

The single highest-leverage decision in the whole system: **the black is not
black.** Flighty ships `#03000E` — R3 G0 B14, a violet-shifted near-black. Every
white element on top picks up a faint violet cast and glows blend *into* the
background instead of sitting on it.

We take the technique but dial back the saturation, because our screens carry
color-coded data that a strongly tinted canvas would fight.

| Token | Value | Use |
|---|---|---|
| `--canvas` | `#07060D` | Page background everywhere |
| `--canvas-deep` | `#040309` | Marketing hero, onboarding, modal scrims |
| `--surface-1` | `#0E0D16` | Cards, panels |
| `--surface-2` | `#15141F` | Raised, hover, nested cards |
| `--surface-3` | `#1D1B29` | Inputs, filled controls |

### Borders — always alpha, never hex

Soar's entire glass effect is a **1px `rgba(255,255,255,0.12)` border** on a
near-black fill. Alpha borders adapt to whatever surface they land on; hex borders
have to be re-picked per surface and always drift.

| Token | Value | Use |
|---|---|---|
| `--border` | `rgba(255,255,255,0.09)` | Default card and panel edges |
| `--border-strong` | `rgba(255,255,255,0.14)` | The glass bar, focused inputs, emphasis |
| `--border-subtle` | `rgba(255,255,255,0.05)` | Dividers, table rules |

### Text

Flighty's secondary grey is ~55% white, which fails WCAG AA at small sizes. Fine
for a decorative marketing subhead; not fine for a stat label read a thousand
times. Ours sits higher.

| Token | Value | Notes |
|---|---|---|
| `--text-primary` | `#F4F5F8` | |
| `--text-secondary` | `rgba(244,245,248,0.72)` | Body copy, descriptions |
| `--text-tertiary` | `rgba(244,245,248,0.48)` | Meta, labels, timestamps — **never below this** |

### Accent — blue, and deliberately not indigo

Runout Poker is `#4F46E5`/`#5B5BFF` indigo throughout. We sit next to Soar's
cleaner azure instead, which reads as distinct at a glance.

| Token | Value | Contrast on canvas |
|---|---|---|
| `--accent` | `#2F68FF` | 4.37 — **fills and large text only** |
| `--accent-bright` | `#5B8CFF` | 6.38 — **use for accent text and links** |
| `--accent-deep` | `#1A2F9E` | gradient top stop |
| `--accent-glow` | `rgba(44,79,240,0.26)` | outer glow |
| `--accent-specular` | `#7FA4FF` | lit-button highlight |
| `--on-accent` | `#FFFFFF` | **label colour on an accent fill** |

> ⚠️ `--on-accent` is pure white and is the one place white is correct.
> `--text-primary` (`#F4F5F8`) measures **4.24** on `--accent` and fails AA; white
> measures 4.62. The 4.62 figure quoted below was always computed with white.

#### The full ramp

The four tokens above are aliases into a 50→950 ramp, derived in OKLCh and
gamut-clipped to sRGB with the three measured values pinned exactly at 400, 500
and 800. Regenerate the ladder rather than hand-editing a stop.

| Stop | Value | On canvas | White on it |
|---|---|---|---|
| 50 | `#ECF2FE` | 17.96 | 1.12 |
| 100 | `#D6E3FF` | 15.65 | 1.29 |
| 200 | `#B4CCFE` | 12.50 | 1.61 |
| 300 | `#88AEFE` | 9.16 | 2.20 |
| **400** | **`#5B8CFF`** = `--accent-bright` | 6.38 | 3.16 |
| **500** | **`#2F68FF`** = `--accent` | 4.37 | 4.62 |
| 600 | `#2954DE` | 3.28 | 6.15 |
| 700 | `#2142BD` | 2.48 | 8.14 |
| **800** | **`#1A2F9E`** = `--accent-deep` | 1.87 | 10.80 |
| 900 | `#13217A` | 1.47 | 13.76 |
| 950 | `#0C1656` | 1.22 | 16.60 |

**The accent is for data, state, and chrome.** Ratings, progress, active
selections, links, focus rings, the primary CTA. It is never used for grading.

> ⚠️ `--accent` measures **4.37:1** against `--canvas` — it fails WCAG AA for
> normal-size text by a hair. It is fine as a *fill* (white on `#2F68FF` measures
> 4.62:1, and 6.74:1 at the gradient's midpoint) and fine for large text. For any
> accent-colored text at body size, use `--accent-bright` instead. This is
> checked, not assumed.

### Grade colors — green through red, and nothing else uses them

Separating the grade ramp from the accent is what keeps a screen readable: blue
means *interface*, green-to-red means *how good was that decision*. Nothing
decorative may borrow these.

| Grade | Token | Value |
|---|---|---|
| Sharp | `--grade-sharp` | `#2BD97C` + glow |
| Best | `--grade-best` | `#2BD97C` |
| Solid | `--grade-solid` | `#7BC99B` |
| Inaccuracy | `--grade-inaccuracy` | `#F0B429` |
| Mistake | `--grade-mistake` | `#F5813A` |
| Blunder | `--grade-blunder` | `#EF4B4B` |

Each needs a solid, a 12%-alpha fill, and a border variant.

**`evColor(bbLoss)`** interpolates this ramp: `best` at 0bb → `solid` at 0.02 →
`inaccuracy` at 0.05 → `mistake` at 2 → `blunder` at 5. The frequency bar colors
every segment through this one function. The colour saturates at **10bb** — a
pot-sized error at 100bb depth, past which redder conveys nothing extra.

> **Green is the best action and nothing else.** The first anchors were `solid`
> at 0.5, `inaccuracy` at 2 and `mistake` at 5, which put the colour a whole
> band behind the grade — a 0.14bb alternative graded `solid` rendered 72% of
> the way to `best`, so a two-segment bar came out as one green blob and the
> reader could not see which line was better at a glance. That is the one thing
> the bar exists to say. Amber now begins at **0.05bb**, which is `SOLID_FROM`
> in the grader — below it the grader itself calls an action `best`. The two
> upper anchors are the grader's own band boundaries exactly.
>
> A consequence, stated rather than hidden: a segment's colour and its
> `GradeBadge` no longer always share a hue — a `solid` badge is green while its
> segment is amber. They answer different questions. The badge grades the
> decision you made; the bar shows what each line costs against the best one.
> Colour is still never the only signal.

It ships as a pair. `evColor()` returns a `color-mix(in oklab, …)` string for the
DOM, so the six stop colours stay in `globals.css` and nowhere else.
`evColorRgb()` reads those same custom properties at runtime and interpolates
numerically, for canvas, SVG and screenshot rendering. A unit test pins the two
to each other at every stop and between them.

> ⚠️ **Color is never the only signal.** Roughly 8% of men have red-green color
> deficiency and this audience is overwhelmingly male. Every grade carries an
> icon and a word alongside its color — ⚡ Sharp, ✓ Best, ✓ Solid, ?! Inaccuracy,
> ? Mistake, ?? Blunder. A screenshot rendered in greyscale must still be
> readable.

### Danger — destructive actions, and not a grade

Added in 0.3. A `destructive` button needed a red, and borrowing `--grade-blunder`
would have broken rule 2 — on a hand-review screen the same red meaning both
"you blundered" and "this deletes your data" is a genuine misread.

It is deeper than blunder and rotated toward crimson (OKLCh h=14 against
blunder's 24.8), so the two never read as the same signal.

| Token | Value | Use |
|---|---|---|
| `--danger` | `#D63055` | Destructive fill — white label measures 4.76 |
| `--danger-bright` | `#E35A6F` | Destructive **text** — 5.72 on canvas |
| `--danger-fill` | 12% of `--danger` | Tinted background |
| `--danger-border` | 30% of `--danger` | Edge on that fill |

Destructive intent is never carried by colour alone: the label says what will
happen, and anything irreversible confirms first.

### Card suits — a classic two-colour deck

Added in 3.1 as a FOUR-colour deck (blue diamonds, green clubs) on the argument
that it reduces beginner misreads. Reversed after looking at it: that is the
convention a poker room gives its regulars, and to somebody whose only reference
is a physical deck a blue diamond does not read as a convention, it reads as the
app being broken. A beginner who has to learn a colour code before they can read
their own hand has been handed a second problem.

Hearts and diamonds share one red, exactly as a real deck does. The pip shape is
what tells them apart, and that is discrimination the audience already has.

The face is the RANK OVER ITS SUIT, both centred, at every size. A full English
pip layout — ten pips for a ten, a drawn court figure for a king — was built and
then removed: it is more faithful to a physical card and worse to use, because a
centred rank is read at a glance and a pip field has to be counted. The reference
is a poker app, not a deck of cards.

These are **not** the grade ramp and must never borrow from it: a card is red
because it is a heart, never because the play was bad. They sit on a white card
face, so every one is measured against white rather than the canvas.

| Token | Value | On white |
|---|---|---|
| `--suit-hearts` | `#D32F2F` | 4.98 |
| `--suit-diamonds` | `#D32F2F` | 4.98 |
| `--suit-clubs` | `#14131C` | 18.43 |
| `--suit-spades` | `#14131C` | 18.43 |
| `--card-face` | `#FFFFFF` | the brightest object on the table, by design |
| `--card-back` | `#131A2E` | patterned, never a solid block |

### Ambient violet — marketing and onboarding only

Flighty builds its glow with **three different techniques at three scales**, which
is why it reads as designed rather than as one lazy gradient.

| Technique | Recipe | Where |
|---|---|---|
| Ambient blob | ~750×500px ellipse, peak `#2D0077`, `filter: blur(120px)`, clipped to section | Behind hero and diagnosis content |
| Gradient top hairline | 1px indigo→magenta horizontal gradient with a ~16px inner bloom below it | Top edge of feature cards |
| Border halo | `1.5px solid` accent + `box-shadow: 0 0 24px accent/0.6` | One highlighted element per screen, max |

> **Hard rule: no ambient glow on the training canvas.** These peak around
> `#2D0077` — a large saturated field. Put a range grid or a color-coded action
> bar on top and you have destroyed the ability to read color semantically.
> Marketing, onboarding, diagnosis, and paywall may glow. Drills, the table, the
> arena, the dashboard's data areas may not.

---

## 2. Typography

### The font

Flighty ships **no custom font at all** — it's `system-ui`, which on a Mac
resolves to SF Pro. Soar uses **TWK Lausanne** (Weltkern), a commercial Swiss
neo-grotesque.

**Decision: Inter.** TWK Lausanne is a paid Weltkern licence we are not buying, so
it is out of the system entirely rather than sitting in the stack as a
first-choice family that will never resolve.

Inter is self-hosted via `@fontsource-variable/inter` — **not** `next/font/google`,
so the build stays hermetic with no network call at build time. Geist remains
installed as the fallback.

```
--font-sans: "Inter Variable", "Inter", var(--font-geist-sans), -apple-system, system-ui, sans-serif;
```

`"Inter Variable"` is the family name the fontsource package registers and must
come first for the self-hosted files to apply; `"Inter"` after it picks up a
locally installed copy.

Mono is **Geist Mono**, `font-variant-numeric: tabular-nums` **always** — stack
sizes, pot sizes, EVs, ratings, and percentages must not jitter while animating.

### The rule that matters more than the scale

Both references are **bimodal on line-height**. Display type runs **1.00–1.08**.
Body runs **1.43–1.56**. There is nothing in between. Flighty sets a 48px heading
at exactly 48px leading; Soar sets 40px at 43.2px.

Most sites ship 1.2 on headings, and that is the single biggest tell of a
template. **Set display type solid.**

Tracking follows size: Soar runs `-0.8px` at 40px (−0.02em), Flighty `-1px` at
65px (−0.015em). Body is 0.

### Scale

| Token | Size | Line-height | Weight | Tracking |
|---|---|---|---|---|
| `display-xl` | 60 | 60 (1.00) | 700 | −0.03em |
| `display-lg` | 44 | 47 (1.07) | 600 | −0.02em |
| `display-md` | 34 | 37 (1.09) | 600 | −0.02em |
| `heading-lg` | 24 | 28 (1.17) | 600 | −0.01em |
| `heading-md` | 20 | 27 (1.35) | 600 | 0 |
| `body-lg` | 18 | 27 (1.50) | 400 | 0 |
| `body-md` | 16 | 23 (1.44) | 400 | 0 |
| `body-sm` | 14 | 20 (1.43) | 400 | 0 |
| `caption` | 13 | 17 (1.31) | 500 | 0.01em |
| `overline` | 11 | 14 | 700 | 0.12em, uppercase |

Working sizes in the product are **14–18**. Display sizes appear on marketing,
onboarding, the diagnosis, and large stat numerals only.

> **The scale was raised one step from its first version** (body 14 → 16,
> display-lg 40 → 44, and so on down the table). It had been drawn at a
> dashboard density, and the product's real reading surfaces are a lesson, an
> explanation and a diagnosis — long-form prose a beginner reads on a phone.
> 14px prose is also the most reliable tell of a generated page. `overline` is
> the one step that did not move: it is a tracked-out uppercase marker, not
> text, and at 13 it competes with the heading beneath it.
>
> The RATIOS were preserved. Enlarging only the small end would have flattened
> the hierarchy, which is the other half of why a page reads as templated.

> The set-solid trick **fails below ~20px**. Tight leading has to relax as size
> drops — that's why the ratios climb down the table.

---

## 3. Spacing

Base unit **4px**, strong preference for multiples of 8.

`2 · 4 · 6 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 48 · 64 · 80`

### The rhythm rule

The reason Flighty's spacing reads as "not jumbled, not too spaced out" is
measurable: **each level is roughly 2× the last.**

| Relationship | Flighty | **Ours (product)** |
|---|---|---|
| Heading → its body copy | 21–24px | **12px** |
| Related elements in a group | — | **16px** |
| Group → next group | 58px | **24px** |
| Section → section | ~160px | **40px** |

We keep the doubling and shrink the absolutes. 160px section gaps are marketing
pacing — in a product UI they mean one panel per screen and endless scrolling.

**Card interior padding: 20px** (Flighty uses 32 on a 846px column; ours are
narrower). **Grid gap: 12px**, used for both rows and columns — reusing one value
in both axes is what makes a grid read as a single object rather than as rows.

### Containers

| Context | Max width |
|---|---|
| Marketing prose | 720px |
| App content | 1100px |
| **Drill / table / range grid** | **full bleed, 16px gutters** |

Flighty's 846px column with 217px gutters is right for a sales page and
catastrophic for a 13×13 range matrix. Keep the ratio discipline, throw away the
width.

Mobile gutter: **16px**. Minimum touch target: **44×44px**, no exceptions.

---

## 4. Radius

A hybrid of Flighty's precision (16) and Runout's softness (20–24).

| Token | Value | Use |
|---|---|---|
| `radius-sm` | 10 | Chips, badges, small tiles, playing cards |
| `radius-md` | 14 | Inputs, small cards, seat pills |
| `radius-lg` | 18 | **Default card radius** |
| `radius-xl` | 24 | Modals, sheets, the glass bar, hero panels |
| `radius-full` | 9999 | Every button, every pill, avatars |

### The rule that makes it cohere

**Containers get a fixed radius. Anything interactive and text-sized gets a full
capsule.** There is no in-between — no 6px buttons, no 10px cards. Both references
follow this without exception, and Soar's signature nesting is exactly this:
a `radius-full` search bar containing `radius-full` buttons, one step apart in
size.

---

## 5. The three signature treatments

These are the specific recipes that produce the look. Implement them as reusable
primitives, not ad-hoc CSS.

### 5.1 Glass surface

Soar's search bar, measured from its computed style. Note there is **no
`backdrop-filter`** — the glass read comes entirely from a near-black fill plus a
12% white hairline over a varying background.

```css
.glass {
  background: #0D1016;                      /* near-black, slightly blue */
  border: 1px solid rgba(255,255,255,0.12); /* THE effect */
  border-radius: var(--radius-full);        /* or --radius-xl for rectangles */
  padding: 4px;                             /* tight — it hugs its children */
}
```

That 1px border is the "subtle gradient with white in it" — it isn't a gradient at
all. It's a constant 12% white line reading brighter where the background behind
it is light and dimmer where it's dark. Over a photographic or glowing backdrop it
appears to shimmer along its length.

Use `backdrop-filter: blur(24px)` **only** where the bar genuinely overlaps
scrolling content — the dashboard glass bar. Never on a static panel; it costs a
repaint per scroll frame.

### 5.2 The lit button

Soar's Search button, exact. The distinctive quality is that it appears **lit from
below**: the gradient runs dark at the top to bright at the bottom (most buttons
do the reverse), and the specular highlight sits on the *bottom* inner edge.

```css
.btn-accent {
  background: linear-gradient(#1A2F9E 0%, #2F68FF 100%);
  border: 1px solid rgba(255,255,255,0.15);
  border-radius: var(--radius-full);
  box-shadow:
    inset 0 -1.5px 2px  #7FA4FF,              /* specular, bottom inner edge */
    inset 0 0 10px      #2F68FF,              /* inner bloom */
    0 1px 2px           rgba(0,0,0,0.12),     /* contact shadow */
    0 6px 16px          rgba(44,79,240,0.26); /* colored outer glow */
  font: 600 16px var(--font-sans);
  height: 48px;
  padding: 0 20px;
}
```

The colored outer glow is what makes it feel like a light source rather than a
rectangle. Reserve this treatment for **one button per screen** — the primary
action. Everything else is a ghost or outline button.

### 5.3 Ambient glow

See the table in §1. Three techniques, three scales, marketing surfaces only.

---

## 6. Components

**Glass bar (dashboard home).** Floating, not pinned — 16px from the top on
mobile. `radius-xl`, `--border-strong`, `backdrop-filter: blur(24px)`, height 56px,
`padding: 8px`. Contains capsule children, one radius step smaller. That container-
rounded-rect-holding-capsules contrast is what makes the CTA read as interactive
and the bar read as chrome.

**Buttons.** `primary` (white fill, near-black label — the universal advance
action), `accent` (§5.2, one per screen), `ghost` (transparent + `--border`),
`action` (the poker decision bar: outlined pills, ≥44px, generous hit area).
Disabled reduces opacity of the enabled style — **never a different fill**, which
is the mistake that makes a disabled button out-contrast an enabled one.

**Cards.** `--surface-1`, `--border`, `radius-lg`, 20px padding. Optional gradient
top hairline on marketing surfaces only.

**Segmented control.** Soar's pattern: a `radius-full` track in `--surface-2`
holding a `radius-full` active chip inset by 4px, with 1px `--border-subtle`
dividers between inactive items.

**Inputs.** `--surface-3`, `radius-md`, 48px tall, ≥16px font size on mobile (below
that, iOS Safari zooms on focus).

---

## 7. Motion

| Token | Value |
|---|---|
| `instant` | 100ms |
| `fast` | 180ms |
| `base` | 260ms |
| `slow` | 420ms |
| `snappy` | spring, stiffness 400 / damping 30 |
| `smooth` | spring, 260 / 26 |
| `bouncy` | spring, 500 / 22 — card deals, grade badges |

`slow` (420ms) is the ceiling — nothing goes beyond it, and only a deliberate
full-screen transition should reach it at all. Everything respects
`prefers-reduced-motion` by collapsing to opacity-only. Staggers cap at 300ms
total regardless of item count — 169 range cells at 10ms each is 1.7s and reads
as broken.

---

## 8. Rules

1. **No hardcoded values.** Every color, radius, and spacing value comes from a
   token. Enforced by review; if you're typing a hex outside `globals.css`, stop.
2. **Blue is interface. Green-to-red is grading.** Neither borrows the other's
   range.
3. **The training canvas stays neutral.** No ambient glow behind data.
4. **Color is never the only signal.** Icon and word accompany every grade.
5. **Text never drops below `--text-tertiary`** (48% white).
6. **Set display type solid; let body breathe.** 1.0–1.1 versus 1.43–1.56.
7. **Containers get a fixed radius; interactive elements get capsules.**
8. **Tabular numerals on every number that changes.**
9. **44px minimum touch target.** Mobile is the primary target, not an adaptation.

---

## Settled in 0.2

- **Typeface** — Inter, self-hosted. TWK Lausanne dropped, see §2.
- **Grade-green hue** — `#2BD97C` validated and kept. It measures 10.87 on canvas
  and 8.58 on its own 12% fill; no adjustment was needed. Every one of the 51
  gated pairings passes, enforced by `tests/unit/contrast.test.ts`.
- **Label on an accent fill** — pure white (`--on-accent`), not `--text-primary`,
  which measured 4.24 and failed AA.

## Open decisions

- **The indigo→magenta top hairline** (§1) names two colours the system does not
  define. It currently runs `--accent-bright` → `--ambient-violet`, which uses
  only measured values. If a real magenta is wanted, it needs adding here first.
- **Grade border alpha** — the ramp specifies a solid and a 12% fill but not the
  border. It is 30%, chosen to read as an edge against the fill without becoming
  a second solid.
