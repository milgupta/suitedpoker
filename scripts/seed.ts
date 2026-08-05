/**
 * Seeds a development database.
 *
 * Idempotent: every insert either conflicts-does-nothing or is keyed on a
 * natural unique column, so running it twice changes nothing. A seed you are
 * afraid to re-run is a seed nobody runs.
 *
 *   npm run db:seed
 *
 * Requires DATABASE_URL, and SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL
 * for the test user. Without the Supabase vars the schema still seeds and the
 * user step is skipped with a warning.
 */

import { createClient } from "@supabase/supabase-js";
import { eq } from "drizzle-orm";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "../src/db/schema";

const TEST_EMAIL = "dev@suitedpoker.com";
const TEST_PASSWORD = "devpassword123";

const MODULES = [
  {
    slug: "preflop-fundamentals",
    title: "Preflop fundamentals",
    order: 1,
    tier: "beginner",
    lessons: [
      "Why position decides everything",
      "Opening ranges by seat",
      "Facing a raise: 3-bet, call, or fold",
      "Playing from the blinds",
    ],
  },
  {
    slug: "board-texture",
    title: "Board texture",
    order: 2,
    tier: "beginner",
    lessons: [
      "Dry boards and why you bet small",
      "Wet boards and protection",
      "Paired boards",
      "When the turn changes everything",
    ],
  },
  {
    slug: "bet-sizing",
    title: "Bet sizing",
    order: 3,
    tier: "intermediate",
    lessons: [
      "Why sizing is a strategy, not a habit",
      "Small bets and range advantage",
      "Overbets and polarisation",
      "Sizing on the river",
    ],
  },
];

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (url === undefined || url === "") {
    throw new Error("DATABASE_URL is not set — see the Supabase setup steps in README.md.");
  }

  const client = postgres(url, { prepare: false });
  const db = drizzle(client, { schema });

  try {
    // ── Solution set ───────────────────────────────────────────────────────
    const existingSet = await db
      .select()
      .from(schema.solutionSets)
      .where(eq(schema.solutionSets.name, "6-max 100bb baseline"))
      .limit(1);

    let solutionSetId = existingSet[0]?.id;
    if (solutionSetId === undefined) {
      const inserted = await db
        .insert(schema.solutionSets)
        .values({
          name: "6-max 100bb baseline",
          version: "0.1.0",
          game: "nlhe",
          tableSize: 6,
          stackDepthBb: 100,
          rakeModel: "none",
          // Never claim to be a solver. This is a simplified, solver-derived
          // strategy and the UI says so — see PART 3 of the build plan.
          source: "solver-derived simplified strategy",
          isActive: true,
        })
        .returning({ id: schema.solutionSets.id });
      solutionSetId = inserted[0]?.id;
      console.log("  created solution set");
    } else {
      console.log("  solution set already present");
    }

    if (solutionSetId === undefined) throw new Error("failed to create the solution set");

    // ── Modules and lessons ────────────────────────────────────────────────
    for (const mod of MODULES) {
      await db
        .insert(schema.modules)
        .values({ slug: mod.slug, title: mod.title, order: mod.order, tier: mod.tier })
        .onConflictDoNothing({ target: schema.modules.slug });

      const moduleRow = await db
        .select({ id: schema.modules.id })
        .from(schema.modules)
        .where(eq(schema.modules.slug, mod.slug))
        .limit(1);

      const moduleId = moduleRow[0]?.id;
      if (moduleId === undefined) throw new Error(`module ${mod.slug} missing after insert`);

      for (const [i, title] of mod.lessons.entries()) {
        const slug = `${mod.slug}-${i + 1}`;
        await db
          .insert(schema.lessons)
          .values({
            moduleId,
            slug,
            title,
            order: i + 1,
            mdxPath: `content/lessons/${slug}.mdx`,
          })
          .onConflictDoNothing({ target: schema.lessons.slug });
      }
    }
    console.log(`  ${MODULES.length} modules, ${MODULES.length * 4} lessons`);

    // ── Test user ──────────────────────────────────────────────────────────
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (
      supabaseUrl === undefined ||
      supabaseUrl === "" ||
      serviceKey === undefined ||
      serviceKey === ""
    ) {
      console.warn(
        "  ! NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set — skipping the test user.",
      );
      return;
    }

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: created, error } = await admin.auth.admin.createUser({
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
      email_confirm: true,
    });

    let userId = created?.user?.id;

    if (error !== null && !error.message.toLowerCase().includes("already")) {
      throw error;
    }
    if (userId === undefined) {
      const { data: list } = await admin.auth.admin.listUsers();
      userId = list?.users.find((u) => u.email === TEST_EMAIL)?.id;
    }
    if (userId === undefined) throw new Error("could not create or find the test user");

    // The handle_new_user trigger has already made the profile row; this fills
    // in the onboarding answers so the dev user lands on the dashboard rather
    // than being sent back through onboarding on every login.
    await db
      .update(schema.profiles)
      .set({
        email: TEST_EMAIL,
        displayName: "Dev User",
        timezone: "UTC",
        onboarding: {
          experience: "some",
          biggestStruggle: "preflop_ranges",
          stakes: "micro",
          goal: "stop_losing",
          timePerDay: "10min",
        },
        skillTier: "beginner",
        primaryLeakKey: "preflop_ranges",
        rating: 1200,
      })
      .where(eq(schema.profiles.id, userId));

    console.log(`  test user ${TEST_EMAIL} / ${TEST_PASSWORD}`);
  } finally {
    await client.end();
  }
}

main()
  .then(() => {
    console.log("seed complete");
    process.exit(0);
  })
  .catch((err: unknown) => {
    console.error("seed failed:", err);
    process.exit(1);
  });
