# SuitedPoker — Meta video ad system (Seedance 2.5 + CapCut)

Built from the Runout Poker Ad Library teardown (Aug 2026). Five creatives,
one frozen copy set, in-depth director's-brief prompts, a b-roll capture
spec, and the Meta account structure.

---

## 0 · Claims policy (read before editing any script line)

1. **No dollar-denominated RESULTS anywhere.** bb/100 and accuracy only.
   **Prices are fine** — "coaches charging $300 an hour" is a price, not a
   result.
2. **No quantified win-rate/results claims, personal OR "product-level".**
   "My win rate 3x'd" and "it's boosted win rates by as much as 4x" fail the
   same way: the FTC treats "up to / as much as" claims as typical-results
   claims requiring substantiation, and no substantiation can exist — the
   product deliberately tracks no one's real-money win rate. A fake person
   reporting results ("helped me win SO much more") is additionally a
   fabricated testimonial under 16 CFR 465 (per-instance penalties — the
   rule `testimonials.ts` exists to respect). Runout's "+$4.2K profit"
   montage is their liability, not our precedent.
3. **The moment real cohort data exists, a hard number is legal.** Instrument
   accuracy improvement (already in the DB: `drill_attempts` over time). When
   "players improve accuracy N% in week one" is measurable, it goes in every
   hook. That number survives scale; a fabricated 4x does not.
4. **No "casino", no "gambling" outside a denial, nothing implying money
   moves.** Same list the 9.6 audit enforces.
5. **Seedance never renders the app UI.** Faces and rooms only. Every app
   segment is a real screen recording of suitedpoker.com.

### The hard-converting substitutes (use these, they punch)

| Type | Legal basis | Lines |
|------|------------|-------|
| Opinion superlative | Puffery | "the fastest way to fix your game I've EVER found" · "nothing else even comes close" |
| Mechanism outcome | True by construction for every user | "it found leaks I'd been repeating for years" · "it showed me exactly where I was bleeding chips" |
| Loss framing (bb) | Product's own cost model (`LEAK_BB100`) | "three fixable leaks can cost you five big blinds every hundred hands" |
| Status reframe | Non-factual identity claim | "the regs aren't smarter than you — they just knew the spot" |
| Effort collapse | Factual | "five minutes a day" (in every ad, like Runout) |
| Specific enemy + price | Factual price | "coaches charging three hundred an hour" |

### The hard-closer bank (10x energy, zero exposure)

The number attaches to the mechanism, the time, the persona's history, or the
enemy — never to winnings. Rotate these as closes and hooks:

- "I'm not the same player I was a month ago. Not even close."
- "Poker looks completely different now — like someone turned the lights on."
- "My home game thinks I hired a coach."
- "The regs at my table have no idea what happened."
- "It found three leaks in my first session. Three. In one session."
- "I'd been making the same mistake for six years. It caught it in ten
  minutes."
- "It graded four hundred of my decisions in a week. A coach couldn't do
  that in a year."
- "One leak was costing me five big blinds every hundred hands. ONE."
- "This taught me more than every training video I've ever watched.
  Combined."
- "Five minutes of this beats a two-hour YouTube video. And you do it every
  day."
- "Fastest I've ever improved at anything. Anything."
- "I've tried everything. Nothing else comes close."

---

## 1 · Frozen copy (the Meta chrome — never varies)

**Primary text A**
> The easiest way to improve your win rate is fixing the leaks you don't even
> realize you have.

**Primary text B**
> You don't need hours of study to get better at poker.
>
> 5–10 minutes a day is enough if you're training the right spots.

**Headline:** `Fix your leaks in weeks` · **CTA button:** `Sign up`
**Destinations:** `suitedpoker.com`, plus a mirrored ad per winner pointed
straight at the onboarding quiz (the web equivalent of Runout's
iOS/Android/web cloning).

---

## 2 · Production model: ONE continuous take per ad

The Runout edits reveal the trick: **the voice never stops — the picture cuts
away to app footage while the audio runs underneath.** So each UGC ad is:

1. **One continuous Seedance 2.5 take (24–30s)** of the avatar delivering the
   FULL script, generated from the in-depth prompt below.
