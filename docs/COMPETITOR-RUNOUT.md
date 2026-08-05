*Competitive teardown for Runoutly. Source: the 2:26 iPhone screen recording in your Downloads, read frame by frame at 2.5s intervals (58 frames). Their full onboarding, questionnaire, loader, paywall, and downsell.*

---

# Runout Poker (a.k.a. "Runout Poker Trainer GTO Coach") — full onboarding + paywall teardown
**Source:** 58 frames @ 2.5s intervals, 0s–142s, iPhone screen recording. Frame render size 760×1652 px ≈ 393×852 pt logical, so **divide pixel figures by ~1.94 for pt**. All pt figures below are derived that way.

**Global layout constants** (measured, not eyeballed):
- Content gutter: **24pt** each side (content width 344pt) on every screen except the drill action bar, which uses a **10pt** gutter.
- Primary CTA: full-width **344 × 51pt**, corner radius ~14–16pt, bottom edge **34pt** above the screen bottom (safe area).
- Progress bar: **274pt × ~5pt**, fully rounded, top-aligned at ~99pt from top, left edge at 78pt (leaving room for the back chevron).
- Answer option cards: 344pt wide, **56pt** tall single-line / **83pt** tall two-line, radius ~20pt.

---

## 1. Screen-by-screen flow

### S1 — Hero / cold-start demo (0s–2s)
**Purpose:** show the product working before asking for anything.
- Top ~68% of the screen: a live, playing poker table (see §6). Not a static image — between 0s and 2s the hand actually advances (BB folds, chips sweep to pot, feedback row disappears).
- Below the table, a 4-up action bar with a percentage capsule above each button.
- **Headline (verbatim):** "Play better poker in 5 minutes a day" — 2 lines, centered, white, ~30pt heavy, line-height ~32pt, sitting at y≈1240–1360px.
- **Primary button:** white rounded-rect, black label **"Get Started"** (~18pt semibold), 344×51pt, pinned bottom.
- No skip, no login link, no legal text on this screen.

### S2 — Table cascade / "learns from you" (5s–10s)
**Purpose:** motion-heavy transition that visually claims volume and variety of drills.
- 5s: still one table (pot $219, turn dealt) but the whole view is mid-scale-down.
- 7s: **6+ miniature table cards tumbling diagonally** across the screen at varying rotations and scales (parallax scatter). Headline area empty; a **greyed-out, disabled "Continue"** pill sits at the bottom.
- 10s: cascade settles into the upper 65%; copy fades in at the bottom.
- **Headline:** "Poker trainer that learns from you" (2 lines, ~30pt heavy, centered).
- **Body (verbatim):** "Just like your TikTok feed, our trainer adapts to your behavior. Every mistake shapes what you see next, creating personalized drills to fix your exact leaks."
  - 4 lines, ~18pt, colour ~#9AA0A6, centered.
- **Button:** white, **"Continue"**.

### S3 — Curriculum ladder (12s)
**Purpose:** scope/ambition claim.
- Upper 70%: a diagonal "staircase" of three numbered tiles — **1** labelled "Preflop", **2** labelled "Theory", **3** labelled "Postflop" — connected by curved indigo lines rising left→right. Tiles are ~80×80pt rounded squares (radius ~22pt), dark indigo fill, thin #6C63FF stroke, giant white numeral centered.
- Three white glass icon chips float around them: an eye labelled **"Hand reading"**, a bar-chart labelled **"Frequencies"**, a 3×3 dot grid labelled **"Positions"**. Background has ghosted, out-of-focus words at ~10% opacity: "Exploits", "Board texture", "Bet sizing", "odds", "Ranges", "%".
- **Headline:** "We'll take you all the way through the game"
- **Sub:** "Until you've mastered every part" (~18pt, grey, single line)
- **Button:** white, **"Get Started"** (note: label reverts to "Get Started", not "Continue").

### S4–S12 — Questionnaire (15s–45s, then again at 77s) — see §2 in full.

### S13 — Stat interstitial #1 (47s–50s) — see §3.
### S14 — Stat interstitial #2 (52s) — see §3.
### S15 — "Training system" loop diagram (55s–60s) — see §3.

