# Astral Tutor → Runoutly
### Onboarding teardown, and what to steal

*Source: the 2:43 screen recording on your Desktop (`Screen Recording 2026-08-02 at 1.45.06 PM.mov`), read frame by frame at 3-second intervals.*

---

## What the recording actually is

**It's not a poker app.** It's [Astral Tutor](https://astraltutor.com) — an AI adaptive-math product for K-8 kids, sold to parents. The recording is a full signup: nine onboarding steps, a product demo video, and a "we're building it now" completion screen.

If that was intentional, good instinct — it's one of the better consumer-subscription onboarding flows shipping right now, and it's structurally *identical* to what you need: a long personalization wizard that makes the user invest before they're asked for money. Everything below is written against that reading.

If you meant a different recording, tell me — there's no poker video on your Desktop (the only other `.mov` is your own BodyFix onboarding flow).

**One note on their model vs yours:** there is **no paywall anywhere in this recording**. The only monetization language in 2:43 is the phrase *"What's in your 14-day free trial?"* — no price, no card, no terms. They collect a phone number at 100% and end on "you can close this page." So they're trial-first with an async wall somewhere downstream. You're hard-paywall. That means you can steal their *investment mechanics* wholesale, but their *ending* is the single worst part of the flow and you must not copy it.

---

## The nine steps, verbatim

| # | Progress | Question | Sub-copy | Options |
|---|---|---|---|---|
| 1 | 0% | What should we call you? | We'll use this to personalize your experience. | Parent's first name · Last name |
| 2 | 35% | Which state do you live in? | We customize content based on your local educational standards. | *(all 50)* |
| 3 | 55%→41% | Who are we teaching? | We personalize their dashboard and learning experience. | Name · age · Boy/Girl · profile color · **Add another child** |
| 4 | 53% | *(headline scrolled off)* | Type anything or choose from the list below | Interest chips across 5 emoji-headed categories + free text |
| 5 | 64% | What grade has **Jake** completed? | — | Grade 4–8, **each described by its topics**, not its number |
| 6 | 74% | *(headline scrolled off)* | — | Neurodivergent / Learning challenges / Advanced chips + **"Anything we missed?"** free text |
| 7 | 83% | Would you like to personalize to your faith? | Astral can weave your family's beliefs into every lesson. | Yes → describe faith + 3-stop integration slider · No |
| 8 | 92% | *(interstitial)* First lesson will be ready in a few. Takes only *15 mins* to do. | **What's in your 14-day free trial?** | Timeline: Discovery Lessons → **Grade Mastery Report** → Teaching Lessons |
| 9 | 100% | What's the best number to let you know when the first lesson is ready? | *(6 lines of 10px SMS consent)* | phone |

Note step 5. They ask a 15-year-old's parent which grade he finished — with **no pre-selection**, even though they collected his age two steps earlier. That's the tell that this flow is optimized for *felt personalization*, not for minimizing input. Every extra question is deliberate.

---

## The seven things worth stealing

**1. Reframe the quiz as construction, not interrogation.**
A persistent header reads **"Personalize your child's curriculum"** with a live percentage, on every step. That single line is why they get away with nine questions where most products die at four. The user isn't filling a form — they're watching something get built for them.

*For Runoutly:* header reads **"Building your training plan"** with the same live %.

**2. Describe options by their content, never their label.**
Grade 6 isn't "Grade 6." It's *"Grade 6 — Ratios, Percentages, Negative numbers, Expressions & equations."* A parent who genuinely doesn't know where their kid sits can self-identify by recognizing topics.

*For Runoutly:* never ask "beginner / intermediate / advanced" — nobody knows which they are, and everyone over-rates themselves. Ask it as recognition:
> *"I know which hands to play but freeze after the flop"*
> *"I've seen range charts but don't really use them"*
> *"I can explain why I made a bet, most of the time"*

That's a far more accurate skill estimate than self-report, and it feels like being understood rather than graded.

**3. Echo their own words back within 30 seconds.**
Step 5 says *"What grade has **Jake** completed?"* — using the name from step 3. Cheapest personalization signal there is and it lands instantly.

*For Runoutly:* once they pick their stake in Q1, every later question uses it. *"At $1/$2, how often does this happen?"* Not "at your stakes."

**4. End every chip screen with a free-text escape hatch.**
After the structured chips: **"Anything we missed?"** → *"i.e. diagnoses, preferences, or anything unique about how your child learns."*

*For Runoutly:* this is worth more to you than to them, because you have an AI coach that can actually use it. **"Tell me about a hand that still bugs you."** Free text, optional, and it goes straight into the coach's context for that user's first session. Nobody else in poker training collects this.

**5. Sell during dead time.**
While the user types a password, the right 43% of the screen auto-scrolls an expert testimonial, a live "Maya's Personalized Journey" mastery card, and a four-item benefit list. Zero added friction, meaningful added persuasion.

*For Runoutly:* on mobile there's no side rail, but the same principle applies to any screen where the user is typing or waiting — the diagnosis-computing moment especially.

**6. Sell the trial as a narrative with a deliverable in the middle.**
Their step 8 is a timeline: Discovery Lessons → **Grade Mastery Report** → Teaching Lessons. The parent learns the trial *produces an artifact*, not just usage.

*For Runoutly:* insert this immediately before the paywall. **Your first 20 hands → Your Leak Report → Your 6-week plan.** It makes the thing they're buying concrete.

**7. Quote the user back to themselves, with evidence.**
The strongest thing in the entire product: their gap report quotes the child verbatim next to a video replay — *"Skipped the slide after stating, 'It's too complicated,' and asking, 'Is this just algebra?'"* That's a retention asset almost nobody can produce.

*For Runoutly:* your equivalent is the actual hand. If a user plays even one spot during onboarding, the diagnosis can show **the hand they misplayed**, not a generic leak label. See the recommendation below — I think this is the single biggest opportunity in the whole flow.

---

## The six mistakes to design against

**1. Their progress bar goes backwards.** 0% → 35% → 55% → **41%** → 53% → 64% → 83% → 92% → 100%. It regresses after you add a child, and it reads 0% even with both name fields filled. A progress indicator that moves backwards is worse than none — it's the one element whose entire job is to be trusted.
→ *Make progress strictly monotonic and assert it in a test.*

**2. They take an SMS opt-in before mentioning money.** The final step collects a phone number under the least legible text in the product — six lines of 10px low-contrast consent — and the only pricing language anywhere is "14-day free trial." Consent sequenced ahead of disclosure.
→ *Your paywall states the price plainly and never collects anything before it.*

**3. The flow dead-ends with no CTA.** "You're all set!" has a headline, an ETA, a status row, and **no button**. The highest-intent moment in the entire funnel produces zero next action. The literal instruction is "You can close this page."
→ *Your diagnosis flows straight into the paywall with one button and no exit.*

**4. The product demo is a passive 48-second video with a Skip button in the corner.** Their most persuasive material — live tutor calls, animated explanations, evidence-backed reports — is delivered as a screencast you can dismiss in one click and cannot touch. The person recording it even scrubbed *backwards* to re-watch, which says the pacing is too fast to absorb.
→ **This is their biggest miss and your biggest opportunity.** See below.

**5. Two different chip metaphors in the same wizard.** On Interests, selecting a chip *removes it from the list* with no visible selected state anywhere — you can't tell what you picked. Three steps later, selecting a chip *keeps it* and turns it lime with an ×. Same component, opposite behavior.
→ *One interaction model per component, enforced in the styleguide.*

**6. Disabled "Next" is a light grey filled pill on near-black — it out-contrasts the enabled lime state.** At 96s they have to animate an arrow pointing at the button, which is an admission the CTA isn't finding the eye.
→ *Disabled states reduce opacity of the enabled style. Never a different fill.*

---

## The one change I'd argue for

Their fatal flaw is that the parent never *touches* the product before being asked to commit. Forty-eight seconds of watching, then a phone field.

You can fix this trivially, and it costs you nothing under a hard paywall:

> **Let them play exactly one hand, inside onboarding, before the wall.**

One spot. Real table, real decision, real grade, real frequency bar, real AI explanation. Then the diagnosis screen says:

> *"You folded AJo from the button. A solver raises it 71% of the time — that fold costs you about 0.2bb every time it happens. Here's what else we found."*

That's not a free trial. It's a demo — and it converts a hard paywall far better than any amount of copy, because the user has felt the product's core loop and the diagnosis is now **about a hand they actually played** rather than a self-reported symptom. It's Astral's evidence-quoting trick, except yours writes itself.

Cost: one substage. Everything it needs already exists by the time you reach Stage 7.

---

## Two decisions for you

1. **Quiz length — 5 questions or 8?** Astral runs nine and converts well, because the "we're building your plan" framing turns questions into investment. More questions = more sunk cost = higher conversion at the wall, but every added step also leaks users. My read: **go to 8**, with the framing and monotonic progress. Your call.

2. **One free hand before the paywall — yes or no?** Strong recommend yes, for the reasons above.

Tell me both and I'll rewrite substages 7.1 and 7.2 accordingly.