2. In CapCut, **keep the entire audio track**, and cut the PICTURE away to
   screen recordings at the marked points. Hard cuts only. The avatar's lip
   sync only has to survive the on-camera windows.
3. Burned captions over everything (spec §10).

Why this beats stitching short takes: no identity/voice drift between
segments, no lip-sync joins, one retry loop, and pacing that breathes like a
real person because it IS one performance.

**Pre-production:** mint each avatar as a strong frontal still in Higgsfield
first; it rides as `@image1` (identity role, FIRST in the reference order).
Dialogue budget ~2.5–2.8 words/sec — the scripts below are counted. If a
brand name comes out mushy, respell phonetically: `"SOO-ted POH-ker"`.

---

## 3 · B-roll capture spec (do this FIRST)

All app footage is real. 390×844 ≈ 9:19.5, so a mobile screen recording fills
1080×1920 with a hair of crop. Record in Chrome device mode at 390×844 @60fps
(or an iPhone screen recording of Safari — better scroll physics), using the
fixture account from `npm run screenshots` so the dashboard has history.

Each clip 3–6s, each shows a **decision + a verdict** — never a UI tour:

| Clip | What to record | Used in |
|------|----------------|---------|
| `drill-correct` | spot dealt → tap best action → green grade + frequency capsules | 1, 2, 5 |
| `drill-mistake` | tap a wrong action → grade panel with EV loss in bb + explanation | 1, 2, 3 |
| `demo-hand` | the BB vs BTN-open demo spot (5-chip open pinned via `forceFacingChips`): deal → hold → answer → mixed-frequency verdict | 3 |
| `leak-report` | dashboard: accuracy by street, leak rows with bb/100 cost | 1, 2, 5 |
| `range-grid` | 169-cell reveal animation, then tap a cell | 4, 5 |
| `daily` | daily challenge streak + spoiler-free share grid | 5 |
| `diagnosis` | the 7.2b staged reveal (~2.4s) — already edited like an ad | 4, 5 |
| `sim-multiway` | table sim, multiway limped pot playing out | 4, 5 |
| `onboarding-q` | 2–3 quiz questions answered fast | 4 |

Never on screen: dollar figures, blank states, anything unanswered at clip
end.

---

## 4 · The five creatives

| # | Name | Format | Length | Face share | Hook type |
|---|------|--------|--------|-----------|-----------|
| 1 | Twenty Seconds | UGC bedroom desk | 30s | ~65% | Qualifier + time contract |
| 2 | Nobody Studies | UGC veteran + cards | 30s | ~60% | Contrarian negation + enemy list |
| 3 | Quick Quiz | UGC + full-bleed app | 30s | ~45% | Interactive open loop |
| 4 | They Knew the Spot | Text cards, **no human** | 28s | 0% | Status reframe |
| 5 | Chess Puzzles | UGC balcony + montage | 24s | ~35% | Analogy mashup |

---

## 5 · Ad 1 — "Twenty Seconds" · full Seedance 2.5 prompt

