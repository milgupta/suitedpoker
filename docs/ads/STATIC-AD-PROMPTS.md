# SuitedPoker — static ad system (ChatGPT image generation)

Companion to `SEEDANCE-AD-SYSTEM.md` (video). Built from the same Runout Poker
Ad Library teardown (Aug 2026), adapted for **statics generated with ChatGPT
(GPT-4o / gpt-image-1)** using reference images from the real product.

The Meta chrome (primary text, headline, CTA) is **frozen** and shared with the
video system — see `SEEDANCE-AD-SYSTEM.md` §1. These prompts produce the image
only.

---

## 0 · Rules that bind every static (inherited, non-negotiable)

1. **No dollar-denominated results.** bb and accuracy only. Prices are fine;
   winnings are never fine. No `$` glyph appears in any creative.
2. **No "casino", no "gambling", nothing implying money moves.** "Cash games",
   "big blinds", "stakes" are allowed.
3. **No invented app UI.** ChatGPT never draws a fake SuitedPoker screen. Ads
   2–5 are *stylized ad graphics* (cards, pills, questions) that share the
   product's palette but are clearly ad-land, not screenshots. Ad 1 shows the
   product via the **real reference screenshots** — composite them manually if
   the model redraws them (see §8).
4. **No fabricated social proof.** No testimonials, no star ratings, no "7M+
   players", no faces presented as customers.
5. **Every number in an ad must be true.** The three quiz answers used below
   are pure card math, verified in §9. Do not invent new numbers without doing
   the arithmetic.
6. **Blue is interface, green-to-red is grading.** Grade green `#2bd97c` never
   appears on a button, headline, or decoration in an ad.

---

## 1 · How to run it in ChatGPT

1. Start one chat. Attach all seven files from `docs/ads/reference/`:
   - `ref-01-drill-arena.png` — the arena: real card design, real action pills
   - `ref-02-grade-panel.png` — grade panel + bet-size pills
   - `ref-03-range-grid.png` — range grid (accent ramp)
   - `ref-04-table-sim.png` — the table oval + rim + seats
   - `ref-05-dashboard.png` — dashboard / leak report
   - `ref-06-brand-mark.png` — the spade tile (context only; not placed in ads)
   - `ref-07-palette.png` — swatch card with exact hexes
2. Paste the **master prompt** (§2) as your first message.
3. Then paste one **ad prompt** (§3–§7) per message. One ad per generation —
   don't batch.
4. Sizes: ChatGPT generates 1024×1024 (square) and 1024×1536 (portrait 2:3).
   Ask for the size named in each ad prompt, then crop per §8. Each prompt
   includes a layout map in % of canvas height so the composition survives the
   crop.

---

## 2 · Master prompt — paste once, first message

