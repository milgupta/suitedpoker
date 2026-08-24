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

1. **One continuous Seedance 2.5 take (20s)** of the avatar delivering the
   FULL script, generated from the in-depth prompt below. 20s is the
   cost-efficient test length — every archetype launches at 20s, and only a
   proven winner earns a 30s extended regeneration (same avatar still,
   longer script).
2. In CapCut, **keep the entire audio track**, and cut the PICTURE away to
   screen recordings at the marked points. Hard cuts only. The avatar's lip
   sync only has to survive the on-camera windows.
3. Burned captions over everything (spec §10).

Why this beats stitching short takes: no identity/voice drift between
segments, no lip-sync joins, one retry loop, and pacing that breathes like a
real person because it IS one performance.

**Launch order (start with 3 human ads):** Ad 1 (peer confessional — the
top-ranked archetype), Ad 2 (veteran — the proven champion), Ad 3 (quiz —
the format no competitor can copy). Three avatars spanning the demographic
range: early-20s / fifty / student. Ads 4 and 5 join round two — ad 4 costs
nothing whenever you want a fourth.

**Pre-production:** mint each avatar as a strong frontal still (ChatGPT
image gen works — prompts in §2b); it rides as `@image1` (identity role,
FIRST in the reference order).
Dialogue budget ~2.5–2.8 words/sec — the scripts below are counted.

**Brand pronunciation:** always write it as TWO dictionary words in spoken
dialogue — `"Suited Poker"`, never `"SuitedPoker"` and never a phonetic
respelling like "sootid" (an invented word makes the model guess, which is
how "suired" happens; a dictionary word cannot be mispronounced). Also add
to the Audio paragraph: `He pronounces "Suited" exactly like the ordinary
English word — SOO-tid, rhymes with "booted".` If a take still garbles it,
don't re-roll: cover that beat with b-roll picture and splice the word in
the audio (no lip-sync to match under b-roll), or use 2.5 region editing on
just that beat.

---

## 2b · Identity reference prompts (ChatGPT image gen)

Generate the avatar still BEFORE any video. Ask for 3–4 variations, pick the
sharpest fully-frontal one, and use that SAME image as `@image1` for every
take and retry of that ad — a new still is a new person. Match the still's
room and light to the video prompt so Seedance isn't reconciling two
environments.

**Ad 1 avatar (the peer):**

```text
A candid photorealistic photo that looks like it was taken on an iPhone
front camera at night, vertical portrait orientation. An ordinary-looking
white man in his early twenties — average, slightly asymmetrical face,
NOT a model, the kind of guy you'd scroll past — with a short patchy
uneven beard, realistic skin with visible pores, slight oiliness on the
forehead and nose, a couple of small blemishes, natural redness around
the nostrils. Absolutely no retouching, no beauty filter, no smoothing.
He wears a backwards white baseball cap with a slightly dirty brim, a
light-blue zip hoodie half-zipped over a black t-shirt, and a thin silver
chain. He sits at a cluttered bedroom desk: a computer monitor glowing
slightly out of focus behind his left shoulder, poker chips in messy
UNEVEN stacks of different heights with several loose chips scattered
around them, a face-down deck of cards askew, a charging cable across the
desk, an aluminum drink can with its label turned away from the camera.
No readable text or logos anywhere in the image — not on the can, not on
clothing, not on the screen. Flat, slightly dim indoor lighting the way a
phone front camera renders a room at night: mildly underexposed, soft
shadows, visible sensor noise in the dark areas, white balance slightly
too warm. A ceiling fan faintly visible at the top of frame. Framed
chest-up at eye level, leaning slightly toward the camera the way people
frame themselves on a video call, looking directly into the lens with a
friendly, direct expression. This should look like a real unremarkable
photo from someone's camera roll — not a studio portrait, not cinematic,
no color grade, no vignette, not stock photography.
```

**Ad 2 avatar (the veteran):**

```text
A candid photorealistic photo that looks like it was taken on an iPhone
front camera, vertical portrait orientation. An ordinary-looking man of
about fifty — average, slightly asymmetrical face, NOT a distinguished
actor type — with short greying dark hair thinning slightly at the
temples, clean-shaven with faint stubble shadow, deep uneven smile lines
and crow's feet, realistic weathered skin with visible pores, slight sun
damage and small age spots on the forehead. Absolutely no retouching, no
beauty filter, no smoothing. He wears a plain dark-grey crew-neck t-shirt
with slightly stretched collar. He is seated at a kitchen table in
ordinary afternoon light, beige vertical blinds hanging slightly uneven
behind him with one slat askew, the corner of a refrigerator just visible
at the left edge. In his hands is a red-backed deck of playing cards
mid-shuffle, and a few playing cards lie in a loose, careless spread on
the table in front of him — not arranged. No readable text or logos
anywhere in the image. Framed head and shoulders, camera slightly below
eye level, looking directly into the lens with a flat, almost bored
expression. Flat phone-camera exposure: no dramatic shadows, white
balance slightly warm, mild sensor noise, ordinary phone-photo color —
this should look like a real unremarkable photo someone took at home, not
a studio portrait, not cinematic, no color grade, no vignette, not stock
photography.
```

**Ad 3 avatar (the quiz kid):**

```text
A candid photorealistic photo that looks like it was taken on an iPhone
front camera, vertical portrait orientation. An ordinary-looking
East-Asian man of about twenty — average, slightly asymmetrical face, NOT
a model or idol type — with wavy, slightly greasy grown-out hair with
unevenly faded lighter dyed ends, realistic skin with visible pores,
mild acne on one cheek and around the jaw, slightly chapped lips. No
retouching, no beauty filter, no smoothing. He wears a charcoal t-shirt
with a faded abstract print that contains no readable text or letters. He
sits at a desk against a plain warm-beige bedroom wall with a few small
scuff marks, the edge of an unmade bed with a wrinkled white pillow
visible at the right side of the frame, a deck of playing cards sitting
slightly askew and a short messy stack of paperback books with their
spines turned away from the camera on the desk in front of him. No
readable text or logos anywhere in the image. Framed chest-up from a
slightly low camera angle, as if the phone is propped on the desk. He
looks directly into the lens with a calm, near-deadpan expression, steady
eye contact, the faintest hint of knowing something you don't. Flat
natural window daylight from the left the way a phone renders it: soft
shadows, slightly clipped highlights on the wall, mild sensor noise,
white balance a touch warm — a real unremarkable bedroom photo from
someone's camera roll, not a studio portrait, not cinematic, no color
grade, no vignette, not stock photography.
```