```text
A vertical 9:16 selfie-style UGC video, one continuous unbroken take, 30
seconds, filmed as if on a propped-up phone at eye level. Maintain the exact
facial identity from @image1 for the entire duration.

Subject: a white man in his early twenties with a short patchy beard,
realistic skin texture with visible pores across the nose and cheeks, slight
redness and natural unevenness, absolutely no smoothing or beauty filter. He
wears a backwards white cap, a light-blue zip hoodie half-zipped over a black
t-shirt, and a thin silver chain. He sits at a cluttered bedroom desk: a
monitor glowing slightly out of focus behind his left shoulder, four short
stacks of poker chips (red, blue, green, white) and a face-down deck of cards
in the foreground, a charging cable snaking across the desk, an open energy
drink can at frame right. Soft warm lamp light from camera-left throws
natural soft shadows across the right side of his face; a ceiling fan is
faintly visible top of frame. The room reads lived-in, not staged.

Camera: handheld-phone character throughout — subtle micro-shake as if the
phone is leaned against something imperfect, one brief autofocus hunt around
the 14-second mark, mild exposure pumping when he leans forward. No
stabilization, no zoom, no cuts, no camera moves.

Opening (0:00–0:04): He is already looking into the lens as the video starts,
slightly too close to camera the way people frame themselves on FaceTime. He
leans in a few inches, brows raised, eyes wide with direct energy, and says:
"If you play poker, give me twenty seconds — this is probably why you're
losing." His right hand comes up into frame, palm open toward the lens on
"twenty seconds."

The confession (0:04–0:14): His expression narrows, more confessional, he
talks faster and starts counting on his fingers at chest height, one finger
per item: "Most of my losses weren't big hands. They were small leaks.
Defending my blind wrong... calling three-bets I shouldn't... folding hands
that actually print." Between items he glances briefly down-left as if
remembering specific hands, then back to the lens. Natural filler pace,
slight shake of the head on the last item.

The turn (0:14–0:19): A small self-deprecating exhale, half-laugh, one hand
briefly touching the brim of his cap: "And I had no idea I was doing any of
it." Beat, one audible breath. "So now I do five minutes a day on this
trainer." On "this trainer" he taps the desk twice with two fingers.

The mechanism (0:19–0:26): Steadier now, matter-of-fact, using both hands to
frame a small box in the air: "It grades every single decision against the
actual solution — not somebody's opinion, the math — and it keeps dealing you
the exact spots you keep getting wrong." Small emphatic nod on "the exact
spots."

Close (0:25–0:30): He relaxes back an inch, half-smile, then gets a little
more serious than he's been the whole video, one hand flat on the desk:
"Honestly? I'm not the same player I was a month ago. Not even close." Holds
eye contact with the lens for a full beat after the last word, gives a tiny
upward nod, and the take ends.

Audio: his voice only, warm conversational American male in his early
twenties, intimate like talking to a friend, natural hesitations and breaths
exactly where written, no script-read cadence. Quiet room tone underneath, a
faint chip-stack clink when his hand brushes the desk at 0:17. No background
music, no text overlays, no captions, no logos, no watermarks, no color
grade, no cinematic look, no beauty retouching, no plastic skin.
```

**CapCut edit map (audio runs uncut, picture cuts away):**

| Time | Picture |
|------|---------|
| 0:00–0:19 | Seedance take (face) — the long hold IS the format |
| 0:19–0:24 | `drill-correct` full-bleed |
| 0:24–0:26 | `leak-report` |
| 0:26–0:30 | back to face for the close |

Captions per §10 throughout. No end card.

---

## 6 · Ad 2 — "Nobody Studies" · full Seedance 2.5 prompt

Runout's real champion archetype (54 days, three destinations): the veteran,
the enemy list, the only ad that names the brand aloud.

```text
A vertical 9:16 selfie-style UGC video, one continuous unbroken take, 30
seconds, framed head-and-shoulders with the camera slightly below eye level,
as if the phone is propped against something on the table. Maintain the exact
facial identity from @image1 for the entire duration.

Subject: a man of about fifty, short greying dark hair, clean-shaven, deep
natural smile lines and crow's feet, realistic weathered skin with visible
pores and slight sun damage on the forehead, no retouching of any kind. He
wears a plain dark-grey crew-neck t-shirt. He sits at a kitchen table in warm
afternoon light; beige vertical blinds hang slightly uneven behind him, the
corner of a refrigerator just visible at frame left. Spread face-up on the
table in the foreground are a few playing cards. In his hands, for the entire
video, is a red-backed deck of cards which he riffles, bridges, and cuts
one-handed with the unconscious, practiced fluency of someone who has
handled cards for thirty years — he never once looks down at them.

Camera: static but imperfect — the phone settles a millimeter in the first
second, faint micro-vibration when a truck passes outside around 0:20,
natural indoor exposure, no stabilization, no cuts, no zoom.

Opening (0:00–0:02): He looks flatly into the lens, mid-riffle, almost bored,
and says: "Nobody actually studies poker." No gesture. The riffle continues.

The enemy list (0:02–0:10): Gathering dry irritation, small head shakes
between items, brows rising on the price: "You've got solvers... training
sites... six-hour YouTube videos... coaches charging three hundred an hour."
The shuffling gets slightly sharper on each item, punctuating the list.

The micro-story (0:10–0:15): He stops shuffling for the first time in the
video. Stillness. He looks straight down the lens, quieter, and says: "And
after all of it — I still couldn't tell you if that river call last Tuesday
was right." A beat of silence. This is the emotional center of the ad; his
face stays neutral but the stillness carries it.

The turn (0:15–0:17): Decisive, calm, resuming a slow one-handed cut:
"That's why I use SuitedPoker."

The mechanism (0:17–0:26): Even, precise, the voice of a man explaining
something he respects: "You pick your play, and it shows you what the
solution actually does — and what the mistake cost you. In big blinds. Not
vibes." Short pause, one slow shake of the head. "It caught a mistake I'd
been making for twenty years. In the first session."

Close (0:26–0:30): He squares the deck, sets it down flat on the table with a
soft thack, gives one small shrug: "Five minutes a day. That's the whole
thing." Holds eye contact, done arguing, and the take ends.

Audio: low, dry, unhurried American male voice around fifty, a card-room
voice, natural pauses between the list items, the card riffle audible
underneath the whole read, the deck's thack landing at 0:26. Quiet kitchen
room tone. No background music, no text overlays, no captions, no logos, no
watermarks, no color grade, no beauty retouching, no plastic skin.
```