```text
You are art-directing a series of 5 static Meta ads for SuitedPoker, a
GTO poker trainer web app (6-max cash, 100 big blinds). I've attached 7
reference images: 5 real product screenshots, the brand mark, and a palette
card. Study them before generating anything. Every ad must look like it
belongs to the same product as those screenshots.

VISUAL SYSTEM — apply to every ad in this series:

Canvas: #07060d — near-black with a faint violet cast. Never pure #000000.
Lighting: one soft radial glow behind the hero object only — deep indigo
#0c1656 blending toward violet #2d0077 at the core, falling off to the canvas
color at all four corners. The glow is the only light source. No other
decoration, no patterns, no textures.

Typography: a heavy geometric grotesque (Inter/Helvetica Now class),
tight -2% tracking, sentence case. No exclamation marks, no emoji, no ALL
CAPS except inside small context chips. Headlines are TWO-TONE: the setup
clause in accent blue #5b8cff, the question/payoff clause in white #f4f5f8,
running continuously across line breaks. This replaces the metallic chrome
fill competitors use — flat two-tone, no gradient inside letterforms.

Playing cards: match ref-01 exactly. Pure white face #ffffff, very large
rank centered with the suit pip directly below it, one small corner index
top-left only (never bottom-right), softly rounded corners, subtle drop
shadow. Two-color deck: hearts and diamonds #d32f2f, spades and clubs
#14131c. Cards fan outward a few degrees. Face-down cards are #131a2e with
a fine diagonal hatch, as in ref-01.

Answer pills: match the real buttons in ref-01/ref-02. Fully rounded pill,
flat fill #1d1b29, 1px slightly lighter border, white semibold label,
generous padding. NO bevel, NO gloss. A "selected" pill gets a 2px #2f68ff
ring glow, like the Bet 33% pill in ref-02.

Context chips: small rounded-full chip, fill #15141f, uppercase
letterspaced label in muted gray #9aa0b4, items separated by a middle dot.

Color discipline: at least 35% of every canvas is the bare #07060d canvas.
Accent blue #2f68ff/#5b8cff is the only brand color. Red #d32f2f appears
only as suit pips (plus the Fold pill in ad 4, which uses #d63055). Green
NEVER appears anywhere.

NEVER include: logos, wordmarks, app icons, prices, dollar signs, star
ratings, App Store / Play Store badges, human faces, testimonials, arrows,
circles, emoji, urgency banners, or the words "casino", "gambling", "win
money". Do not invent app interface screenshots — only stylized ad
graphics, except where I explicitly tell you to reproduce an attached
screenshot.

Composition: nothing important in the top or bottom 6% of the canvas.
Follow the layout map I give with each ad (percent of canvas height).

Confirm you've studied the references, then wait for the first ad brief.
```

---

## 3 · Ad 1 — "Chess Puzzles" (product showcase · 4:5)

Analogy borrow — the slot Runout fills with "Duolingo but for poker". We own
the chess-puzzles frame (same analogy as the video system, §9 there).

```text
AD 1 of 5 — generate at 1024×1536 portrait. Design for a 4:5 center crop:
keep all content inside the central 4:5 area.

Layout map (% of canvas height):
 0–6%    bleed (empty canvas)
 6–23%   HOOK, centered, two lines:
         Line 1 (white #f4f5f8): "Chess puzzles,"
         Line 2 (accent #5b8cff): "but for poker."
         Line 2 is shorter — a ragged wedge pointing down into the phones.
23–100%  PRODUCT: two modern smartphones, each tilted 10–15° off vertical,
         overlapping, the left one cropped off the bottom edge so neither
         is fully contained. Screens glow softly against the dark.

The phone screens show the attached ref-01-drill-arena.png (front phone)
and ref-02-grade-panel.png (back phone). Reproduce these screenshots as
faithfully as you can — same layout, same colors, same text placement. Do
not invent different UI.

The radial indigo glow sits behind and below the phones. Corners fall to
#07060d. No logo, no caption, no CTA — the hook and the screens are the
entire ad.
```

> ⚠️ If the model mangles the screen contents (likely — image models redraw
> text), regenerate asking for **blank dark screens** (`#0e0d16`, faint glow)
> and composite the real PNGs onto the screens in Figma/CapCut afterwards.
> Rule §0.3 wins over convenience: shipped screens must be real pixels.

---

## 4 · Ad 2 — "The Open-Ender" (quiz open loop · 9:16)

The vertical quiz — Runout's #2 slot. Scene → question → stacked answers.

```text
AD 2 of 5 — generate at 1024×1536 portrait. This will be extended to 9:16;
design the layout map so the top and bottom bands can stretch.

Layout map (% of canvas height):
 0–45%   SCENE: a flop of three large playing cards in a row, drawn in the
         reference card style: 8♠ (spade #14131c), 9♦ (diamond #d32f2f),
         2♣ (club #14131c). Below them, slightly smaller and fanned, the
         hero's two cards: J♥ T♥ (hearts #d32f2f), with a small
         rounded-full badge labeled "YOU" in white on accent #2f68ff
         attached to the corner of the pair. Radial indigo glow centered
         behind the cards; scene fades vertically to solid #07060d by 55%
         so the text sits on clean canvas.
45–52%   CONTEXT CHIP, centered: "OPEN-ENDED DRAW · TWO CARDS TO COME"
52–72%   HOOK, centered, three lines, two-tone:
         "You flopped the open-ender." (accent #5b8cff)
         "How often does it get there" (white)
         "by the river?" (white)
72–94%   ANSWER STACK: three full-width rounded pills, stacked vertically
         with even gaps, in the reference pill style (#1d1b29 fill, white
         label): "17%", "31%", "45%". No pill is highlighted.
94–100%  bleed (empty canvas)

No other elements. The question is never answered anywhere in the image.
```

