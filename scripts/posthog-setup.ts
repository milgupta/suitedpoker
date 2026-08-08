/**
 * Creates the funnel and feature-usage insights in PostHog, from code.
 *
 * A dashboard built by clicking is a dashboard nobody can review, diff or
 * rebuild — and when an event is renamed in `analytics.ts` the chart does not
 * break, it silently goes to zero, which reads exactly like "usage stopped".
 * Every event referenced below is checked against `EVENT_NAMES` before a single
 * request is sent, so a rename fails here, loudly, at the point of change.
 *
 * Idempotent: insights and the dashboard are matched by name and PATCHed, so
 * re-running edits in place rather than piling up duplicates. Safe to run on
 * every schema change.
 *
 *   npm run posthog:setup           create/update everything
 *   npm run posthog:setup -- --dry  print what would change, touch nothing
 *
 * Needs POSTHOG_PERSONAL_API_KEY in .env.local, scoped to insight:write,
 * dashboard:write and query:read.
 */

import { loadLocalEnv } from "../tests/support/load-local-env";
import { EVENT_NAMES, type EventName } from "../src/lib/analytics";

loadLocalEnv();

const DRY_RUN = process.argv.includes("--dry");
const API_HOST = "https://us.posthog.com";
const DASHBOARD_NAME = "Funnel & feature usage";

/**
 * The project is resolved by matching the app's own `phc_` token, never by a
 * hardcoded id. This organisation has three projects and two of them are other
 * products — a typo'd id would write a dashboard into the wrong one and read
 * back an empty funnel that looks like a product failure.
 */
function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === "") {
    throw new Error(`${name} is missing from .env.local`);
  }
  return value;
}

const PERSONAL_KEY = requireEnv("POSTHOG_PERSONAL_API_KEY");
const PROJECT_TOKEN = requireEnv("NEXT_PUBLIC_POSTHOG_KEY");

async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${API_HOST}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${PERSONAL_KEY}`,
      "content-type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${method} ${path} → ${response.status}\n${text.slice(0, 600)}`);
  }
  return (text === "" ? {} : JSON.parse(text)) as T;
}

/** A compile-time-checked event name. Anything unknown throws before any I/O. */
function ev(name: EventName): EventName {
  if (!(EVENT_NAMES as readonly string[]).includes(name)) {
    throw new Error(`"${name}" is not in EVENT_NAMES — was it renamed in analytics.ts?`);
  }
  return name;
}

interface Series {
  kind: "EventsNode";
  event: EventName;
  name: string;
  math?: "total" | "dau";
}

function step(event: EventName, label: string): Series {
  return { kind: "EventsNode", event: ev(event), name: label };
}

function uniqueUsers(event: EventName, label: string): Series {
  return { kind: "EventsNode", event: ev(event), name: label, math: "dau" };
}

interface InsightSpec {
  name: string;
  description: string;
  query: Record<string, unknown>;
}

/**
 * Seven steps, in the order a real person meets them.
 *
 * `signup_completed` and `checkout_abandoned` were both dead until this pass —
 * OAuth navigated away before the capture could run, and the abandonment was
 * declared in the schema and wired nowhere. A funnel containing a step that
 * cannot fire shows a 100% cliff and quietly blames the product.
 */
const ACQUISITION_FUNNEL: InsightSpec = {
  name: "Funnel — landing to purchase",
  description:
    "The whole acquisition path. Steps that stay at zero are usually a broken capture, not a broken product — check the event fired at all before redesigning the screen.",
  query: {
    kind: "InsightVizNode",
    source: {
      kind: "FunnelsQuery",
      dateRange: { date_from: "-90d" },
      series: [
        step("landing_viewed", "Landing"),
        step("signup_started", "Signup started"),
        step("signup_completed", "Signup completed"),
        step("onboarding_completed", "Onboarding done"),
        step("paywall_viewed", "Paywall"),
        step("checkout_started", "Checkout"),
        step("purchase_completed", "Purchased"),
      ],
      funnelsFilter: {
        funnelVizType: "steps",
        funnelWindowInterval: 7,
        funnelWindowIntervalUnit: "day",
      },
    },
  },
};