**CapCut edit map:**

| Time | Picture |
|------|---------|
| 0:00–0:17 | Seedance take (face) — hook, list, micro-story, brand |
| 0:17–0:22 | `drill-mistake` full-bleed |
| 0:22–0:26 | `leak-report` |
| 0:26–0:30 | back to face for the close |

Plus a CapCut opening sticker, 0:00–0:015: white rounded label, top of frame:
`Nobody actually studies poker` — the hook shown twice survives a muted
half-scroll. Captions sit **mid-frame** in this ad, clear of the card
business at the bottom.

---

## 7 · Ad 3 — "Quick Quiz" · full Seedance 2.5 prompt

The open loop: question at ~5s, answer withheld until ~15s. Our payoff beats
Runout's — the demo hand's verdict is a **mixed strategy**, so the reveal is
the product's thesis: "if you felt sure of one answer, that's the leak."

```text
A vertical 9:16 selfie-style UGC video, one continuous unbroken take, 30
seconds, chest-up, camera at a slightly low angle as if propped on a desk.
Maintain the exact facial identity from @image1 for the entire duration.

Subject: an East-Asian man of about twenty with wavy, slightly grown-out hair
with lighter dyed ends, realistic skin texture with visible pores and one or
two small blemishes, no smoothing. He wears a charcoal graphic t-shirt. He
sits at a desk against a plain warm-beige bedroom wall; the edge of an unmade
bed with a white pillow is visible at frame right, a deck of cards and a
short stack of paperback books sit on the desk in front of him. Natural
window daylight from frame left, soft shadows, nothing staged.

His entire performance is calm, near-deadpan, minimal movement, steady eye
contact — he is quizzing the viewer, not selling. The energy stays low on
purpose; small nods and micro-expressions only.

Opening (0:00–0:03): Already looking at the lens. One small upward nod:
"Quick quiz. What's your play here?" Nothing else moves.

Setting the spot (0:03–0:08): Even, unhurried, holding up one finger, then a
second, then a third as he lists the options: "You're in the big blind. The
button raises. Do you fold... call... or three-bet?"

The hold (0:08–0:15): He says, flatly: "Think about it." Then he goes quiet
for a full six seconds — leans back slightly, arms loosely crossed, holds
steady eye contact with the lens, one slow blink, the faintest hint of a
knowing expression, breathing visibly but saying nothing. He does not fidget
or look away. The silence is deliberate and unbroken.

The reveal (0:15–0:22): He leans forward a few inches, slightly more engaged
for the first time, index finger tapping the desk once: "If you picked one
answer and felt sure about it — that's the leak. The solution mixes." Beat.
"Sometimes it calls. Sometimes it raises. Feel is what you're missing."

The brand (0:22–0:27): Back to calm, one small open-palm gesture: "That's
why I use SuitedPoker. Real spots, graded against the actual solution — and
it keeps feeding you the ones you miss."

Close (0:27–0:30): Tiny shrug, deadpan, the ghost of a smile: "Five minutes a
day. These get automatic." Steady eye contact until the take ends.

Audio: a calm, low-energy male voice around twenty, American, unhurried,
almost monotone but warm, natural breath in the silent hold, no vocal fry
exaggeration. Quiet bedroom room tone, faint distant traffic. No background
music, no text overlays, no captions, no logos, no watermarks, no color
grade, no beauty retouching, no plastic skin.
```