(Ad 5's avatar: build the same way from its casting paragraph in §9 when
round two starts. Ad 4 needs no human.)

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
| 1 | Twenty Seconds | UGC bedroom desk | 20s | ~70% | Qualifier + time contract |
| 2 | Nobody Studies | UGC veteran + cards | 15s | ~75% | Contrarian negation + enemy list |
| 3 | Quick Quiz | UGC + full-bleed app | 20s | ~50% | Interactive open loop |
| 4 | They Knew the Spot | Text cards, **no human** | 28s | 0% | Status reframe |
| 5 | Chess Puzzles | UGC balcony + montage | 20s | ~60% | Analogy mashup |

---

## 5 · Ad 1 — "Twenty Seconds" · full Seedance 2.5 prompt

```text
A vertical 9:16 selfie-style UGC video, one continuous unbroken take, 20
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
the 8-second mark, mild exposure pumping when he leans forward. No
stabilization, no zoom, no cuts, no camera moves.

Caption overlay, on screen for the entire video: burned-in auto-caption
style subtitles, exactly like TikTok auto-captions. Plain white bold
sans-serif text with a soft black drop shadow, no background box, no
outline. Always a single line, centered horizontally, positioned at chest
height about two-thirds of the way down the frame — below his face, above
the desk. Only ONE caption card visible at a time; each card instantly
replaces the previous one in the same fixed position, perfectly synced to
the spoken words. No animation, no word-by-word pop-in, no karaoke
highlighting, no emoji. The caption text must be spelled exactly as written
in the card lists below, word for word.

Opening (0:00–0:03): He is already looking into the lens as the video starts,
slightly too close to camera the way people frame themselves on FaceTime. He
leans in a few inches, brows raised, eyes wide with direct energy, and says:
"If you play poker — give me twenty seconds. This is why you're losing." His
right hand comes up into frame, palm open toward the lens on "twenty
seconds."
Caption cards: 0:00 "If you play poker" — 0:01 "give me twenty seconds" —
0:02 "this is why you're losing"

The leaks (0:03–0:09): His expression narrows, more confessional, he talks
faster and counts on his fingers at chest height, one finger per item: "It's
not big hands. It's small leaks — blind defense, bad three-bet calls, folding
hands that print." Between items he glances briefly down-left as if
remembering specific hands, then back to the lens, a slight shake of the
head on the last item.
Caption cards: 0:03 "it's not big hands" — 0:04.5 "it's small leaks" —
0:06 "blind defense" — 0:07 "bad three-bet calls" —
0:08 "folding hands that print"

The mechanism (0:09–0:15): A small self-deprecating exhale, then steadier,
matter-of-fact, using both hands to frame a small box in the air: "This
trainer grades every decision against the actual solution — then keeps
dealing you the spots you miss." He taps the desk twice with two fingers on
"this trainer."
Caption cards: 0:09 "this trainer grades" — 0:10.5 "every decision against"
— 0:12 "the actual solution" — 0:13 "then keeps dealing you" —
0:14 "the spots you miss"

Close (0:15–0:20): He relaxes back an inch, half-smile, then gets a little
more serious than he's been the whole video, one hand flat on the desk:
"Five minutes a day. I'm not the same player I was a month ago." Holds eye
contact with the lens for a full beat after the last word, gives a tiny
upward nod, and the take ends.
Caption cards: 0:15 "five minutes a day" — 0:16.5 "I'm not the same player"
— 0:18 "I was a month ago"

Audio: his voice only, warm conversational American male in his early
twenties, intimate like talking to a friend, natural hesitations and breaths
exactly where written, no script-read cadence. Quiet room tone underneath, a
faint chip-stack clink when his hand brushes the desk at 0:13. No background
music, no logos, no watermarks, no color grade, no cinematic look, no
beauty retouching, no plastic skin. No text on screen other than the
caption cards specified above — no emoji, no titles, no watermark text.
```

**CapCut edit map (audio runs uncut, picture cuts away):**

| Time | Picture |
|------|---------|
| 0:00–0:09 | Seedance take (face) — the long hold IS the format |
| 0:09–0:13 | `drill-correct` full-bleed |
| 0:13–0:15 | `leak-report` |
| 0:15–0:20 | back to face for the close |

Captions per §10 throughout. No end card.

---

## 6 · Ad 2 — "Nobody Studies" · full Seedance 2.5 prompt

Runout's real champion archetype (54 days, three destinations): the veteran,
the enemy list, the only ad that names the brand aloud.

```text
A vertical 9:16 selfie-style UGC video, one continuous unbroken take, 15
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
second, faint micro-vibration when a truck passes outside around 0:10,
natural indoor exposure, no stabilization, no cuts, no zoom.

Caption overlay, on screen for the entire video: burned-in auto-caption
style subtitles, exactly like TikTok auto-captions. Plain white bold
sans-serif text with a soft black drop shadow, no background box, no
outline. Always a single line, centered horizontally, positioned slightly
above the vertical center of the frame — higher than typical captions, so
it stays clear of his hands and the cards at the bottom of frame. Only ONE
caption card visible at a time; each card instantly replaces the previous
one in the same fixed position, perfectly synced to the spoken words. No
animation, no word-by-word pop-in, no karaoke highlighting, no emoji. The
caption text must be spelled exactly as written in the card lists below,
word for word.

Opening (0:00–0:02): He looks flatly into the lens, mid-riffle, almost bored,
and says: "Nobody actually studies poker." No gesture. The riffle continues.
Caption card: 0:00 "Nobody actually studies poker"

The enemy list (0:02–0:04.5): Gathering dry irritation, small head shakes
between items, brows rising on the price: "Solvers... training sites...
three-hundred-dollar coaches." The shuffling gets sharper on each item,
punctuating the list.
Caption cards: 0:02 "solvers, training sites" —
0:03.2 "three-hundred-dollar coaches"

The micro-story (0:04.5–0:08.5): He stops shuffling for the first time in
the video. Stillness. He looks straight down the lens, quieter, and says:
"And I still couldn't tell you if that river call last Tuesday was right."
This is the emotional center of the ad; his face stays neutral but the
stillness carries it.
Caption cards: 0:04.5 "and I still couldn't tell you" —
0:06 "if that river call" — 0:07.3 "last Tuesday was right"

The turn (0:08.5–0:12): One slow shake of the head, then decisive and calm,
resuming a slow one-handed cut: "Suited poker caught a mistake I'd been
making for twenty years."
Caption cards: 0:08.5 "Suited Poker caught a mistake" —
0:10.3 "I'd been making for twenty years"

The CTA (0:12–0:15): He squares the deck and sets it down flat on the table
with a soft thack, then looks straight into the lens, direct and final:
"Start getting better at poker — today." Holds eye contact, done arguing,
and the take ends.
Caption cards: 0:12 "start getting better at poker" — 0:13.5 "today"

Audio: low, dry, unhurried American male voice around fifty, a card-room
voice, natural pauses between the list items, the card riffle audible
underneath the whole read, the deck's thack landing at 0:12. Quiet kitchen
room tone. He pronounces "suited" exactly like the ordinary English word —
as in "a suited hand" — SOO-tid, rhymes with "booted", never "soo-ird" or
"suired". No background music, no logos, no
watermarks, no color grade, no beauty retouching, no plastic skin. No text
on screen other than the caption cards specified above — no emoji, no
titles, no watermark text.
```