/**
 * The paywall on its own, broken out by plan.
 *
 * Three steps rather than seven, because a 7-step funnel's last three bars are
 * all rounding error at this traffic level and the paywall is the question
 * being asked. Broken down by plan: "people abandon" and "people abandon the
 * annual card" are different findings with different fixes.
 */
const PAYWALL_FUNNEL: InsightSpec = {
  name: "Funnel — paywall conversion by plan",
  description:
    "Paywall → checkout → purchase, split by monthly and annual. The plan rides back on Stripe's cancel_url so an abandonment can name what was on screen.",
  query: {
    kind: "InsightVizNode",
    source: {
      kind: "FunnelsQuery",
      dateRange: { date_from: "-90d" },
      series: [
        step("paywall_viewed", "Paywall viewed"),
        step("checkout_started", "Checkout started"),
        step("purchase_completed", "Purchased"),
      ],
      breakdownFilter: { breakdown: "plan", breakdown_type: "event" },
      funnelsFilter: {
        funnelVizType: "steps",
        funnelWindowInterval: 1,
        funnelWindowIntervalUnit: "day",
      },
    },
  },
};

/**
 * Abandonment as a rate, not a mystery.
 *
 * `checkout_abandoned` only ever catches Stripe's BACK BUTTON — a closed tab
 * never returns to fire anything. So this is deliberately three series rather
 * than one: the gap between `checkout_started` and the other two IS the silent
 * abandonment, and it is only visible when all three are on the same axis.
 */
const CHECKOUT_DROPOFF: InsightSpec = {
  name: "Checkout — started vs abandoned vs purchased",
  description:
    "checkout_abandoned fires only on Stripe's back button. Silent drop-off is started minus (abandoned + purchased) — read the gap, not just the abandoned line.",
  query: {
    kind: "InsightVizNode",
    source: {
      kind: "TrendsQuery",
      dateRange: { date_from: "-90d" },
      interval: "week",
      series: [
        step("checkout_started", "Started"),
        step("checkout_abandoned", "Came back (abandoned)"),
        step("purchase_completed", "Purchased"),
      ],
      trendsFilter: { display: "ActionsLineGraph" },
    },
  },
};

/**
 * "What gets used most" — every in-app feature entry point, ranked.
 *
 * Unique users, not event count: one person running a 200-hand drill session
 * would otherwise bury the entire curriculum. A bar chart because the question
 * is an ordering, and an ordering is what a bar chart answers at a glance.
 */
const FEATURE_SERIES: Series[] = [
  uniqueUsers("drill_started", "Drills"),
  uniqueUsers("daily_started", "Daily challenge"),
  uniqueUsers("lesson_started", "Lessons"),
  uniqueUsers("sim_session_started", "Table sim"),
  uniqueUsers("coach_hint_requested", "Coach — hints"),
  uniqueUsers("coach_explanation_viewed", "Coach — explanations"),
  uniqueUsers("coach_chat_message", "Coach — chat"),
];

const FEATURE_RANKING: InsightSpec = {
  name: "Features — unique users, ranked",
  description:
    "Unique users per feature over 30 days. Deliberately not event volume: one long drill session would otherwise outrank the entire curriculum.",
  query: {
    kind: "InsightVizNode",
    source: {
      kind: "TrendsQuery",
      dateRange: { date_from: "-30d" },
      series: FEATURE_SERIES,
      trendsFilter: { display: "ActionsBarValue" },
    },
  },
};

const FEATURE_TREND: InsightSpec = {
  name: "Features — usage over time",
  description:
    "The same series weekly. Answers the second question after 'what is used most', which is 'and is that changing'.",
  query: {
    kind: "InsightVizNode",
    source: {
      kind: "TrendsQuery",
      dateRange: { date_from: "-90d" },
      interval: "week",
      series: FEATURE_SERIES,
      trendsFilter: { display: "ActionsLineGraph" },
    },
  },
};

/**
 * Not a funnel step, but the first thing anyone asks after seeing one: are the
 * people who buy the people who played the demo hand badly?
 */
const DEMO_HAND_GRADE: InsightSpec = {
  name: "Demo hand — grade distribution",
  description:
    "How the pre-paywall hand is played, broken down by grade. Correlating this against purchase rate is the reason demo_hand_answered carries the grade at all.",
  query: {
    kind: "InsightVizNode",
    source: {
      kind: "TrendsQuery",
      dateRange: { date_from: "-90d" },
      series: [step("demo_hand_answered", "Demo hand answered")],
      breakdownFilter: { breakdown: "grade", breakdown_type: "event" },
      trendsFilter: { display: "ActionsBarValue" },
    },
  },
};