**CapCut edit map (the silence is where the app lives):**

| Time | Picture |
|------|---------|
| 0:00–0:03 | face (+ small CapCut sticker upper-left: `Quick poker quiz`) |
| 0:03–0:08 | `demo-hand` dealt, unanswered, full-bleed — UI is legible, no captions needed |
| 0:08–0:11 | face — "Think about it," then silence |
| 0:11–0:15 | `demo-hand` still held, untouched — dead air holds the tension |
| 0:15–0:18 | face — the reveal begins |
| 0:18–0:22 | `demo-hand` answered: the mixed-frequency verdict panel |
| 0:22–0:25 | face — brand |
| 0:25–0:28 | `drill-mistake` |
| 0:28–0:30 | face — close |

---

## 8 · Ad 4 — "They Knew the Spot" (non-human, ~28s, no Seedance)

Built entirely in CapCut over real app footage: the format break, sound-off
native, zero casting, five-minute iteration. Carries the strongest line in
Runout's account — a status reframe, not a feature: losing isn't lack of
talent (shameful, unfixable), it's lack of information (fixable,
purchasable).

| Time | Text card (heavy sans, white, centered) | Under it |
|------|------------------------------------------|----------|
| 0:00–0:02.5 | The regs beating you aren't smarter than you. | `sim-multiway`, dimmed 40% |
| 0:02.5–0:05 | They just knew the spot. | same clip, pot being pushed |
| 0:05–0:08.5 | You've played for years. Same leaks. Same spots. | `drill-mistake` verdict, dimmed |
| 0:08.5–0:11.5 | The table will never teach you. | table clip fading down |
| 0:11.5–0:13 | This will. | hard cut to full-brightness app |
| 0:13–0:26 | *(no text)* | raw run: `drill-correct` → `drill-mistake` → `leak-report` → `range-grid` → `diagnosis`, ~2.5s each, hard cuts |
| 0:26–0:28 | End card: spade mark + `suitedpoker.com` + "Find your leaks." | — |

No bounce presets, no emoji, no color pops; simple write-on or none. The
dim→bright cut at 0:11.5 is the ad's one deliberate jolt (their paper→app
cut). Only ad with an end card — there's no face to close it.

**This is the hook lab.** Freeze beats 3–7, swap card 1 weekly:
"Nobody tells you this about poker." / "10 years in. No better." / "You
don't have a poker problem. You have three spots." / "Three leaks can cost
you five big blinds every hundred hands."

---

## 9 · Ad 5 — "Chess Puzzles" · full Seedance 2.5 prompt

Runout owns "Duolingo × WSOP" — don't contest it. The adjacent model this
audience already holds is **chess puzzles**: bite-size positions, instant
verdict, rating climbs. Verbal only — no logo cards (their flying-in-the-owl
is a trademark risk we skip). Inverted structure: face bookends, montage
body, the only UGC ad with a spoken CTA.

```text
A vertical 9:16 selfie-style UGC video, one continuous unbroken take, 24
seconds, chest-up, handheld at arm's length so the frame sways naturally
with his arm. Maintain the exact facial identity from @image1 for the entire
duration.

Subject: a man in his mid-twenties, athletic build, short dark hair, light
stubble, realistic skin with visible pores and a slight sheen of daylight
warmth, no retouching. He wears a plain dark athletic tee and a thin silver
chain. He stands on an apartment balcony in bright late-morning daylight:
green potted plants at frame left, out-of-focus city apartment blocks
behind him, a hint of wind moving his shirt. The sunlight causes one brief,
natural exposure pump when he shifts his weight.

Camera: true handheld selfie — the frame breathes with his arm, small
corrections, a slight tilt he never fixes. No stabilization, no cuts.

Opening (0:00–0:05): High energy from frame one — he grins, claps once, and
says with momentum: "If chess puzzles and a poker solver had a baby — it'd
be SuitedPoker." Eyebrows up on the brand name, a beat of a proud nod, as if
he came up with the comparison himself.

The rundown (0:05–0:18): Still walking-pace energy, counting quickly on his
fingers, talking to the lens like a friend who won't let you leave without
hearing this: "Real spots. Graded instantly against the full solution. It
explains every mistake — and it finds the leaks you don't even know you
have." Short breath. "Then it just keeps drilling them until they're gone."
His free hand chops lightly on "keeps drilling them."

The CTA (0:17–0:24): Half a step closer to the lens, more sincere for one
beat: "This taught me more than every video I've ever watched." Then the
grin returns and he points once directly into the lens: "Stop paying for
coaching. Go to suitedpoker dot com." He holds the point for a beat, then
drops the hand, still smiling, and the take ends.

Audio: bright, energetic mid-twenties American male voice, genuinely upbeat
without shouting, wind faintly audible, distant city ambience, a single
clap landing at 0:01. No background music, no text overlays, no captions,
no logos, no watermarks, no color grade, no beauty retouching, no plastic
skin.
```

