import Link from "next/link";

const FEATURES = [
  {
    title: "Real spots, not flashcards",
    body: "Every hand is a genuine situation you will face at the table — position, stack depth, and action history included.",
  },
  {
    title: "See the whole strategy",
    body: "Not just 'right' or 'wrong'. See how often a solver takes each action, and what choosing differently actually costs you.",
  },
  {
    title: "Graded on what it costs",
    body: "Poker is a distribution, not an answer key. Decisions are scored on expected value lost, so a reasonable line is never marked wrong.",
  },
  {
    title: "A coach that explains",
    body: "Ask why. Get a plain-English explanation of the spot, written for someone who does not already speak solver.",
  },
  {
    title: "A path, not a firehose",
    body: "A guided curriculum from preflop fundamentals through board texture and bet sizing, plus a daily challenge to keep the habit.",
  },
  {
    title: "Practise against real opponents",
    body: "Play full hands against opponent types you actually meet — the calling station, the nit, the maniac — then review what went wrong.",
  },
];

const FAQ = [
  {
    q: "Is this gambling?",
    a: "No. SuitedPoker is educational software. There is no wagering, no real money at stake, and nothing to win or lose. You practise decisions against precomputed strategy and get feedback on them.",
  },
  {
    q: "Do I need to know poker already?",
    a: "You need to know the rules and hand rankings. Everything after that — position, ranges, board texture, bet sizing — is what the curriculum teaches, starting from the beginning.",
  },
  {
    q: "What is a solver?",
    a: "A program that calculates the mathematically optimal way to play a poker situation. Professionals have used them for years. They are expensive and hard to read, which is the gap this fills.",
  },
  {
    q: "How much time does it take?",
    a: "Around ten minutes a day. The daily challenge is five hands and takes about three.",
  },
  {
    q: "Does it work on my phone?",
    a: "Yes. It is built for mobile first and runs in the browser — nothing to install.",
  },
  {
    q: "Can I cancel?",
    a: "Any time, from your account settings. You keep access until the end of the period you have already paid for. See our refund policy in the Terms.",
  },
];