const INSIGHTS: InsightSpec[] = [
  ACQUISITION_FUNNEL,
  PAYWALL_FUNNEL,
  CHECKOUT_DROPOFF,
  FEATURE_RANKING,
  FEATURE_TREND,
  DEMO_HAND_GRADE,
];

interface Project {
  id: number;
  name: string;
  api_token: string;
}
interface Listed {
  id: number;
  name: string | null;
  short_id?: string;
}
interface Page<T> {
  results: T[];
}

async function resolveProject(): Promise<Project> {
  const page = await api<Page<Project>>("GET", "/api/organizations/@current/projects/?limit=100");
  const match = page.results.find((p) => p.api_token === PROJECT_TOKEN);
  if (match === undefined) {
    const names = page.results.map((p) => p.name).join(", ");
    throw new Error(`No project matches NEXT_PUBLIC_POSTHOG_KEY. Visible projects: ${names}`);
  }
  return match;
}

async function findByName(
  projectId: number,
  path: string,
  name: string,
): Promise<Listed | undefined> {
  // Paginated deliberately: matching on a truncated first page silently creates
  // a duplicate of something that already exists further down.
  let url: string | null = `/api/projects/${projectId}/${path}/?limit=100`;
  while (url !== null) {
    const page: Page<Listed> & { next?: string | null } = await api("GET", url);
    const hit = page.results.find((item) => item.name === name);
    if (hit !== undefined) return hit;
    url = page.next != null ? page.next.replace(API_HOST, "") : null;
  }
  return undefined;
}

async function main(): Promise<void> {
  const project = await resolveProject();
  console.log(`Project: ${project.name} (${project.id})`);
  console.log(`Mode:    ${DRY_RUN ? "DRY RUN — nothing will be written" : "writing"}\n`);

  // Referenced-event check runs over every spec before any write, so a rename
  // cannot leave the dashboard half-updated.
  for (const spec of INSIGHTS) {
    const source = spec.query.source as { series?: Series[] };
    for (const s of source.series ?? []) ev(s.event);
  }
  console.log(`✓ all referenced events exist in EVENT_NAMES\n`);

  let dashboardId: number | undefined;
  const existingDashboard = await findByName(project.id, "dashboards", DASHBOARD_NAME);

  if (existingDashboard !== undefined) {
    dashboardId = existingDashboard.id;
    console.log(`dashboard  reuse   ${DASHBOARD_NAME} (${dashboardId})`);
  } else if (DRY_RUN) {
    console.log(`dashboard  CREATE  ${DASHBOARD_NAME}`);
  } else {
    const created = await api<Listed>("POST", `/api/projects/${project.id}/dashboards/`, {
      name: DASHBOARD_NAME,
      description:
        "Generated by scripts/posthog-setup.ts. Edit the script, not the dashboard — a hand-edit is overwritten on the next run.",
    });
    dashboardId = created.id;
    console.log(`dashboard  CREATE  ${DASHBOARD_NAME} (${dashboardId})`);
  }

  for (const spec of INSIGHTS) {
    const existing = await findByName(project.id, "insights", spec.name);
    const payload = {
      name: spec.name,
      description: spec.description,
      query: spec.query,
      ...(dashboardId === undefined ? {} : { dashboards: [dashboardId] }),
    };

    if (DRY_RUN) {
      console.log(`insight    ${existing ? "UPDATE" : "CREATE"}  ${spec.name}`);
      continue;
    }

    if (existing !== undefined) {
      await api("PATCH", `/api/projects/${project.id}/insights/${existing.id}/`, payload);
      console.log(`insight    UPDATE  ${spec.name}`);
    } else {
      const made = await api<Listed>("POST", `/api/projects/${project.id}/insights/`, payload);
      console.log(`insight    CREATE  ${spec.name} (${made.short_id ?? made.id})`);
    }
  }

  if (!DRY_RUN && dashboardId !== undefined) {
    console.log(`\nDashboard: ${API_HOST}/project/${project.id}/dashboard/${dashboardId}`);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