### S16 — Account creation / hard gate (62s–75s)
**Purpose:** capture identity *before* the paywall and before the "personalization" payoff.
- Top-left: a pill-shaped outlined chip reading **"RUNOUT POKER"** (letterspaced, ~13pt semibold, 1px grey stroke, radius full).
- Background: near-black navy with a single bright indigo swoosh arcing from top-right, plus faint concentric ring geometry at ~8% opacity.
- **Headline (verbatim, left-aligned, 4 lines, ~34pt heavy):** "The Fastest Way to Improve Your Poker Game."
- **Sub:** "Personalized training designed to boost your win-rate quickly." (2 lines, ~18pt, #9AA0A6)
- **Three stacked white buttons**, 344×51pt each, 14pt gaps, icon + centered black label:
  1. ✉ **"Continue with email"**
  2.  **"Continue with Apple"**
  3. G **"Continue with Google"**
- **Fine print (verbatim):** "By continuing you agree to our <u>Terms of Service</u> and <u>Privacy Policy</u>" — ~15pt, #8E8E93, links underlined white.
- 65s: native iOS sheet — **""PokerGame" Wants to Use "accounts.google.com" to Sign In / This allows the app and website to share information about you." / Cancel | Continue**. ⚠️ The bundle display name is **"PokerGame"**, not Runout.
- 67s–72s: Google account chooser, "to continue to **Runout Poker Trainer GTO Coach**"; then consent screen; Cancel / Continue.
- 75s: back on S16 with the Google button showing an inline spinner.

### S17 — Question 9 (77s) — see §2.

### S18 — Notification permission pre-prompt (80s–82s)
- Centered 60×60pt rounded-square glyph chip (radius ~18pt), dark indigo fill, thin indigo stroke, **outline bell icon** in #5B5BFF.
- **Headline:** "Make Training Automatic" (~28pt heavy, centered, one line)
- **Body:** "Consistent training leads to better results. We'll remind you at the right time." (2 lines, ~18pt grey, centered)
- Mid-screen: a **mock iOS notification banner** — 344pt wide, radius ~20pt, translucent dark fill with a hairline stroke; 48×48pt app icon (black tile, gradient blue→teal mortarboard-over-spade); title **"Runout Poker -"**; timestamp right-aligned **"9:41 AM"**; body **"Time for your daily drills! 🎯"**.
- **Primary:** white **"Enable notifications"**. **Secondary:** plain grey text link **"Maybe later"** ~20pt below.
- 82s: a real Gmail notification banner ("Google — You shared some Google Account d…") drops in and the screen is already transitioning — the mock and the real banner briefly coexist, which is a bit unlucky for the illusion.

### S19 — App Store review solicitation (85s–92s)
**Purpose:** farm 5-star ratings before the user has used anything.
- **Headline:** "Help Our Team Grow" (~28pt heavy, centered)
- **Body (verbatim):** "Your review means so much more than just 5 stars. It helps our team grow and further invest in making your experience better" (3 lines, ~18pt grey)
- 85s: a **replica of Apple's native rating card** animates in — app icon, "Enjoying Runout?", "Tap a star to rate it on the App Store.", 5 outlined blue stars, and a grey "Not Now" pill. It is a *decorative mock*, layered over a stack of card shadows.
- 87s onward: mock is replaced by a **5-gold-star badge** in a 208×80pt rounded container (radius ~24pt) and a **testimonial card** below:
  - **"Immediate leak fixer"** ★★★★★
  - Body (verbatim): "I knew basic ranges and concepts, but I kept losing in the same few situations without knowing why. What surprised me most is how the trainer adapts to what I mess up instead of throwing random scenarios at me. After a week, it was basically drilling my exact leaks over and over until they stopped being leaks. My decisions feel calmer now, especially in 3-bet and blind vs blind spots. That alone paid for the app."
- **Button:** white **"Continue"**.

### S20 — "Time to build" beat (95s)
- Two overlapping white **Q♣ Q♣** cards, ~95×140pt each, fanned ±8°, centered.
- **Headline (2 lines, centered):** "Time to build your" / **"custom poker trainer"** — second line in #5B5BFF, same weight/size (~30pt heavy).
- **Button:** **"Continue"** (grey/pressed in this frame).

### S21 — Fake computation loader (97s–107s)
See §4. **No button** — auto-advances.

### S22 — Completion beat (110s–112s)
- QQ♣♣ cards scale up; a **56×56pt indigo rounded-square badge with a white/blue checkmark** pops on top of them.
- Below (mostly faded out in every captured frame — **partially illegible**): a 3-row checklist card and a caption. Recoverable fragments after heavy contrast stretch:
  - row 2: "Pr…gr…" (likely "Progress…"), row 3: **"Ad…s to your level as you im…"** (almost certainly "Adapts to your level as you improve")
  - caption: **"Your custom trainer turns repeated mistakes into stronger decisions."**
  - I could not recover row 1 or the exact row-2 wording. Flagging rather than guessing.
- **Button:** "Continue".

### S23 — Community / before-after social proof (115s–120s)
See §3.

### S24 — Paywall (122s–132s)
See §5.

### S25 — Downsell modal (135s)
See §5.

### S26 — Native App Store purchase sheet (137s–140s)
See §5.

### S27 — Dismiss (142s)
Sheet dismissed; user is returned to the **downsell modal still open over the paywall**. Recording ends. **Purchase was never completed, so post-purchase state is unknown.**

---

## 2. The onboarding questionnaire — exhaustive transcription

**Chrome shared by every question screen:**
- Back chevron: ~50pt circular dark button at top-left (x≈35, y≈99pt), with a subtle radial glow behind it. Present on *every* question — no "Skip" affordance anywhere.
- Progress bar to its right (274×5pt), indigo #4F46E5 fill on a #8E8E93 track, animated.
- Headline: left-aligned, white, **~30pt heavy**, 1–2 lines, top at ~152pt.
- Sub-copy (when present): left-aligned, **~18pt**, #8E8E93, 1–2 lines.
- Options: 344pt cards, fill ~#1C1C1E, hairline #2C2C2E stroke, radius ~20pt, 14pt vertical gaps. Title ~17pt semibold white at 22pt left padding; optional description ~15pt #8E8E93 below it. Selection control is a **~24pt circle** flush right at 22pt right padding.
- Footer hint (verbatim, on every question): ***"You can adjust later"*** — centered, **italic**, ~15pt, #6E6E73.

**Two distinct input patterns, cleanly separated:**
| | Single select | Multi select |
|---|---|---|
| Control | hollow circle → filled indigo circle with a **white dot** (radio) | hollow circle → filled indigo circle with a **white checkmark** |
| Selected card | fill shifts to indigo-tinted #221F5C, 2px #5B5BFF stroke | same |
| Continue button | **none** — taps auto-advance | persistent bottom Continue, **grey/disabled** until ≥1 pick, then **white/enabled** |

**Measured progress bar values** (fraction of track filled, precise to the pixel):

| Q | t | Fill | Reads as |
|---|---|---|---|
| Q1 | 15s | 0.164 | 2/12 |
| Q2 | 20s | 0.250 | 3/12 |
| Q3 | 22s | 0.331 | 4/12 |
| Q4 | 25s | 0.417 | 5/12 |
| Q5 | 30s | 0.500 | 6/12 |
| Q6 | 32s | 0.585 | 7/12 |
| Q7 | 37s | **0.750** | **9/12** |
| Q8 | 42s | 0.833 | 10/12 |
| Q9 | 77s | 0.915 | 11/12 |

⚠️ **The 8/12 step (0.667) never appears in the capture.** Q6 is answered at 35s and Q7 is on screen at 37s. Because single-selects auto-advance instantly, it is very likely **one additional question exists between "How confident are you in your preflop ranges?" and "Which areas do you struggle with the most right now?"** and was answered inside the 2.5s sampling gap. Likewise there is a step 1/12 before Q1 and a 12/12 after Q9 that I cannot account for. Treat the questionnaire as **~12 steps, 9 of which are captured verbatim below.**

---

### Q1 — 15s–17s · progress 2/12 · single select
> **"What is your current poker level?"**
> "No need to overthink it. The trainer adapts as you progress, at any level"

| Option | Description |
|---|---|
| **Beginner** | "I'm still learning the rules and hand rankings" |
| **Intermediate** | "I can play and understand a little strategy" |
| **Competent** | "I use position and basic ranges to make my decisions." *(note the inconsistent trailing period — only option with one)* |
| **Advanced** | "I play a range-based game and understand board textures" |
| **Expert** | "I've studied in-depth GTO and could play pro" |

List overflows the fold; "You can adjust later" only becomes visible after scrolling (17s frame).

### Q2 — 20s · progress 3/12 · single select
> **"How often do you currently play poker?"**
> *(no sub-copy)*

| Option | Description |
|---|---|
| **Rarely** | "A few times a month or less" |
| **Occasionally** | "About once or twice a week" |
| **Regularly** | "3–5 sessions per week" *(en dash)* |
| **Very frequently** | "Almost every day" |

### Q3 — 22s · progress 4/12 · single select
> **"How old are you?"**
> "This helps us tailor examples and pacing to you"

Options (no descriptions, single-line cards): **18 to 24** · **25 to 34** · **35 to 44** · **45 to 54** · **55 to 64** · **65 or older**

### Q4 — 25s–27s · progress 5/12 · **multi select**
> **"Which formats are you most interested in studying?"**
> "This will be used to calibrate your trainer"

Options: **Cash Games** · **Tournaments (MTT)** · **Sit & Go / Single-Table Tournaments** (2-line card)

Selected in the recording: **Sit & Go / Single-Table Tournaments**. Continue goes grey→white on selection.

### Q5 — 30s · progress 6/12 · single select
> **"Do you prefer to focus on live or online play?"**
> "Fine-tunes your trainer to nuanced strategic differences between settings"

Options: **Live** · **Online** · **Both fairly equally**

### Q6 — 32s–35s · progress 7/12 · single select
> **"How confident are you in your preflop ranges?"**
> *(no sub-copy)*

| Option | Description |
|---|---|
| **Not very confident** | "I often feel like I don't know what to do" |
| **Moderately confident** | "I understand standard opens, but don't always adjust optimally" |
| **Confident** | "I know solid opening ranges and deviate accordingly" |
| **Very confident** | "I actively adjust ranges based on position, opponents, and game dynamics" |

Selected: **Moderately confident** (35s).

### *(likely one uncaptured question here — progress step 8/12)*

### Q7 — 37s–40s · progress 9/12 · **multi select**, scrollable
> **"Which areas do you struggle with the most right now?"**
> "We'll prioritize these concepts and spots in your training to start"

Full option list across both frames (11 options):
1. **Preflop**
2. **Facing aggression** — "Bets, raises, and check-raises" *(only option with a description)*
3. **Postflop decision-making**
4. **Selecting bluff / semi-bluff spots**
5. **Defending blinds**
6. **Playing out of position**
7. **Exploitative adjustments**
8. **Deep stack play**
9. **Short stack play**
10. **Poker math**
11. **Emotional control / tilt**

Bottom **Continue** stays pinned and disabled (grey) throughout; "You can adjust later" sits above it at the end of the list.

### Q8 — 42s–45s · progress 10/12 · **multi select**, scrollable
> **"What are your goals with Runout Poker?"** ← **the only question that hard-codes the brand name**
> *(no sub-copy)*

Full option list (7 options):
1. **Increase win-rate**
2. **Become consistently profitable**
3. **Play more disciplined**
4. **Go deep in tournaments often**
5. **Feel confident playing with anyone** (2-line card)
6. **Stop second-guessing decisions**
7. **Become a professional**

### Q9 — 77s · progress 11/12 · single select · **appears AFTER account creation**
> **"How much time do you want to train each day?"**
> "Consistency matters more than long sessions for hitting your goals"

Options: **2 min / day** · **5 min / day** · **10 min / day** · **15 min / day** · **20 min / day** · **30 min / day**

Note "5 min / day" mirrors the hero headline ("Play better poker in 5 minutes a day"), pre-anchoring the low-friction choice.

---

**Branching / echoing — findings:**
- **No branching observed.** Q8's option "Go deep in tournaments often" is shown even though the user selected Sit & Go in Q4; Q7's list is identical regardless of the Q1 level answer.
- **No question echoes a prior answer.** Nothing says "Since you play Sit & Go…" or "As a Competent player…". The only personalization signal in the entire flow is the generic sub-copy ("This will be used to calibrate your trainer").
- **Nothing is skippable.** No "Skip" or "Prefer not to say"; the only escape is the back chevron. Single-selects have no way to proceed without answering; multi-selects have a disabled Continue.
- Questions are split around the signup wall: **Q1–Q8 before, Q9 after.** That's deliberate — the account gate lands at ~83% progress, when sunk cost is high.

---

## 3. Interstitials and persuasion beats

In sequence:

**A. (10s) "Poker trainer that learns from you"** — before the questions. Full copy in §1/S2. The TikTok analogy is the whole pitch.

**B. (12s) "We'll take you all the way through the game" / "Until you've mastered every part"** — before the questions.

**C. (47s → 50s) Rising-line stat, animated count-up.** Placed immediately after Q8, before the account gate.
- **"86%"** at 47s → **"91%"** at 50s. Numeral is ~62pt ultra-heavy white, left-aligned at 24pt gutter, top ~135pt. It is **counting up** — the final value is 91%.
- Sub-copy directly under it, 2 lines, ~18pt #8E8E93, left-aligned: **"Of players increase / their Win Rate in 2 Weeks*"**
- Visual: a thick indigo gradient curve sweeping from bottom-left to upper-right, terminating in a **64pt rounded-square glass chip (radius ~20pt, fill #8AA3F5 at ~60%)** containing a white trending-up arrow. The chip and curve endpoint also translate upward between 47s and 50s — the whole chart animates.
- Bottom block, centered: **"Winners train."** (~24pt heavy white), **"Everyone else guesses."** (~20pt #8E8E93), and the disclaimer ***"*based on internal user surveys"*** (~15pt, italic, #6E6E73).
- Button: white **"Continue"**.

**D. (52s) Falling-line stat.**
- **"56% less"** (~62pt ultra-heavy, centered, top ~120pt)
- **"Mistakes per 100 hands ↓*"** (~18pt #8E8E93, centered — note the inline down-arrow glyph and the asterisk)
- Chart: a thick indigo S-curve descending left→right with soft glow. Y-axis label **"Mistakes"** rotated 90° in indigo at ~14pt on the left; X-axis label **"Reps over time"** in #5B5BFF at ~17pt, bottom-right.
- **"Train smarter"** (~24pt heavy) / **"Hands that adapt to your play style"** (~20pt grey) / ***"*based on internal user surveys"***
- Button: white **"Continue"**.

**E. (55s → 60s) "The training system that adapts to you." — assembling loop diagram.**
- 55s: only a thin white circle outline (~185pt diameter) with two bright indigo arc segments and a large soft indigo radial glow behind it. Headline already in place at the bottom: **"The training system that adapts to you."** (2 lines, ~28pt heavy, centered).
- 57s: nodes fade in one by one. **"Improve"** in the center (~24pt). Around the ring: **"Analyze"** (top, magnifier icon chip), **"Play"** (left, play-button icon chip), **"Detect"** (right, warning-triangle chip, still ghosted at 57s), **"Retrain"** (bottom, hand-with-cards chip, appears by 60s).
- Decorative satellites: a **range-grid fragment** with cells "QTo / AA / KJs / 53s / A7s / QJs / QJo" (red cells = folds, green = plays, grey = mixed) at upper-left; three fanned **Q** cards + a stack of poker chips at upper-right; three fanned **J/Q/K** cards at lower-left; and a **mini action bar** at lower-right showing "15% | **80%** | 5%" over "Fold / Call / Raise" with Call highlighted green.
- 60s: the headline stat lands on top: **"100%"** (~62pt, centered) / **"Of sessions adapted to / your mistakes"** (2 lines, ~18pt grey, centered). Button: white **"Continue"**. *(Note: this one carries **no asterisk/disclaimer**, unlike C and D.)*

**F. (80s) Notification pre-prompt** — see §1/S18.

**G. (85s–92s) Rating solicitation** — see §1/S19.

**H. (95s) "Time to build your custom poker trainer"** — see §1/S20.

**I. (97s–107s) Fake computation loader with rotating testimonials** — see §4.

**J. (110s–112s) Checkmark completion beat** — see §1/S22. Partially illegible.

**K. (115s–120s) "Join a Community Built Around Real Improvement" — before/after carousel.**
- Headline 2 lines centered: "Join a Community Built" / "Around **Real Improvement**" — the last two words in **#5B5BFF**, same ~28pt heavy weight.
- One large card (344pt wide, radius ~24pt, fill #141416) containing a **two-column Before/After comparison**:

**Slide 2 (shown first, at 117s):**
| Before | After |
|---|---|
| February 2025 | January 2026 |
| **-$6,971.68** (red #FF4444) · "All time" | **$27,912.81** (green #22C55E) · "All time" |
| jagged red sparkline w/ red glow | jagged green sparkline w/ green glow |
| ↓ **-28%** | ↑ **+226%** |

> Quote (verbatim): *"The trainer adapts to how you play, not how it thinks you should play. It keeps showing me the same mistakes until I stop making them, which directly improved my decisions and my results. My sessions are more profitable now because I'm not guessing in the same spots."* – **Viraj M32**

**Slide 1 (shown at 120s):**
| Before | After |
|---|---|
| July 2023 | April 2025 |
| **-$8,011.42** · "All time" | **$22,056.22** · "All time" |
| red sparkline | green sparkline |
| ↓ **-71%** | ↑ **+144%** |

> Quote (verbatim): *"I've tried a lot of training tools, but this is the first one that actually increased my win rate. The custom trainer targets the exact spots I was losing money in and forces me to fix them. Once those leaks closed, the results showed up quickly. "* – **Roy M28** *(note the stray space before the closing quote mark)*

- Two-dot page indicator below the card; it **auto-advances backwards** (dot 2 active at 117s, dot 1 active at 120s).
- Button: white **"Continue"**.

---

## 4. The diagnosis / results screen

**Critical finding: there is no diagnosis screen.** The flow performs the *theater* of computing a personalized plan and then never shows one. There is no score, no leak report, no plan summary, no projection chart, no "your biggest leak is X" screen. The loader ends → a checkmark → community social proof → paywall.

What exists in its place:

### The loader (97s–107s) — "Building Your Custom Poker Trainer"
- Headline, 2 lines centered, ~28pt heavy: "Building Your **Custom**" / "**Poker Trainer**" — "Custom Poker Trainer" in #5B5BFF.
- A single card (344pt wide, radius ~24pt, pure black #000 fill) containing **three sequentially-filling progress bars**, each with a ~19pt semibold white label above and a 6pt rounded track below:
  1. **"Analyzing your level"**
  2. **"Comparing against our database"**
  3. **"Configuring your custom drills"**
- Measured fill progression across frames:

| t | Bar 1 | Bar 2 | Bar 3 |
|---|---|---|---|
| 97s | ~37% | 0 | 0 |
| 100s | 100% | ~1% | 0 |
| 102s | 100% | ~66% | 0 |
| 105s | 100% | 100% | ~25% |
| 107s | 100% | 100% | ~99% |

- Below the card, centered, ~19pt semibold white: **"This might take up to 30 seconds"**. Actual observed duration ≈ 12–13s. **Purely theatrical — the bars are timers, not work.**
- Below that, a testimonial card (radius ~24pt, translucent dark fill, hairline stroke) that **cross-fades through four states** while the bars fill:
  - **97s — Viraj Patel (M31)** ★★★★★ — same body text as the "Immediate leak fixer" review in S19, verbatim.
  - **100s — Kevin Arderson (M24)** ★★★★★ — *"I've used solvers before, but I always struggled to translate outputs into real decisions at the table. This app bridges that gap by forcing you to think through spots instead of memorizing charts. It highlights the reasoning behind lines and adjusts difficulty as you improve, which keeps it challenging without being overwhelming. I'm playing fewer hands on autopilot and making cleaner decisions under pressure. It's the first training tool I've stuck with consistently."*
  - **102s / 105s — Krish Gupta (M38)** ★★★★★ — *"Most poker apps feel impressive at first but don't actually change how you play. This one does. It learns what you struggle with and keeps pushing you just past your comfort zone. Over time, spots that used to feel stressful now feel automatic. That compounding effect is what keeps me coming back."*
  - **107s — Viraj Patel (M31)** again (loops).
- The "(M31)", "(M24)", "(M38)" suffixes are unexplained — presumably "male, age 31" — and they conflict with the community slide, which calls the same person **"Viraj M32"**.

### The only numeric "results" the user ever sees
…are inside the **pre-rendered marketing video on the paywall** (§5), showing another user's account, not theirs:
- Home screen: title **"Poker Wizard"**, card labelled **"Poker rating"** with a flame streak chip reading **2**, value **1,246** (~48pt), and **"+32 last session"** in green. Below: **"⚙ Recalibrate Trainer"** button, then **"Your core statistics"** with a **"View All ›"** link.
- Stat tiles (2-up grid, radius ~20pt, waveform icon + label + ⓘ): **H-SCN 72** (4/6 segment bar lit, cyan), **H-SEL 24** (2/6 lit), **THRY**, **PMATH**.
- Stats detail screen: **"Your Statistics"**, segmented control **Total | Cash Game | Tournament**, section label **"Type"**, tiles **H-SCN 2**, **H-SEL 0**, **THEORY 0**, **PMATH 0 / 100**, plus a **"Street performance"** card with four ring gauges: **Preflop 0 · Flop 0 · Turn 0 · River 0**. (At 142s the same mock reads **H-SCN 10, H-SEL 1** — the video shows the numbers climbing.)
- The acronyms (H-SCN, H-SEL, THRY/THEORY, PMATH) are never expanded anywhere in the flow.

**Verdict on computed vs. static:** *everything* is static. Nothing in the entire 146s references a single answer the user gave.

---

## 5. The paywall

### Structure (122s–132s)
Two zones, hard-split at ~55% screen height:

**Above the fold — top ~55%:** a **looping vertical marketing video** with burned-in captions, playing an iPhone-in-a-bezel mock (orange/titanium frame) against a white-to-grey vertical gradient that fades to the dark sheet below. Two caption cards observed:
- **"YOUR CUSTOM"** (white) / **"POKER TRAINER"** (cyan #29A8E0), all-caps, ~34pt ultra-heavy, hard drop shadow — plays over a **drill + feedback** sequence.
- **"DEEP ANALYSIS"** (white) / **"OF YOUR WEAKNESSES"** (cyan, overflows both edges of the screen), same treatment — plays over the **Poker Wizard home + Your Statistics** screens.

The drill footage inside the video is the most informative frame in the whole recording (see §6): board **Q♥ 7♦ 2♠**, hero **BTN J♦ J♠ 100 BB** with a **"3-bet"** badge, CO **100 BB "Raise" 2.5**, pot ~$17, an 8-chip bet in the middle, a **"ⓘ Show hand context"** chip, a 2×2 action grid — **Check** (neutral) · **Bet 4bb** (green = correct) · **Bet 9bb** (red = what the user picked) · **Bet 17bb** (neutral) — and a feedback panel: red ✕ badge, **"Not quite!"**, then verbatim:
> "JJ on a Q72 board in a 3-bet pot as the preflop aggressor — you should bet small. Despite the overcard, JJ is still a strong hand and you have a range advantage with QQ+, AK, and AQ in your range. A small c-bet of 25% pot denies equity from gutshots and [cut off: "…pairs, ge[ts] thin value…"]"

The second video clip shows a different hand: board **T♣ 8♣ 2♦**, hero **CO Q♠ 9♠ 40 BB "3-bet"**, feedback **"Not quite!"** with "…should check. This may be the tou[ghest spot in] this quiz! Usually, when you pick […] uing to barrel is good. At this Sta[ge] […] you want to make sure to reali[ze] […] this hand. If you choose to bet Qs…"

**Below the fold — the pricing sheet** (radius ~28pt top corners, near-black #0A0E1A fill with a faint indigo radial behind the card row):

- **Headline (verbatim, 2 lines, centered, ~24pt heavy):** "Get Unlimited Access to Your Custom Trainer!"
  - At 122s, mid-scroll, only "Your Custom Trainer!" is visible — the sheet slides up over the video.
- **Two side-by-side plan cards**, ~165 × 114pt each, 14pt gap:

| | **1 Month** | **1 Year** |
|---|---|---|
| Badge | — | **"BEST VALUE"** — a lavender (#B9AEF5) pill straddling the top border, black uppercase ~13pt bold |
| Headline price | **"$4.60 per week"** | **"$1.72 per week"** |
| Divider | hairline #2C2C2E | hairline |
| Actual price | **"$19.99 per month"** | **"$89.99 per year"** |
| Border | 1px #2C2C2E | **2px #8A8AFF**, slightly lighter fill |

- **Default selection:** the **1 Year** card is visually pre-selected (brighter 2px border + BEST VALUE badge). There is **no radio/check control** on either card, so selection state is communicated by border alone — ambiguous.
- **Under the cards, centered, ~17pt #9AA0A6:** "Subscription, Cancel Anytime"
- **Primary CTA:** a **full pill** (radius = height/2), 344 × 49pt, solid **#3D7BFF**, label **"Continue on the web ↗"** (~19pt bold white, with a trailing external-link glyph). ← **The primary path is a web checkout, not IAP.**
- **Secondary:** **"Continue in app"** — plain #3D7BFF text link, ~19pt bold, centered, ~18pt below the pill.
- **Footer row, ~17pt underlined:** **Terms** · **Privacy** (bottom-left, side by side) … **Restore** (bottom-right).

**What is NOT present, notably:**
- No free trial, anywhere. No "3 days free". No trial timeline graphic.
- No savings badge or strike-through (e.g. "Save 62%") — only "BEST VALUE". *(For reference: $89.99/yr vs $19.99×12 = $239.88 is a real 62% saving, unclaimed.)*
- No feature/benefit bullet list.
- No countdown timer, no seat scarcity.
- No star rating, review count, or "X players trained" number on the paywall itself — all social proof was spent *before* it.
- No close button visible in the captured frames (the "One time offer" modal above it has one, the paywall itself does not appear to).

### Downsell modal (135s) — triggered by attempting to leave
Full-screen sheet, radius ~28pt top corners, deep navy #101A2E with an indigo radial, layered over the paywall. A **✕** at top-right (~28pt).
- **Headline:** **"One time offer!"** (~40pt ultra-heavy, centered, top ~24%)
- **Sub:** "You will never see this again" (~19pt #9AA0A6)
- **Icon:** 72×72pt rounded square (radius ~22pt), blue→teal gradient, white gift-box glyph.
- **Offer card** (344pt, radius ~24pt, translucent glass with hairline stroke):
  - Row: "Here's your" (~22pt white) + a **white pill badge** with black bold text **"60% off"**
  - Price block: a wide inset chip, **"$34.99 / year"** (~34pt ultra-heavy white, centered)
  - **"That's just $2.91 / month, billed annually"** (~17pt #9AA0A6)
  - **"Lowest price ever"** (~17pt #9AA0A6)
- **CTA:** white full-width rounded-rect, black label **"Claim my limited offer now"** (~19pt semibold), pinned bottom.
- **No Terms/Privacy/Restore links on the downsell.** No "no thanks" text link — the only exit is the ✕.
- Math check: $34.99 vs $89.99 = 61% off the annual plan, so "60% off" is honest *relative to the annual*; it is 85% off the monthly-equivalent. "$2.91/month" checks out ($34.99÷12).

### Native purchase sheet (137s–140s)
> **App Store**
> **Yearly Subscription** — Runout Poker Trainer GTO Coach `9+` — Subscription
> **$34.99 per year** / "1-year offer"
> **$34.99 per year** / "Starting Aug 3, 2027"
> "Cancel anytime in Settings > Apple Account at least a day before each renewal date. Plan automatically renews until canceled."
> Account: mguptop@icloud.com
> **Double Click to Subscribe** → **Confirm with Side Button**

Note: the "one time offer" price is configured as an **introductory offer that lasts two years**, then renews at the same $34.99 — i.e. it is effectively the permanent price, not a one-year promo. Also note the downsell is purchased via **IAP**, while the main paywall pushes users to **web checkout** — they take the 30% hit only on the discounted plan.

### After purchase / after dismiss
- **After purchase: not observed.** The recording ends before confirmation.
- **After dismissing the IAP sheet (142s):** the user lands back on the **downsell modal, still open**, over the paywall, over the still-looping video. There is no "are you sure" and no third offer in the captured window. The ✕ on the downsell is the only remaining exit and where it leads is unknown.

---

## 6. The practice / drill loop

Two variants are visible: the **cold-start demo** on the hero screen (frames 1–3) and the **real product** inside the paywall video (frame 50). They differ meaningfully.

### Table rendering
- A **vertical oval** occupying roughly x=24→736px (12–380pt) and y=200→1050px, i.e. ~370×440pt, centered horizontally, top-anchored.
- Fill: a **radial gradient** from ~#2E2E78 at the center to ~#141440 at the rim — a blue/indigo "felt", not green.
- Two concentric **stroke rings**: an outer ~2pt **#7B6CFF** ring with a heavy outer bloom (~20pt spread) reading as a neon rail, and an inner ~1pt **#9B93FF** hairline about 10pt inside it. The glow is the single strongest brand signature.
- A wide, soft **green ambient glow** bleeds up from below the hero seat, and a dark-green haze sits behind the table's lower-left/right — reads as a felt light-spill.

### Seats
- Each seat is a **pill** (radius = full, height ~26pt) split into two halves: a **position label** on the left (green **#22C55E** bold for the hero's "BTN", white for villains "CO"/"BB") and a **stack** on the right in white bold on a slightly darker inset.
- **Inactive/folded seats** (UTG, HJ, SB) render at ~20–25% opacity, still showing "UTG $500" etc. When BB folds (2s), its pill flashes a **red stroke** before dimming.
- **The hero seat carries a 2pt green stroke + green outer glow.**
- The **last action** appears as a small badge pill directly under the seat, fill **#4F46E5**, white ~13pt bold: observed values **"Check"**, **"Bet"**, **"Call"**, **"Raise"**, **"3-bet"**.
- **Dealer button:** a ~22pt gold/amber circle with a black **"D"**, sitting to the right of the hero pill.
- **Bets in front of a seat** render as `$18` in white ~17pt next to a small ~20pt multicolour poker-chip glyph (blue/teal for villains, orange/gold in the paywall video).

### Hand and board
- **Pot:** a rounded pill at table-center-top, dark #1C1C1E: grey label **"Pot:"** then the amount in white bold inside a slightly lighter inset chip. e.g. `Pot: $74` → `$219` → `$324` → `$669` as streets run out.
- **Community cards:** white rounded rects, ~34×54pt, radius ~7pt, 8pt gaps, laid out **flop in a row of 3, turn and river on a second row below** (an unusual 3-over-2 layout rather than a single row of 5). Rank glyph top-left in heavy black ~22pt, suit pip below it ~18pt. Suits are colour-coded four-colour-deck style: ♦ blue, ♣ green, ♠ black, ♥ red.
- **Undealt cards:** dark navy backs with a diagonal hatch/stripe pattern, same footprint, ~50% opacity.
- **Hero hole cards:** two cards **fanned and overlapping ~40%**, sitting directly on top of the hero seat pill, slightly larger than board cards.

### Action bar and frequency display
**Demo variant (hero screen):**
- Four equal buttons in **one row**: measured at x 19–190, 203–374, 387–558, 570–741 px → each **~88pt wide, ~7pt gaps, 10pt outer margin**, height ~44pt, radius ~16pt, fill #1C1C1E, hairline #2C2C2E, label ~18pt semibold white.
- Labels: **Fold · Call · Raise · All-in**.
- Directly above each button, a **percentage capsule** (~55×27pt, radius full, dark fill, grey ~17pt text) showing the GTO frequency for that action. Observed:
  - 0s: **5% · 52% · 28% · 15%** — **Call** capsule and Call button both turn **#22C55E green with a green stroke and glow**.
  - 5s: **3% · 22% · 58% · 17%** — **Raise** highlighted green.
- So the frequency row is **revealed as feedback after the decision**, not before: at 2s the percentages have vanished entirely and only the four neutral buttons remain, mid-transition to the next street. The correct-frequency action is the one that lights green.

**Real product variant (paywall video):**
- **2×2 grid** of buttons instead of 1×4, with **sizing-specific labels**: `Check` · `Bet 4bb` · `Bet 9bb` · `Bet 17bb`. Sized to the spot, not generic.
- **No percentages shown.** Instead: **green stroke+glow = the correct action**, **red stroke+glow = the action you chose**, remaining two stay neutral dark.
- Above the buttons, a centered chip: **"ⓘ Show hand context"** (radius full, dark fill, ~17pt) — an on-demand disclosure of the preflop action / stack context.
- Below the buttons, a **feedback panel**: a ~28pt rounded-square red badge with a white ✕, then **"Not quite!"** in ~22pt bold white, then a multi-paragraph **prose explanation** at ~15pt #C7C7CC (transcribed in §5) that names the hand, the board, the pot type, the range-advantage reasoning, and the recommended sizing as a % of pot.
- Stacks are expressed in **BB** ("100 BB", "40 BB") in the real product vs. **dollars** ("$470") in the hero demo.

### "Next" affordance
Never explicitly shown. In the hero demo, the hand simply **auto-advances**: between 0s and 2s the feedback row disappears, chips sweep, and by 5s the turn is dealt with an updated pot and a fresh frequency row. In the real product the explanation panel scrolls and presumably has a Continue below the fold — **not captured**.

---

## 7. Visual system

**Colour palette (approximate hex, sampled):**
| Role | Hex | Where |
|---|---|---|
| Canvas | `#000000` → `#0B1020` | pure black at top, deep navy gradient toward the bottom on most screens |
| Surface / card | `#1C1C1E` (options), `#141416` (testimonial), `#000000` (loader card) | |
| Hairline stroke | `#2C2C2E` | all card borders |
| Primary indigo | `#4F46E5` / `#5B5BFF` | progress bar, selected states, action badges, glyph chips, "custom poker trainer" accent text |
| Bright link/CTA blue | `#3D7BFF` | paywall pill + "Continue in app" |
| Pale lavender | `#8A8AFF` / `#B9AEF5` | selected plan border, BEST VALUE badge |
| Correct green | `#22C55E` with `#2FE08A` glow | hero seat, correct action, After column, "+32 last session" |
| Wrong red | `#EF4444` / `#FF3B47` | wrong action, Before column, folded seat flash, "Not quite!" badge |
| Table felt | `#2E2E78` → `#141440` radial | |
| Table rail | `#7B6CFF` outer, `#9B93FF` inner | |
| Gold | `#FFB800` | 5-star ratings, dealer button |
| Video caption cyan | `#29A8E0` | paywall burned-in captions only |
| Text primary | `#FFFFFF` | |
| Text secondary | `#8E8E93` / `#9AA0A6` | sub-copy |
| Text tertiary | `#6E6E73` | "You can adjust later", asterisk disclaimers |

**Typography.** One family throughout — a tight geometric grotesque (reads like Inter Tight / Basis Grotesque Display; double-storey `a`, straight-tailed `y`, tight apertures). Only two weights in practice: **Bold/Heavy** and **Regular**. Scale:

| Token | Size (pt) | Weight | Use |
|---|---|---|---|
| Display XL | ~62 | Heavy | "86%", "56% less", "100%" |
| Display L | ~40 | Heavy | "One time offer!" |
| Display M | ~34 | Heavy | signup headline, "$34.99 / year", video captions (all-caps) |
| H1 | ~30 | Heavy | every question headline, most interstitial headlines |
| H2 | ~24 | Heavy | "Winners train.", paywall headline, "Improve" |
| Body L | ~19 | Semibold | button labels, loader step labels, "This might take up to 30 seconds" |
| Body | ~18 | Regular | question sub-copy, interstitial body |
| Body S | ~17 | Semibold / Regular | option titles / prices |
| Caption | ~15 | Regular + *Italic* | option descriptions, "You can adjust later" (italic), asterisk disclaimers (italic) |
| Micro | ~13 | Bold, letterspaced, caps | "RUNOUT POKER" chip, "BEST VALUE" |

Question headlines are **left-aligned**; interstitial and paywall headlines are **centered**. That's a consistent and deliberate split: "you're answering" vs "we're telling you".

**Corner radii:** option cards & plan cards & testimonial cards **~20–24pt**; primary CTA rounded-rect **~14–16pt**; icon chips **~18–22pt** on a ~60–72pt square (squircle-ish); playing cards **~7pt**; badges, capsules, seat pills, and the paywall CTA **fully rounded (pill)**.

**Button styles and where each is used:**
1. **White solid, black label, rounded-rect 344×51pt** — the universal "advance" CTA everywhere in onboarding (Get Started, Continue, Enable notifications). Pressed state = fills **#C7C7CC grey** (visible at 50s, 92s, 95s, 120s).
2. **Grey disabled** (#3A3A3C fill, #8E8E93 label) — multi-select Continue before a selection; the 7s cascade Continue.
3. **Blue solid pill (#3D7BFF)** — used exactly once, for the paywall's primary web-checkout CTA. The colour change is the tell that this is the money button.
4. **Text link** — "Maybe later" (grey), "Continue in app" (blue), "Terms / Privacy / Restore" (underlined grey).
5. **Circular icon button** — the ~50pt back chevron, dark fill with radial glow, top-left of every question.

**Iconography.** Two systems, inconsistently mixed:
- Line icons (eye, bar chart, 3×3 dots, bell, magnifier, warning triangle, play, waveform) rendered **inside 60–72pt rounded-square glyph chips** — either white glass with a blue glow or dark indigo with a thin indigo stroke.
- Full-colour raster/emoji: 🎯 in the mock notification, the multicolour chip glyphs, the gradient gift box, the gold stars.
- App icon: black rounded tile, a **blue-to-teal gradient mortarboard sitting on a spade**.

**Motion observed across consecutive frames:**
- Hero table plays a real hand and auto-advances streets (0→5s); feedback row fades out before the street changes.
- Table cascade: ~6 table cards tumble diagonally with rotation + scale parallax (5→10s).
- Curriculum tiles and loop-diagram nodes **stagger in one at a time** (12s; 55→60s).
- Stat numerals **count up** (86% → 91%) and the chart's endpoint chip translates along the curve (47→50s).
- Loader bars fill sequentially, testimonial card cross-fades between four reviewers (97→107s).
- Card + checkmark badge **pop/scale-in**, then the whole screen cross-fades to black between beats (110→112s, 115s) — transitions are full-screen dissolves, not slides.
- Community carousel auto-advances (and appears to move backwards, 117→120s).
- Paywall sheet **slides up over the video** (122→125s); the video itself loops continuously through 4 app screens.
- Button press states are captured repeatedly (white → grey), so there's a real tap-down treatment.

---

## 8. What they do well — worth copying

1. **Cold-open with a working drill, not a logo.** Frame 0 is a live hand with real percentages and a green-glowing correct answer. The user understands the product in under two seconds, before a single word of copy. The headline is *underneath* the demo, which is the right hierarchy.
2. **The frequency row as the entire product promise, shown for free.** `5% · 52% · 28% · 15%` above Fold/Call/Raise/All-in is instantly legible to a poker player and instantly intriguing to a beginner. It's a one-glance demonstration of "GTO" that requires no explanation. Steal this exact widget.
3. **Auto-advance on single-select, explicit Continue on multi-select** — with a visually different control (radio dot vs. checkmark) so the user never has to guess whether they can pick more than one. Eight of nine captured questions need exactly one tap. This is the single biggest driver of the flow's speed.
4. **"You can adjust later" on every question, in italic, as a persistent footer.** It removes the "am I locking myself in?" hesitation at essentially zero cost, and it's the same string every time so it becomes invisible after step two.
5. **Placing the account gate at ~83% progress.** Eight questions of sunk cost first, then signup, then one more question. The progress bar is already three-quarters full, so abandoning feels expensive.
6. **Sizing-specific action buttons in the real drill** (`Bet 4bb` / `Bet 9bb` / `Bet 17bb`) plus a prose explanation that names the reasoning ("you have a range advantage with QQ+, AK, and AQ in your range. A small c-bet of 25% pot denies equity from gutshots…"). That's a genuinely good teaching artifact and the clearest differentiator versus a chart-lookup app.
7. **"Show hand context" as an on-demand chip** rather than cramming preflop history onto the table. Keeps the drill surface clean for beginners while remaining rigorous for advanced users.
8. **Web checkout as the primary CTA with IAP as the visible fallback.** Blue pill = "Continue on the web ↗", plain link = "Continue in app". Most users take the styled button; they keep ~30% more revenue on the full-price plans and only eat Apple's cut on the discounted downsell.
9. **Per-week price framing on both plans, with the real price on a second line under a divider.** "$1.72 per week" vs "$4.60 per week" is a 2.7× gap that reads as much bigger than $89.99 vs $19.99, and putting both prices on the card avoids a bait-and-switch feeling.
10. **The 3-bar fake loader with rotating testimonials.** It converts ~13 seconds of dead time into three testimonial impressions, and "Comparing against our database" manufactures a proprietary-data claim without stating one. The "This might take up to 30 seconds" line makes 13s feel fast.

---

## 9. What they do badly — critical

1. **The personalization is entirely fake and never cashes out.** Nine questions, a "Building Your Custom Poker Trainer" loader, and "Configuring your custom drills" — and then **no diagnosis, no score, no leak report, no plan**. The user goes from loader → checkmark → testimonials → paywall. Every promise made by the questionnaire is unpaid at the moment of the ask. This is the single largest conversion leak in the flow: the paywall has nothing to charge *for* except a video of somebody else's account. **Insert a computed result screen here.** Even a crude one ("Your 3 biggest leaks: Facing aggression, Defending blinds, Poker math — based on your answers") would double the paywall's justification.
2. **No answer is ever echoed back.** Nothing says "You said you play Sit & Go" or "As a Moderately-confident player". Q8 even offers "Go deep in tournaments often" to a user who selected Sit & Go. The questionnaire is a data-collection ritual the user can tell is a ritual.
3. **Three different product names in 146 seconds.** The brand chip says **"RUNOUT POKER"**; the iOS sign-in dialog says **"PokerGame"**; the App Store listing says **"Runout Poker Trainer GTO Coach"**; the in-app home screen in the paywall video says **"Poker Wizard"**. Any one of these mismatches, seen at the moment a user is entering credentials, is a trust hit. "PokerGame" appearing in a native system dialog is the worst of them.
4. **The same testimonial text is used three times under two different attributions.** The "Immediate leak fixer" App Store review card (87s) and the "Viraj Patel (M31)" loader testimonial (97s) are word-for-word identical. And "Viraj" is **M31** in the loader but **M32** in the community carousel. A skeptical user who notices this discounts every other claim on the screen.
5. **Asking for a 5-star App Store review during onboarding, before the user has used the product.** "Your review means so much more than just 5 stars" is asking a stranger to vouch for something they haven't touched. It's also an App Store Review Guidelines risk (rating prompts must not be gated behind or manipulated by custom UI), and the fake replica of Apple's rating card layered under real gold stars is exactly the pattern Apple objects to. Ship a review prompt after the user's 3rd session instead — never in onboarding.
6. **The stat claims are self-refuting.** "86% → 91% of players increase their Win Rate in 2 Weeks" — the number visibly *counts up between frames*, so an attentive user watches the claim change. Disclaimer is "*based on internal user surveys", which for a claim about win-rate is meaningless. The "100% of sessions adapted to your mistakes" claim carries **no** asterisk at all, unlike the two before it, which draws attention to the two that do.
7. **The before/after charts don't survive five seconds of arithmetic.** "-$6,971.68 · All time · ↓ -28%" alongside "$27,912.81 · All time · ↑ +226%". A negative all-time total can't be "-28%" of anything sensible, and the date ranges are incoherent across slides (slide 1: Jul 2023 → Apr 2025; slide 2: Feb 2025 → Jan 2026 — i.e. the "after" period of one overlaps the "before" of the other). Poker players are numerate. This is the audience least likely to let that slide.
8. **Real-money-results claims for a poker product are a legal and ad-policy liability.** "$27,912.81", "+226%", "increase their Win Rate", "Become a professional" — combined with Meta advertising, this is the fastest route to account restriction and, in several jurisdictions, to a gambling-adjacent-earnings-claim problem. If you scale this with Meta ads, do **not** copy the dollar-figure charts.
9. **The paywall has no benefit content whatsoever.** No feature list, no "what you get", no hand count, no "unlimited drills", nothing. It's a headline, two prices, and a button, sitting under a video the user has to *watch* to learn what's included. Above-fold real estate is spent on a loop the user will scroll past.
10. **No free trial, and no attempt to reduce first-payment risk.** Straight to $19.99/mo or $89.99/yr, cold, from a user who has seen exactly one demo hand. For a beginner-targeted product bought off a Meta ad, this is the wrong shape — a 3-day or 7-day trial with a clear timeline graphic typically beats a hard charge at this traffic quality.
11. **The annual discount is unstated.** "BEST VALUE" is a badge, not a number. They're giving away 62% and not saying so; and there's no strike-through of $239.88. Free money left on the table.
12. **Plan selection has no control.** The two cards have no radio, no checkmark, no filled state — only a border-weight difference. A user who wants the monthly plan cannot be confident tapping the card did anything before they hit the blue button.
13. **The downsell undercuts the paywall by 61% within one tap.** $89.99 → $34.99 for pressing ✕ teaches the user that the list price is fiction, and it advertises to anyone who shares a screenshot that the real price is $35. Worse: the "one time offer" is configured as a **two-year** introductory price ("$34.99 per year, Starting Aug 3, 2027"), so "You will never see this again" and "Lowest price ever" are describing what is functionally the ordinary price.
14. **The downsell strips the legal footer.** The main paywall has Terms / Privacy / Restore; the "One time offer!" sheet has none — just a ✕ and "Claim my limited offer now". That's the screen most likely to be transacted on.
15. **Unexplained jargon in the only "results" surface.** H-SCN, H-SEL, THRY, PMATH, "Poker rating 1,246" — no expansion, no tooltip content shown, no baseline. For a **beginner** audience this is noise, and it's the sole numeric proof on the paywall.
16. **Two competing action-bar layouts.** The demo teaches a 1×4 row with percentage capsules; the actual product uses a 2×2 grid with sizing labels and no percentages. Whatever the user was sold in frame 0 is not the interface they buy. Pick one.
17. **Small stuff that adds up:** the flow's own progress bar has a step it never renders (it jumps 7/12 → 9/12); one Q1 option has a trailing period and the other four don't; the Roy M28 quote has a stray space before its closing quotation mark; the mock notification banner collides with a real system banner at 82s; the community carousel appears to advance backwards; and "Get Started" reappears as a CTA label at 12s after "Continue" was already established at 10s.

---

**Pricing note for the commissioner:** this competitor sits at **$19.99/mo · $89.99/yr · $34.99/yr downsell**, with **no trial**. The planned $32.99/mo · $119.99/yr is ~65% / ~33% above them at list. That's defensible only if the diagnosis screen this app skips actually exists in yours — which, given §4, is the clearest available wedge.