**CapCut edit map:**

| Time | Picture |
|------|---------|
| 0:00–0:08.5 | Seedance take (face) — hook, enemy list, micro-story |
| 0:08.5–0:12 | mistake-verdict screenshot full-bleed — the twenty-years line runs underneath |
| 0:12–0:15 | face — CTA (deck set down, direct to lens) |

Plus a CapCut opening sticker, 0:00–0:015: white rounded label, top of frame:
`Nobody actually studies poker` — the hook shown twice survives a muted
half-scroll. Captions sit **mid-frame** in this ad, clear of the card
business at the bottom.

---

## 7 · Ad 3 — "Quick Quiz" · full Seedance 2.5 prompt

The open loop: question at ~4s, answer withheld until ~11s. Our payoff beats
Runout's — the demo hand's verdict is a **mixed strategy**, so the reveal is
the product's thesis: "if you felt sure of one answer, that's the leak."

```text
A vertical 9:16 selfie-style UGC video, one continuous unbroken take, 20
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

Caption overlay, on screen for most of the video: burned-in auto-caption
style subtitles, exactly like TikTok auto-captions. Plain white bold
sans-serif text with a soft black drop shadow, no background box, no
outline. Always a single line, centered horizontally, positioned at chest
height about two-thirds of the way down the frame — below his face, above
the desk. Only ONE caption card visible at a time; each card instantly
replaces the previous one in the same fixed position, perfectly synced to
the spoken words. No animation, no word-by-word pop-in, no karaoke
highlighting, no emoji. During the silent hold (0:07–0:11) NO caption is
shown — the screen is completely clean of text. The caption text must be
spelled exactly as written in the card lists below, word for word.

Opening (0:00–0:02.5): Already looking at the lens. One small upward nod:
"Quick quiz. What's your play here?" Nothing else moves.
Caption cards: 0:00 "Quick quiz" — 0:01 "what's your play here"

Setting the spot (0:02.5–0:07): Even, unhurried, holding up one finger, then
a second, then a third as he lists the options: "Big blind. The small blind
opens. Do you fold... call... or raise? Think about it."
Caption cards: 0:02.5 "big blind" — 0:03.5 "the small blind opens" —
0:04.5 "do you fold, call" — 0:05.5 "or raise" —
0:06.3 "think about it"

The hold (0:07–0:11): He goes quiet for a full four seconds — leans back
slightly, arms loosely crossed, holds steady eye contact with the lens, one
slow blink, the faintest hint of a knowing expression, breathing visibly but
saying nothing. He does not fidget or look away. The silence is deliberate
and unbroken.
Caption: none — no caption card is shown from 0:07 to 0:11; the screen is
clean of text for the entire silence.

The reveal (0:11–0:15): He leans forward a few inches, slightly more engaged
for the first time, index finger tapping the desk once: "If you felt sure of
one answer — that's the leak. The solution mixes."
Caption cards: 0:11 "if you felt sure" — 0:12 "of one answer" —
0:13 "that's the leak" — 0:14 "the solution mixes"

The brand (0:15–0:18): Back to calm, one small open-palm gesture: "That's
why I use suited poker. Real spots, graded instantly."
Caption cards: 0:15 "that's why I use Suited Poker" —
0:16.5 "real spots, graded instantly"

The CTA (0:18–0:20): A tiny shrug and the ghost of a smile, still deadpan:
"Start getting better at poker — today." Steady eye contact until the take
ends.
Caption cards: 0:18 "start getting better" — 0:19 "at poker today"

Audio: a calm, low-energy male voice around twenty, American, unhurried,
almost monotone but warm, natural breath in the silent hold, no vocal fry
exaggeration. Quiet bedroom room tone, faint distant traffic. No background
music, no logos, no watermarks, no color grade, no beauty retouching, no
plastic skin. He pronounces "suited" exactly like the ordinary English
word — as in "a suited hand" — SOO-tid, rhymes with "booted", never
"soo-ird" or "suired". No text on screen other than the caption cards
specified above — no emoji, no titles, no watermark text.
```

**CapCut edit map (the silence is where the app lives):**

| Time | Picture |
|------|---------|
| 0:00–0:02.5 | face (+ small CapCut sticker upper-left: `Quick poker quiz`) |
| 0:02.5–0:07 | `demo-hand` dealt, unanswered, full-bleed — UI is legible, no captions needed |
| 0:07–0:09 | face — the silent stare |
| 0:09–0:11 | `demo-hand` still held, untouched — dead air holds the tension |
| 0:11–0:14 | face — the reveal |
| 0:14–0:17 | `demo-hand` answered: the mixed-frequency verdict panel |
| 0:17–0:20 | face — brand + close |

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
A vertical 9:16 selfie-style UGC video, one continuous unbroken take, 20
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

Opening (0:00–0:04): High energy from frame one — he grins, claps once, and
says with momentum: "If chess puzzles and a poker solver had a baby — it'd
be SuitedPoker." Eyebrows up on the brand name, a beat of a proud nod, as if
he came up with the comparison himself.

The rundown (0:04–0:12): Still walking-pace energy, counting quickly on his
fingers, talking to the lens like a friend who won't let you leave without
hearing this: "Real spots. Graded instantly. It explains every mistake — and
finds the leaks you don't even know you have." His free hand chops lightly
on "every mistake."

The CTA (0:12–0:20): Half a step closer to the lens, more sincere for one
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
| 0:00–0:04 | face — analogy hook |
| 0:04–0:12 | montage over his audio, 6 clips × ~1.3s, hard cuts: `drill-correct` "real spots, not theory" → `demo-hand` verdict "graded against the solution" → `drill-mistake` "explains every mistake" → `leak-report` "finds your leaks" → `range-grid` "the full range, every spot" → `diagnosis` "see exactly where you lose" |
| 0:12–0:20 | face — CTA, with burned text under him on the final beat: `suitedpoker.com` |

---

## 10 · Caption system

**Update: ads 1–3 now BAKE the captions into the Seedance generation** (a
caption-overlay block + timed card lists live in each prompt; CapCut
auto-captions went behind Pro). The spec below still governs how captions
must look, and free CapCut text layers remain the patch tool for two jobs:
covering any garbled baked card, and captioning the b-roll cutaways, where
the baked captions don't exist.