export default function Home() {
  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-6">
        <span className="text-accent font-mono text-sm font-bold tracking-widest">SUITEDPOKER</span>
        <Link
          href="#pricing"
          className="text-text-secondary hover:text-text-primary text-sm transition"
        >
          Pricing
        </Link>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-5xl px-6 pt-10 pb-20 sm:pt-20">
        <h1 className="max-w-3xl text-5xl leading-[1.05] font-bold tracking-tight sm:text-7xl">
          Stop guessing.
          <br />
          <span className="text-accent">Start knowing.</span>
        </h1>
        <p className="text-text-secondary mt-6 max-w-xl text-lg">
          Learn exactly what a solver would do — explained in plain English, one hand at a time.
          Built for players who know the rules and are stuck on everything after that.
        </p>
        <div className="mt-10 flex flex-col gap-3 sm:flex-row">
          <span className="bg-text-primary text-canvas inline-flex items-center justify-center rounded-xl px-7 py-3.5 text-base font-semibold">
            Coming soon
          </span>
          <Link
            href="#how"
            className="border-border text-text-secondary hover:border-text-tertiary hover:text-text-primary inline-flex items-center justify-center rounded-xl border px-7 py-3.5 text-base font-medium transition"
          >
            How it works
          </Link>
        </div>
      </section>

      {/* The problem */}
      <section id="how" className="border-border border-t">
        <div className="mx-auto max-w-5xl px-6 py-20">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            You know the rules. You still lose.
          </h2>
          <div className="mt-10 grid gap-6 sm:grid-cols-3">
            {[
              [
                "Videos don't stick.",
                "You watch an hour of strategy and remember none of it at the table.",
              ],
              [
                "Charts are dead ends.",
                "A range chart tells you what. It never tells you why, so it never transfers.",
              ],
              [
                "Solvers are unreadable.",
                "The right answer exists, buried in a tool that costs a fortune and assumes a maths degree.",
              ],
            ].map(([title, body]) => (
              <div key={title} className="border-border bg-surface-1 rounded-2xl border p-6">
                <h3 className="font-semibold">{title}</h3>
                <p className="text-text-secondary mt-2 text-sm leading-relaxed">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="border-border border-t">
        <div className="mx-auto max-w-5xl px-6 py-20">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">What you get</h2>
          <div className="mt-10 grid gap-6 sm:grid-cols-2">
            {FEATURES.map((f) => (
              <div key={f.title} className="border-border bg-surface-1 rounded-2xl border p-6">
                <h3 className="font-semibold">{f.title}</h3>
                <p className="text-text-secondary mt-2 text-sm leading-relaxed">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="border-border border-t">
        <div className="mx-auto max-w-5xl px-6 py-20">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Pricing</h2>
          <p className="text-text-secondary mt-3">
            One subscription. Everything included. Cancel any time.
          </p>
          <div className="mt-10 grid max-w-2xl gap-5 sm:grid-cols-2">
            <div className="border-accent bg-surface-1 rounded-2xl border-2 p-6">
              <div className="flex items-baseline justify-between">
                <span className="text-text-secondary text-sm font-medium">Yearly</span>
                <span className="bg-accent text-canvas rounded-full px-2.5 py-0.5 font-mono text-[10px] font-bold tracking-wider uppercase">
                  Best value
                </span>
              </div>
              <p className="mt-4 font-mono text-4xl font-bold tracking-tight tabular-nums">
                $149.99
              </p>
              <p className="text-text-secondary mt-1 text-sm">per year — $12.50 a month</p>
              <p className="border-border text-text-tertiary mt-4 border-t pt-4 text-sm">
                Save 69% versus monthly.
              </p>
            </div>
            <div className="border-border bg-surface-1 rounded-2xl border p-6">
              <span className="text-text-secondary text-sm font-medium">Monthly</span>
              <p className="mt-4 font-mono text-4xl font-bold tracking-tight tabular-nums">
                $39.99
              </p>
              <p className="text-text-secondary mt-1 text-sm">per month</p>
              <p className="border-border text-text-tertiary mt-4 border-t pt-4 text-sm">
                Cancel any time.
              </p>
            </div>
          </div>
          <p className="text-text-tertiary mt-6 max-w-2xl text-sm">
            Subscriptions renew automatically until cancelled. You keep access until the end of the
            period you have paid for. Prices in USD.
          </p>
        </div>
      </section>

      {/* FAQ */}
      <section className="border-border border-t">
        <div className="mx-auto max-w-3xl px-6 py-20">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Questions</h2>
          <dl className="mt-10 space-y-8">
            {FAQ.map((item) => (
              <div key={item.q}>
                <dt className="font-semibold">{item.q}</dt>
                <dd className="text-text-secondary mt-2 text-sm leading-relaxed">{item.a}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <footer className="border-border border-t">
        <div className="mx-auto max-w-5xl px-6 py-12">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-accent font-mono text-sm font-bold tracking-widest">SUITEDPOKER</p>
              <p className="text-text-secondary mt-2 text-sm">
                Educational software. Play money only. No real-money gambling.
              </p>
            </div>
            <div className="text-text-secondary flex gap-6 text-sm">
              <Link href="/legal/terms" className="hover:text-text-primary transition">
                Terms
              </Link>
              <Link href="/legal/privacy" className="hover:text-text-primary transition">
                Privacy
              </Link>
              <a
                href="mailto:support@suitedpoker.com"
                className="hover:text-text-primary transition"
              >
                Contact
              </a>
            </div>
          </div>
          <p className="text-text-tertiary mt-8 text-xs">
            Questions or support: support@suitedpoker.com · © {new Date().getFullYear()} SuitedPoker
          </p>
        </div>
      </footer>
    </div>
  );
}