---

## 5 · Ad 3 — "Ace-King" (accusation hook · 1:1)

The square — hook-first, accusation grammar, the strongest pattern in the
teardown. Correct answer sits at the extreme, not the middle.

```text
AD 3 of 5 — generate at 1024×1024 square.

Layout map (% of canvas height):
 0–8%    bleed
 8–30%   HOOK, top-aligned, three lines, two-tone running mid-sentence:
         "You check when ace-king" (accent #5b8cff)
         "misses. How often does" (transitioning to white #f4f5f8)
         "that happen?" (white)
30–38%   CONTEXT CHIP, centered: "MISSES = NO ACE, NO KING ON THE FLOP"
38–72%   SCENE: two oversized playing cards, A♠ and K♦, fanned a few
         degrees apart, reference card style (giant centered rank, suit
         pip below, small top-left index). A♠ pip #14131c, K♦ pip
         #d32f2f. Soft radial indigo glow spotlights them; corners pure
         #07060d.
72–86%   ANSWER ROW: three rounded pills side by side, evenly spaced,
         reference pill style: "41%", "55%", "67%".
86–100%  bleed

The accusation must read as the first thing the eye lands on. No answer is
revealed anywhere.
```

---

## 6 · Ad 4 — "The Three-Bet" (scenario, binary · 9:16)

The situation-report slot: three facts, no question mark, a colour-coded
binary that makes every viewer form an opinion. Cash-game framing — our
product — not the tournament bubble.

```text
AD 4 of 5 — generate at 1024×1536 portrait, designed for 9:16 extension.

Layout map (% of canvas height):
 0–54%   SCENE: a poker table rendered in the style of
         ref-04-table-sim.png — a filled deep-indigo oval (radial
         #1d1b52-ish center falling to #0c1656 edge) with a doubled
         lighter rim, viewed slightly from above. Around the rim, small
         seat markers with tiny anonymous blue avatars as in the
         reference. In the pot area, a small white chip stack and a
         rounded pot pill reading "POT 28". At the near edge, the hero's
         two cards face-up and large: A♠ (pip #14131c) and Q♦ (pip
         #d32f2f), with a
         small "YOU · BUTTON" badge in white on accent #2f68ff. Across
         the table, one opponent seat highlighted with a violet chip
         reading "3-BET · 22".
54–74%   HOOK, centered, three lines, two-tone:
         "100 blinds deep." (white)
         "You open the button." (white)
         "The big blind three-bets." (accent #5b8cff)
         Scene fades to solid #07060d behind this text band.
74–80%   CONTEXT CHIP, centered: "CASH · 6-MAX · 100 BIG BLINDS"
80–95%   BINARY CTA: two large rounded pills side by side, equal width:
         left pill "Fold" — flat fill #d63055, white bold label;
         right pill "Call" — flat fill #2f68ff, white bold label.
         Same pill geometry as the reference buttons, no bevel.
95–100%  bleed

No question mark anywhere — the three facts and the two buttons carry all
the tension. No other text.
```

---

## 7 · Ad 5 — "Pocket Jacks" (simplest quiz · 4:5)

The stripped-down control: cards → chip → question → answers. Four elements,
nothing else. Correct answer is the middle option.