Copy Runout's spec exactly — deliberately plain so it reads as auto-captions.
Measured off their Ad A frame:

**Placement (the spacing):**

- **Vertical: caption line centered at ~68% down the frame** — chest height,
  below the face, above the desk/props. On a 1920px-tall export that's the
  text block centered around y ≈ 1300. In CapCut: drag the caption down
  until it sits at the speaker's chest, clearly below the chin, clearly
  above the bottom fifth. This also keeps it out of the bottom ~20% where
  Meta's own UI (CTA button, profile chrome) overlaps the video.
- **Horizontal: dead center.** Single line only — a 4-word card should span
  roughly 35–55% of the frame width. If a card would wrap to two lines, it
  has too many words; split it.
- **Ad 2 exception: mid-frame (~55% down)**, clear of the card-shuffling
  business at the bottom of its frame.
- Same position over EVERY shot — face and app b-roll alike. The caption
  never moves; it acts as the continuity thread across the hard cuts.

**Type style:**

- Pure white, medium/semibold rounded sans (CapCut's default caption font
  is fine; Montserrat Medium if choosing). Text height ≈ 2.5–3% of frame
  height (~48–55px at 1080×1920).
- **Soft black drop shadow, no plate, no stroke**: shadow opacity ~70%,
  small downward offset, medium blur — enough to survive a white
  background, invisible as an effect.
- Sentence case. No punctuation at card ends. No emoji, no color
  highlights, no karaoke word-pop, no animation, no per-word bounce.

**Cadence (what makes it read as captions, not titles):**

- 3–5 words per card, new card every ~1.2–1.5s, cut on the natural speech
  rhythm from the Seedance audio.
- **Cards break mid-phrase, not at sentence boundaries** — "even realise I
  was" is a correct card. Auto-caption engines split on timing, not
  grammar; that's the artifact that sells it. CapCut auto-captions produce
  this naturally — generate from the audio, fix mishears by hand, keep the
  awkward splits.
- No captions during ad 3's silent hold — nothing is spoken; a clean frame
  reads better and the silence is the device.

**Everything else:**

- Hard cuts only. No transitions, no music, no LUT, no logo bug.
- Export 1080×1920 high bitrate; Meta's ~365kbps recompression does half
  the low-fi work for you.

## 10b · CapCut degradation pass (kills the AI look — run on every UGC ad)

Applied to the Seedance footage before captions, in this order:

1. Scale ~104% with a tiny slow position drift, or CapCut's handheld effect
   at lowest intensity — layered on top of Seedance's own micro-shake.
2. Grain/noise ~10%: night-time front-camera sensor texture.
3. Grade toward PHONE, not cinema: shadows lifted slightly, contrast down a
   touch, warmth up, any teal cast in the shadows removed. AI stills/video
   ship with a cinematic grade; auto white balance doesn't look like that.
4. Slight sharpness reduction.