**CapCut edit map:**

| Time | Picture |
|------|---------|
| 0:00–0:05 | face — analogy hook |
| 0:05–0:18 | montage over his audio, ~9 clips × 1.4s, hard cuts: `drill-correct` "real spots, not theory" → `demo-hand` verdict "graded against the solution" → `drill-mistake` "explains every mistake" → `leak-report` "finds your leaks" → `range-grid` "the full range, every spot" → `daily` "a new challenge daily" → `diagnosis` "see exactly where you lose" → `sim-multiway` "play full sessions" → dashboard "watch your accuracy climb" |
| 0:18–0:24 | face — CTA, with burned text under him on the final beat: `suitedpoker.com` |

---

## 10 · Caption system (CapCut, ads 1/2/3/5)

Copy Runout's spec — deliberately plain so it reads as auto-captions:

- Burned-in, white sans-serif, hard drop shadow, no plate (test the opaque
  plate later, like their Ad D).
- 3–5 words per card, new card every ~1.2–1.5s.
- No karaoke word-pop, no emoji, no color highlights, no animation.
- Lower-third — except ad 2 (mid-frame, clear of the card shuffling).
- Generate with CapCut auto-captions from the Seedance audio, fix errors by
  hand. Proofread, but don't over-polish.
- Hard cuts only. No transitions, no music, no LUT, no logo bug.
- Export 1080×1920 high bitrate; Meta's ~365kbps recompression does half the
  low-fi work for you.

Note on the baked-overlay style (the fitness example): baking text into the
generation works for exercise-name overlays but is wrong for talking-head
UGC — burned CapCut captions stay editable, re-syncable, and let you swap a
hook without regenerating video. Keep "no text overlays" in every Seedance
prompt.

---

## 11 · Meta account structure

- **One Advantage+ Sales campaign, optimized for Purchase** — the
  server-side `purchase_completed` + CAPI dedup exists for exactly this.
  Never optimize for link clicks.
- All five creatives in one ad set; each runs under primary text A AND B as
  two ads (copy A/B with zero creative confound — Runout's slots-2-vs-4
  trick).
- Winners get a duplicate pointed at the onboarding quiz URL.
- Naming: `[format]-[avatar]-[hook]-v#` → `ugc-vet-nobodystudies-v1`.
- **Weekly cadence — the test Runout isn't running:** regenerate ONLY the
  opening seconds of a winning take with a new hook line, keep everything
  after the first cut identical. Hook-only variants are the
  highest-leverage cheap test in the system. Ad 4's text card is the same
  test at zero generation cost.
- Before scaling: confirm production Meta events still arrive post-deploy
  (the environment gate fails closed — misconfiguration presents as
  silence), and stand up the second Supabase project so e2e runs stop
  writing users into the funnel these ads are measured against.
- **Instrument the accuracy-improvement cohort stat now** (§0.3) — it is the
  legal hard number every future hook wants.

## 12 · What Runout leaves on the table (our free wins)

1. **Hook-only variants** — §11, we run them weekly.
2. **An end card on the non-human ad** — ad 4 has one; UGC ads stay bare
   (the anti-polish read is worth more there).
3. **Social proof** — they show none; we can't show testimonials yet (FTC,
   empty by design), but product FACTS are allowed as caption lines:
   "every spot graded against the full solution" · "all 169 hands, every
   spot" — true today, no person invented, no result claimed.