```text
AD 5 of 5 — generate at 1024×1536 portrait. Design for a 4:5 center crop.

Layout map (% of canvas height):
 0–6%    bleed
 6–40%   SCENE: two oversized playing cards only — J♠ and J♥ — fanned a
         few degrees, reference card style. J♠ pip #14131c, J♥ pip
         #d32f2f. A small "YOU" badge in white on accent #2f68ff at the
         pair's corner. Single soft radial indigo glow behind them,
         corners falling to #07060d. Nothing else in the scene.
40–52%   CONTEXT CHIP, centered: "POCKET JACKS · BEFORE THE FLOP"
52–80%   HOOK, centered, three lines, two-tone:
         "You've got pocket jacks." (accent #5b8cff)
         "How often does an overcard" (white)
         "hit the flop?" (white)
80–95%   ANSWER ROW: three rounded pills side by side, reference pill
         style: "33%", "57%", "78%".
95–100%  bleed

This is the most minimal ad of the set — resist adding anything. The
question is never answered in the image.
```

---

## 8 · After generation — before anything ships

1. **Crops.** 4:5 feed = center-crop the 2:3 portrait. 9:16 = extend the top
   and bottom bleed bands with flat `#07060d` in Figma (never stretch the
   art). 1:1 ships as generated.
2. **Ad 1 screens must be real.** If the generated phone screens differ from
   `ref-01`/`ref-02` in any legible way, mask the screens and composite the
   actual PNGs. An invented UI in an ad is a misrepresentation (rule §0.3).
3. **Text pass.** Image models corrupt small text. Re-set every headline,
   chip, and pill label in Figma with Inter over the generated art if
   anything is fuzzy — the layout maps above are the spec.
4. **Compliance scan** (same list the 9.6 audit enforces): no `$`, no
   "casino"/"gambling", no winnings claim, no green on non-grading elements,
   no invented testimonial, no logo.
5. **Meta chrome** — frozen, from `SEEDANCE-AD-SYSTEM.md` §1: primary texts A
   and B (each creative runs under both = 2 ads), headline
   `Fix your leaks in weeks`, CTA `Sign up`, destination `suitedpoker.com`
   (+ mirrored set at the onboarding quiz URL for winners).
6. **Naming**, per the account convention:
   `static-showcase-chesspuzzles-v1`, `static-quiz-openender-v1`,
   `static-quiz-aceking-v1`, `static-scenario-threebet-v1`,
   `static-quiz-pocketjacks-v1`.
7. **Thumbnail test.** At 120px wide the hook of ads 2–5 and the phones of
   ad 1 must still be identifiable. If not, the type is too small.

---

## 9 · The math behind the quiz answers (do not ship unverified numbers)

- **Ad 2 — open-ended straight draw completes by the river:**
  8 outs, 2 cards: 1 − (39/47 × 38/46) ≈ **31.5%** → pills 17 / **31** / 45,
  correct is the middle.
- **Ad 3 — ace-king misses the flop** (no ace, no king among 3 cards from the
  remaining 50, of which 44 are neither): (44·43·42)/(50·49·48) ≈ 67.6% →
  pills 41 / 55 / **67**, correct at the extreme.
- **Ad 5 — at least one overcard to jacks on the flop** (12 overcards among
  50): 1 − (38·37·36)/(50·49·48) ≈ **56.9%** → pills 33 / **57** / 78,
  correct is the middle.

Two middles and one extreme, mirroring the teardown's decoy geometry — no
option is obviously wrong, so the loop can't be closed without engaging.

**Ad 4 is verified against the served strategy set** (checked 2026-08-16):
`BTN:vs_3bet_BB` is servable (not quarantined), and the hero hand is
**A♠Q♦ — ace-queen OFFSUIT, deliberately** — the node plays AQo as a
genuine mix (fold 45% / call 55%), so the Fold/Call binary is honest,
exactly like the teardown's bubble ad. Do not "upgrade" it to AQs: the node
calls AQs 100%, and a binary over a pure call is a gotcha the product's own
grading would contradict. Numbers are all in chips, the app's display unit:
hero's open 5 + folded small blind 1 + 3-bet to 22 = **POT 28**; 22 chips
is the baseline 3-bet from `sizing.ts`; 200-chip stacks = the "100 blinds
deep" in the hook.