Identity-still hygiene (feeds the same goal): reject or re-roll references
with model-perfect faces, staged/sorted props, readable object text (AI
pseudo-text is the #1 tell and Seedance re-renders it), or sculpted
cinematic lighting. Add "no readable text on any object" to every video
prompt.

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

## 13 · The 3×4 test matrix (12 cells, one variable per core)

Each core idea freezes its body and varies exactly ONE thing across 4
variations. Read: Core 1 answers WHO the messenger is, Core 2 answers WHICH
HOOK pulls, Core 3 answers WHICH PAIN bites. Round 2 composites the three
winners into one ad. All cells are 15s takes.

### Core 1 — "The Fratty Guy" · varies the MESSAGE (avatar frozen)

Avatar frozen across all four cells: the ad 1 peer — early 20s, backwards
white cap, hoodie, bedroom desk with chips, monitor glow. Same still, same
room, same delivery energy, same structure (hook → body → brand → "Start
today"), same b-roll slot mid-ad. Only the ARGUMENT changes — each cell
isolates one beat of the Runout message spine as a whole ad, so the winner
names the persuasion angle that actually sells.

| Cell | Angle | Script (~17s) |
|---|---|---|
| 1A | Invisible problem | "I lost at poker for years and couldn't tell you why. Small leaks I couldn't see — blind defense, bad three-bet calls. Suited poker grades every decision against the real solution and drills what you miss. Five minutes a day. Start getting better at poker — today." |
| 1B | Status reframe | "The guys beating you aren't smarter than you. They just knew the spot — and you were guessing. Suited poker deals you real spots and shows you exactly what the solution does. Five minutes a day. Start getting better at poker — today." |
| 1C | Mechanism analogy | "This app learns your poker mistakes like TikTok learns your taste. Every hand, it finds the spots you keep getting wrong and deals them back until they're fixed. Suited poker. Five minutes a day. Start getting better at poker — today." |
| 1D | Effort collapse | "Stop watching two-hour poker videos. You don't remember them at the table anyway. Five minutes of real spots, graded against the solution, beats all of it. Suited poker. Start getting better at poker — today." |

Beat timing, all cells: hook 0:00–0:03 (lean in, direct), body 0:03–0:12
(cut to b-roll ~0:07–0:11 while audio runs), close 0:12–0:15 (the serious
beat, hand flat on desk). Caption cards split per §10.

#### Core 1 — full Seedance 2.5 prompts (1A–1D)

Same avatar, same still (`@image1` = the Ad 1 peer), same room — reuse the
Ad 1 identity reference from §2b, do not regenerate it. Each prompt below
is fully self-contained (copy-paste ready); only the performance beats,
caption cards, and audio direction change per cell.

**Two changes from the first pass, both applied to all four cells:**

1. **17 seconds, not 15** — the extra 2s buys room for a full spoken CTA
   close, matching the pattern from Ads 2 and 3, instead of ending on a
   bare "Start today."
2. **A dedicated, over-emphasized pronunciation-and-spelling block**, not
   just a passing line in the Audio paragraph. The brand name is the one
   word Seedance has actually garbled before ("suired" — see §2), so every
   prompt below states the rule twice: once in its own labeled block
   immediately after the caption-overlay instructions, and again inside
   the Audio paragraph. Note the deliberate split: the SPOKEN dialogue
   text below writes the brand lowercase — "Suited poker" — because that
   reads to the model as two ordinary dictionary words instead of one
   proper noun, which is what stops the mispronunciation. Every CAPTION
   CARD, by contrast, spells it "Suited Poker" — both words capitalized —
   because a caption is read, not heard, and should look correct in
   writing. Keep this split when editing; do not "fix" the lowercase
   dialogue to match the captions.

**1A — Invisible problem**

```text
A vertical 9:16 selfie-style UGC video, one continuous unbroken take, 17
seconds, filmed as if on a propped-up phone at eye level. Maintain the
exact facial identity from @image1 for the entire duration.

Subject: a white man in his early twenties with a short patchy beard,
realistic skin texture with visible pores across the nose and cheeks,
slight redness and natural unevenness, absolutely no smoothing or beauty
filter. He wears a backwards white cap, a light-blue zip hoodie half-
zipped over a black t-shirt, and a thin silver chain. He sits at a
cluttered bedroom desk: a monitor glowing slightly out of focus behind his
left shoulder, four short stacks of poker chips (red, blue, green, white)
and a face-down deck of cards in the foreground, a charging cable snaking
across the desk, an open energy drink can at frame right with its label
turned away from the camera. Soft warm lamp light from camera-left throws
natural soft shadows across the right side of his face; a ceiling fan is
faintly visible top of frame. The room reads lived-in, not staged. No
readable text or logos anywhere in the frame.

Camera: handheld-phone character throughout — subtle micro-shake as if the
phone is leaned against something imperfect, one brief autofocus hunt
around the 6-second mark, mild exposure pumping when he leans forward. No
stabilization, no zoom, no cuts, no camera moves.

Caption overlay, on screen for the entire video: burned-in auto-caption
style subtitles, exactly like TikTok auto-captions. Plain white bold
sans-serif text with a soft black drop shadow, no background box, no
outline. Always a single line, centered horizontally, positioned at chest
height about two-thirds of the way down the frame — below his face, above
the desk. Only ONE caption card visible at a time; each card instantly
replaces the previous one in the same fixed position, perfectly synced to
the spoken words. No animation, no word-by-word pop-in, no karaoke
highlighting, no emoji. The caption text must be spelled exactly as
written in the card lists below, word for word — including the brand name,
which every caption card spells "Suited Poker": two capitalized words, a
normal space, no hyphen, no merged word, no misspelling. This spelling is
pixel-exact and non-negotiable.

CRITICAL — brand pronunciation and spelling, read this carefully and apply
it exactly: the spoken dialogue text below deliberately writes the brand
"Suited poker" — capital S, lowercase p — so it reads as two ordinary
dictionary words rather than one proper noun; that is what prevents a
mispronunciation. Spoken aloud it is TWO separate, ordinary English words:
"Suited," pronounced exactly like the common word in "a suited hand" or
"well suited for the job" — SOO-tid, two clean syllables, rhyming with
"booted," "rooted" — then a brief natural half-beat gap — then "poker,"
pronounced exactly like the card game, POH-ker, rhyming with "broker,"
"joker." Do NOT render this as "soo-ird," "suired," "sootid," "sooted,"
"suder," or any single word blending the two together — these are real
failure modes seen before and must be actively avoided. This rule applies
every single time the brand is spoken in this script.

Opening (0:00–0:03): He is already looking into the lens, open and a
little rueful, no performance yet — this is the confession, not the pitch:
"I lost at poker for years and couldn't tell you why." A small, almost
embarrassed shrug on "couldn't tell you why."
Caption cards: 0:00 "I lost at poker" — 0:01.2 "for years and couldn't" —
0:02.4 "tell you why"

The leaks (0:03–0:07): Faster, more specific, counting on his fingers at
chest height, one finger per item, a small head shake after the last one:
"Small leaks I couldn't see — blind defense, bad three-bet calls." He
glances briefly down-left as if picturing a hand, then back to the lens.
Caption cards: 0:03 "small leaks I couldn't" — 0:04.2 "see — blind
defense" — 0:05.4 "bad three-bet calls"

The mechanism (0:07–0:12): Steadier, matter-of-fact, using both hands to
frame a small box in the air on "grades every decision," then a light
double-tap on the desk on "solution": "Suited poker grades every decision
against the real solution — and drills what you miss."
Caption cards: 0:07 "Suited Poker grades every" — 0:08.2 "decision
against the" — 0:09.4 "real solution and" — 0:10.6 "drills what you miss"

Close (0:12–0:17): He relaxes back an inch, one hand flat on the desk.
First, plain and steady: "Five minutes a day." A short breath, then he
leans a few inches back toward the lens for the close, more direct and a
touch more energized than the rest of the video: "Start getting better at
poker — today." Holds eye contact with the lens for a full beat after the
last word, the take ends.
Caption cards: 0:12 "five minutes a day" — 0:13.5 "start getting better" —
0:15 "at poker" — 0:16 "today"

Audio: his voice only, warm conversational American male in his early
twenties, intimate like talking to a friend, natural hesitations and
breaths exactly where written, no script-read cadence. He pronounces
"Suited" exactly like the ordinary English word — as in "a suited hand" —
SOO-tid, rhymes with "booted", never "soo-ird" or "suired" — and "poker"
exactly like the card game, POH-ker, rhyming with "broker" — spoken as two
distinct words with a small natural gap between them, never blended into
one. Quiet room tone underneath, a faint chip-stack clink when his hand
brushes the desk at 0:09. No background music, no logos, no watermarks, no
color grade, no cinematic look, no beauty retouching, no plastic skin. No
text on screen other than the caption cards specified above — no emoji, no
titles, no watermark text.
```

**1B — Status reframe**

```text
A vertical 9:16 selfie-style UGC video, one continuous unbroken take, 17
seconds, filmed as if on a propped-up phone at eye level. Maintain the
exact facial identity from @image1 for the entire duration.

Subject: a white man in his early twenties with a short patchy beard,
realistic skin texture with visible pores across the nose and cheeks,
slight redness and natural unevenness, absolutely no smoothing or beauty
filter. He wears a backwards white cap, a light-blue zip hoodie half-
zipped over a black t-shirt, and a thin silver chain. He sits at a
cluttered bedroom desk: a monitor glowing slightly out of focus behind his
left shoulder, four short stacks of poker chips (red, blue, green, white)
and a face-down deck of cards in the foreground, a charging cable snaking
across the desk, an open energy drink can at frame right with its label
turned away from the camera. Soft warm lamp light from camera-left throws
natural soft shadows across the right side of his face; a ceiling fan is
faintly visible top of frame. The room reads lived-in, not staged. No
readable text or logos anywhere in the frame.

Camera: handheld-phone character throughout — subtle micro-shake as if the
phone is leaned against something imperfect, one brief autofocus hunt
around the 6-second mark, mild exposure pumping when he leans forward. No
stabilization, no zoom, no cuts, no camera moves.

Caption overlay, on screen for the entire video: burned-in auto-caption
style subtitles, exactly like TikTok auto-captions. Plain white bold
sans-serif text with a soft black drop shadow, no background box, no
outline. Always a single line, centered horizontally, positioned at chest
height about two-thirds of the way down the frame — below his face, above
the desk. Only ONE caption card visible at a time; each card instantly
replaces the previous one in the same fixed position, perfectly synced to
the spoken words. No animation, no word-by-word pop-in, no karaoke
highlighting, no emoji. The caption text must be spelled exactly as
written in the card lists below, word for word — including the brand name,
which every caption card spells "Suited Poker": two capitalized words, a
normal space, no hyphen, no merged word, no misspelling. This spelling is
pixel-exact and non-negotiable.

CRITICAL — brand pronunciation and spelling, read this carefully and apply
it exactly: the spoken dialogue text below deliberately writes the brand
"Suited poker" — capital S, lowercase p — so it reads as two ordinary
dictionary words rather than one proper noun; that is what prevents a
mispronunciation. Spoken aloud it is TWO separate, ordinary English words:
"Suited," pronounced exactly like the common word in "a suited hand" or
"well suited for the job" — SOO-tid, two clean syllables, rhyming with
"booted," "rooted" — then a brief natural half-beat gap — then "poker,"
pronounced exactly like the card game, POH-ker, rhyming with "broker,"
"joker." Do NOT render this as "soo-ird," "suired," "sootid," "sooted,"
"suder," or any single word blending the two together — these are real
failure modes seen before and must be actively avoided. This rule applies
every single time the brand is spoken in this script.

Opening (0:00–0:03.5): Direct, a little confrontational, leaning in a few
inches, no smile yet: "The guys beating you aren't smarter than you." A
small dismissive shake of the head on "smarter than you," like he's
personally offended on the viewer's behalf.
Caption cards: 0:00 "the guys beating you" — 0:01.4 "aren't smarter" —
0:02.4 "than you"

The reveal (0:03.5–0:07): Knowing, a little smug, eyebrow raised: "They
just knew the spot — and you were guessing." A decisive single nod on
"knew the spot," then a slight smirk on "you were guessing."
Caption cards: 0:03.5 "they just knew" — 0:04.6 "the spot" — 0:05.5 "and
you were guessing"

The mechanism (0:07–0:12): Leaning back slightly, more explanatory, one
open palm turned up as if presenting something obvious: "Suited poker
deals you real spots and shows you exactly what the solution does." A
light point at the lens on "exactly."
Caption cards: 0:07 "Suited Poker deals you" — 0:08.2 "real spots and" —
0:09.4 "shows you exactly" — 0:10.6 "what the solution does"

Close (0:12–0:17): He relaxes back an inch, one hand flat on the desk.
First, plain and steady: "Five minutes a day." A short breath, then he
leans a few inches back toward the lens for the close, more direct and a
touch more energized than the rest of the video: "Start getting better at
poker — today." Holds eye contact for a full beat after the last word, the
take ends.
Caption cards: 0:12 "five minutes a day" — 0:13.5 "start getting better" —
0:15 "at poker" — 0:16 "today"

Audio: his voice only, warm conversational American male in his early
twenties, a little more assertive and knowing than a typical confession —
this is him letting the viewer in on something, not admitting a mistake.
Natural hesitations and breaths exactly where written, no script-read
cadence. He pronounces "Suited" exactly like the ordinary English word —
as in "a suited hand" — SOO-tid, rhymes with "booted", never "soo-ird" or
"suired" — and "poker" exactly like the card game, POH-ker, rhyming with
"broker" — spoken as two distinct words with a small natural gap between
them, never blended into one. Quiet room tone underneath, a faint
chip-stack clink when his hand brushes the desk at 0:09. No background
music, no logos, no watermarks, no color grade, no cinematic look, no
beauty retouching, no plastic skin. No text on screen other than the
caption cards specified above — no emoji, no titles, no watermark text.
```

**1C — Mechanism analogy**

```text
A vertical 9:16 selfie-style UGC video, one continuous unbroken take, 17
seconds, filmed as if on a propped-up phone at eye level. Maintain the
exact facial identity from @image1 for the entire duration.

Subject: a white man in his early twenties with a short patchy beard,
realistic skin texture with visible pores across the nose and cheeks,
slight redness and natural unevenness, absolutely no smoothing or beauty
filter. He wears a backwards white cap, a light-blue zip hoodie half-
zipped over a black t-shirt, and a thin silver chain. He sits at a
cluttered bedroom desk: a monitor glowing slightly out of focus behind his
left shoulder, four short stacks of poker chips (red, blue, green, white)
and a face-down deck of cards in the foreground, a charging cable snaking
across the desk, an open energy drink can at frame right with its label
turned away from the camera. Soft warm lamp light from camera-left throws
natural soft shadows across the right side of his face; a ceiling fan is
faintly visible top of frame. The room reads lived-in, not staged. No
readable text or logos anywhere in the frame.

Camera: handheld-phone character throughout — subtle micro-shake as if the
phone is leaned against something imperfect, one brief autofocus hunt
around the 6-second mark, mild exposure pumping when he leans forward. No
stabilization, no zoom, no cuts, no camera moves.

Caption overlay, on screen for the entire video: burned-in auto-caption
style subtitles, exactly like TikTok auto-captions. Plain white bold
sans-serif text with a soft black drop shadow, no background box, no
outline. Always a single line, centered horizontally, positioned at chest
height about two-thirds of the way down the frame — below his face, above
the desk. Only ONE caption card visible at a time; each card instantly
replaces the previous one in the same fixed position, perfectly synced to
the spoken words. No animation, no word-by-word pop-in, no karaoke
highlighting, no emoji. The caption text must be spelled exactly as
written in the card lists below, word for word — including the brand name,
which every caption card spells "Suited Poker": two capitalized words, a
normal space, no hyphen, no merged word, no misspelling. This spelling is
pixel-exact and non-negotiable.

CRITICAL — brand pronunciation and spelling, read this carefully and apply
it exactly: the spoken dialogue text below deliberately writes the brand
"Suited poker" — capital S, lowercase p — so it reads as two ordinary
dictionary words rather than one proper noun; that is what prevents a
mispronunciation. Spoken aloud it is TWO separate, ordinary English words:
"Suited," pronounced exactly like the common word in "a suited hand" or
"well suited for the job" — SOO-tid, two clean syllables, rhyming with
"booted," "rooted" — then a brief natural half-beat gap — then "poker,"
pronounced exactly like the card game, POH-ker, rhyming with "broker,"
"joker." Do NOT render this as "soo-ird," "suired," "sootid," "sooted,"
"suder," or any single word blending the two together — these are real
failure modes seen before and must be actively avoided. This rule applies
every single time the brand is spoken in this script.

Opening (0:00–0:03): More animated and playful than the other cells,
almost like he's proud of the comparison he's about to make, a small
half-grin: "This app learns your poker mistakes like TikTok learns your
taste." On "TikTok" his right thumb makes one quick small upward flick in
the air near the desk, miming a scroll, then drops the gesture immediately
— not cartoonish, just a flash of it.
Caption cards: 0:00 "this app learns" — 0:01 "your poker mistakes" —
0:02 "like TikTok learns" — 0:02.8 "your taste"

The mechanism, part one (0:03–0:07): Leaning in slightly, more explanatory
now, counting the idea out with one open hand turning over: "Every hand,
it finds the spots you keep getting wrong—"
Caption cards: 0:03 "every hand, it finds" — 0:04.3 "the spots you keep" —
0:05.6 "getting wrong"

The mechanism, part two (0:07–0:12): Continuing the same thought without a
breath break, a small nod landing on "fixed," then relaxing slightly on
the brand name: "—and deals them back until they're fixed. Suited poker."
Caption cards: 0:07 "and deals them back" — 0:08.2 "until they're fixed" —
0:09.4 "Suited Poker"

Close (0:12–0:17): He relaxes back an inch, one hand flat on the desk, the
grin mostly gone. First, plain and steady: "Five minutes a day." A short
breath, then a small return of the earlier playful energy for the close:
"Start getting better at poker — today." Holds eye contact for a full beat
after the last word, the take ends.
Caption cards: 0:12 "five minutes a day" — 0:13.5 "start getting better" —
0:15 "at poker" — 0:16 "today"

Audio: his voice only, warm conversational American male in his early
twenties, upbeat and a little pleased with himself on the analogy,
settling into plain sincerity through the mechanism beats, with a small
lift of energy back on the CTA. Natural hesitations and breaths exactly
where written, no script-read cadence. He pronounces "Suited" exactly like
the ordinary English word — as in "a suited hand" — SOO-tid, rhymes with
"booted", never "soo-ird" or "suired" — and "poker" exactly like the card
game, POH-ker, rhyming with "broker" — spoken as two distinct words with a
small natural gap between them, never blended into one. Quiet room tone
underneath, a faint chip-stack clink when his hand brushes the desk at
0:08. No background music, no logos, no watermarks, no color grade, no
cinematic look, no beauty retouching, no plastic skin. No text on screen
other than the caption cards specified above — no emoji, no titles, no
watermark text.
```

**1D — Effort collapse**

```text
A vertical 9:16 selfie-style UGC video, one continuous unbroken take, 17
seconds, filmed as if on a propped-up phone at eye level. Maintain the
exact facial identity from @image1 for the entire duration.

Subject: a white man in his early twenties with a short patchy beard,
realistic skin texture with visible pores across the nose and cheeks,
slight redness and natural unevenness, absolutely no smoothing or beauty
filter. He wears a backwards white cap, a light-blue zip hoodie half-
zipped over a black t-shirt, and a thin silver chain. He sits at a
cluttered bedroom desk: a monitor glowing slightly out of focus behind his
left shoulder, four short stacks of poker chips (red, blue, green, white)
and a face-down deck of cards in the foreground, a charging cable snaking
across the desk, an open energy drink can at frame right with its label
turned away from the camera. Soft warm lamp light from camera-left throws
natural soft shadows across the right side of his face; a ceiling fan is
faintly visible top of frame. The room reads lived-in, not staged. No
readable text or logos anywhere in the frame.

Camera: handheld-phone character throughout — subtle micro-shake as if the
phone is leaned against something imperfect, one brief autofocus hunt
around the 6-second mark, mild exposure pumping when he leans forward. No
stabilization, no zoom, no cuts, no camera moves.

Caption overlay, on screen for the entire video: burned-in auto-caption
style subtitles, exactly like TikTok auto-captions. Plain white bold
sans-serif text with a soft black drop shadow, no background box, no
outline. Always a single line, centered horizontally, positioned at chest
height about two-thirds of the way down the frame — below his face, above
the desk. Only ONE caption card visible at a time; each card instantly
replaces the previous one in the same fixed position, perfectly synced to
the spoken words. No animation, no word-by-word pop-in, no karaoke
highlighting, no emoji. The caption text must be spelled exactly as
written in the card lists below, word for word — including the brand name,
which every caption card spells "Suited Poker": two capitalized words, a
normal space, no hyphen, no merged word, no misspelling. This spelling is
pixel-exact and non-negotiable.

CRITICAL — brand pronunciation and spelling, read this carefully and apply
it exactly: the spoken dialogue text below deliberately writes the brand
"Suited poker" — capital S, lowercase p — so it reads as two ordinary
dictionary words rather than one proper noun; that is what prevents a
mispronunciation. Spoken aloud it is TWO separate, ordinary English words:
"Suited," pronounced exactly like the common word in "a suited hand" or
"well suited for the job" — SOO-tid, two clean syllables, rhyming with
"booted," "rooted" — then a brief natural half-beat gap — then "poker,"
pronounced exactly like the card game, POH-ker, rhyming with "broker,"
"joker." Do NOT render this as "soo-ird," "suired," "sootid," "sooted,"
"suder," or any single word blending the two together — these are real
failure modes seen before and must be actively avoided. This rule applies
every single time the brand is spoken in this script.

Opening (0:00–0:03): Flat, a little dismissive, almost bored — this is the
most low-energy of the four cells on purpose: "Stop watching two-hour
poker videos." A single flat palm-out "stop" gesture at chest height,
dropped immediately, no follow-through flourish.
Caption cards: 0:00 "stop watching" — 0:01 "two-hour poker videos"

The dismissal (0:03–0:07): A small eye-roll, shoulders loose, talking like
this is obvious: "You don't remember them at the table anyway." A short
exhale through the nose on "anyway," almost a laugh.
Caption cards: 0:03 "you don't remember" — 0:04.2 "them at the table" —
0:05.4 "anyway"

The mechanism (0:07–0:12): Slightly more energy returning, matter-of-fact
rather than salesy, one loose open hand gesturing outward on "beats all of
it": "Five minutes of real spots, graded against the solution, beats all
of it. Suited poker."
Caption cards: 0:07 "five minutes of real" — 0:08.2 "spots, graded
against" — 0:09.4 "the solution, beats" — 0:10.6 "all of it. Suited
Poker"

Close (0:12–0:17): He settles back, plain and unhurried, one hand resting
flat on the desk. Still dry, still low-energy — the delivery does NOT
brighten for the CTA, that flatness is the point of this cell: "Start
getting better at poker — today." Holds eye contact for a full beat after
the last word, the take ends.
Caption cards: 0:12 "start getting" — 0:13.5 "better at poker" —
0:15.5 "today"

Audio: his voice only, warm conversational American male in his early
twenties, dry and a little dismissive throughout, never raising energy to
sell — the persuasion is in the shrug, not the enthusiasm, all the way
through the CTA. Natural hesitations and breaths exactly where written, no
script-read cadence. He pronounces "Suited" exactly like the ordinary
English word — as in "a suited hand" — SOO-tid, rhymes with "booted",
never "soo-ird" or "suired" — and "poker" exactly like the card game,
POH-ker, rhyming with "broker" — spoken as two distinct words with a small
natural gap between them, never blended into one. Quiet room tone
underneath, a faint chip-stack clink when his hand brushes the desk at
0:12. No background music, no logos, no watermarks, no color grade, no
cinematic look, no beauty retouching, no plastic skin. No text on screen
other than the caption cards specified above — no emoji, no titles, no
watermark text.
```

**CapCut edit map — identical shape for all four cells:**

| Time | Picture |
|------|---------|
| 0:00–0:07 | Seedance take (face) — hook + development |
| 0:07–0:11 | b-roll full-bleed (`drill-correct` → `leak-report`), CapCut captions matching the mechanism beat's words (baked caption is discarded with the picture here) |
| 0:11–0:17 | back to face for the mechanism tail-out, the "five minutes a day" line, and the spoken CTA close |

### Core 2 — "The Quiz" · varies HOOK (avatar + body frozen)

Avatar: the deadpan quiz kid (ad 3 still). Body after the hook is identical
— spot, silent hold, reveal, brand, CTA (use the ad 3 15s-adapted beats):
"Big blind. The small blind opens. Fold, call, or raise? [hold] If you felt
sure — that's the leak. The solution mixes. Suited poker — real spots,
graded instantly. Start today."

| Cell | Hook (0:00–0:02.5) |
|---|---|
| 2A | "Quick quiz. What's your play here?" (baseline) |
| 2B | "Bet you get this one wrong." (challenge) |
| 2C | "This spot has no right answer." (paradox — pays off the mix reveal hardest) |
| 2D | "One hand. Prove you're not guessing." (identity dare) |

### Core 3 — "The Enemy" · varies the NAMED PAIN (avatar + body frozen)

Avatar: the veteran. Body after the hook is identical: "And I still
couldn't tell you if that river call last Tuesday was right. Suited poker
caught a mistake I'd been making for twenty years. Start getting better at
poker — today."

| Cell | Enemy hook (0:00–0:04, said with dry contempt) |
|---|---|
| 3A | "I've done the three-hundred-dollar coaching." |
| 3B | "I've watched the six-hour YouTube breakdowns." |
| 3C | "I bought the solver. Barely opened it." |
| 3D | "Twenty years at the table. Every book, every video." |

### Running it

- Generation cost: Core 2 and 3 share avatars with the launch ads, so 12
  cells ≈ 5 identity stills total and 12×15–17s takes. Cores 2 and 3 only
  regenerate ~4s of new opening against a reusable body if the tool's
  region/extend features cooperate — otherwise 12 full takes.
- Same b-roll, caption spec (§10), degradation pass (§10b), and baked-
  caption overlay blocks as the launch ads. Same compliance rules (§0).
- Read after ~$50–100 spend per core on Purchase (not CTR — a hook can win
  attention and lose buyers). Then composite: winning avatar × winning
  hook × winning pain = the round-2 ad.

### Ad set / ad naming — one ad set PER CORE

Each Core is a different type of copywriting — Core 1 tests which
*argument* sells, Core 2 tests which *hook* pulls, Core 3 tests which
*named pain* lands. Splitting them into three ad sets, rather than one ad
set holding all 12 ads, is what makes the read trustworthy: inside a
single ad set Meta's delivery algorithm will chase whichever ad converts
first and starve the rest within days — often before a 4-way test inside
one dimension has enough data, and always before you can tell whether an
early leader won because of its ARGUMENT or because it happened to also
have the better AVATAR or HOOK. Separate ad sets isolate the variable.

**Campaign** (one, unchanged from §11): Advantage+ Sales, optimized for
Purchase.

**Ad sets (3) — same targeting/placements in all three, budget type is
the one setting that matters:**

| Ad set | Tests | Ads inside |
|---|---|---|
| `as1-core1-message-angle` | Which ARGUMENT sells (avatar frozen: fratty guy) | 1A–1D |
| `as2-core2-hook` | Which HOOK pulls (avatar frozen: quiz kid) | 2A–2D |
| `as3-core3-enemy` | Which named PAIN lands (avatar frozen: veteran) | 3A–3D |

Use **ad set budget optimization (ABO)**, not campaign budget
optimization, for the duration of this test — set roughly equal daily
budgets across the three ad sets. CBO will happily starve two of the three
cores to feed whichever one gets an early lucky conversion, which answers
"which core is winning today" but never lets any single core finish its
own internal 4-way read. Switch back to CBO once you're scaling a chosen
winner, not while you're still testing.

**Ads (4 per ad set, 12 total)** — name the CELL CODE first so Ads
Manager's alphabetical sort groups each ad set's four variations together,
then a short mnemonic for what's actually being varied, then the avatar
tag, length, and version:

`{cell}-{mnemonic}-{avatar}-{length}s-v1`

| Ad set `as1-core1-message-angle` | Ad set `as2-core2-hook` | Ad set `as3-core3-enemy` |
|---|---|---|
| `1a-invisible-problem-fratty-17s-v1` | `2a-quiz-baseline-quizkid-15s-v1` | `3a-enemy-coaching-veteran-15s-v1` |
| `1b-status-reframe-fratty-17s-v1` | `2b-quiz-challenge-quizkid-15s-v1` | `3b-enemy-youtube-veteran-15s-v1` |
| `1c-mechanism-analogy-fratty-17s-v1` | `2c-quiz-noanswer-quizkid-15s-v1` | `3c-enemy-solver-veteran-15s-v1` |
| `1d-effort-collapse-fratty-17s-v1` | `2d-quiz-dare-quizkid-15s-v1` | `3d-enemy-experience-veteran-15s-v1` |

**Freeze primary text to A (§1) for this test.** Don't cross this creative
test with the copy A/B test — that's a second variable, and it turns 12
clean reads into 24 muddy ones with no added signal for the question this
round is actually asking. Run primary text A vs B on the winning ad from
each core AFTER this round, one at a time.

**Bump the version suffix, not the cell code, on any regeneration** — a
re-rolled take for `1b` because of a garbled brand word becomes
`1b-status-reframe-fratty-17s-v2`, so Ads Manager's delivery history
stays attached to the right creative lineage instead of starting over
under a new name.

## 12 · What Runout leaves on the table (our free wins)

1. **Hook-only variants** — §11, we run them weekly.
2. **An end card on the non-human ad** — ad 4 has one; UGC ads stay bare
   (the anti-polish read is worth more there).
3. **Social proof** — they show none; we can't show testimonials yet (FTC,
   empty by design), but product FACTS are allowed as caption lines:
   "every spot graded against the full solution" · "all 169 hands, every
   spot" — true today, no person invented, no result claimed.
