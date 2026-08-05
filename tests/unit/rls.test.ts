/**
 * THE CROSS-USER SECURITY TEST.
 *
 * Creates two real users, writes rows owned by each, then — authenticated as
 * user A through the ANON client, exactly as a browser would be — attempts to
 * read user B's profile, drill_attempts and subscriptions. All three must
 * return zero rows.
 *
 * It runs against a live Supabase project and SKIPS when the credentials are
 * absent. A skipped security test proves nothing, so it says so loudly and
 * `npm run test:rls` exists to make running it deliberate.
 *
 * It also seeds its own data first. A cross-user read that returns zero rows
 * because the tables are empty is a test that passes for the wrong reason, and
 * this one asserts user A can see its OWN rows before asserting it cannot see
 * user B's.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

const CONFIGURED = SUPABASE_URL !== "" && ANON_KEY !== "" && SERVICE_KEY !== "";

if (!CONFIGURED) {
  console.warn(
    "\n  ⚠  RLS CROSS-USER TEST SKIPPED — no Supabase credentials.\n" +
      "     The row-level security boundary is UNVERIFIED until this runs.\n" +
      "     Set NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and\n" +
      "     SUPABASE_SERVICE_ROLE_KEY, then: npm run test:rls\n",
  );
}

interface TestUser {
  id: string;
  email: string;
  client: SupabaseClient;
}

const PASSWORD = "rls-test-password-123";

describe.skipIf(!CONFIGURED)("row level security — cross-user reads", () => {
  let admin: SupabaseClient;
  let userA: TestUser;
  let userB: TestUser;

  async function makeUser(label: string): Promise<TestUser> {
    const email = `rls-${label}-${Date.now()}@suitedpoker.test`;
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
    });
    if (error !== null) throw error;

    const id = data.user?.id;
    if (id === undefined) throw new Error(`could not create user ${label}`);

    // A plain anon client, signed in — the same thing a browser holds.
    const client = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { error: signInError } = await client.auth.signInWithPassword({
      email,
      password: PASSWORD,
    });
    if (signInError !== null) throw signInError;

    return { id, email, client };
  }

  beforeAll(async () => {
    admin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    userA = await makeUser("a");
    userB = await makeUser("b");

    // Seed rows for BOTH users through the service role, bypassing RLS. Without
    // data present the reads below would return zero rows trivially.
    for (const user of [userA, userB]) {
      await admin
        .from("profiles")
        .update({ display_name: `owner-${user.id}` })
        .eq("id", user.id);

      const { error: attemptError } = await admin.from("drill_attempts").insert({
        user_id: user.id,
        node_ref: "rfi-BTN",
        hero_hand: "AKs",
        chosen_action: "raise",
        grade: "best",
        ev_loss: "0.000",
      });
      if (attemptError !== null) throw attemptError;

      const { error: subError } = await admin.from("subscriptions").insert({
        user_id: user.id,
        status: "active",
        price_id: "price_test",
      });
      if (subError !== null) throw subError;
    }
  }, 30_000);

  afterAll(async () => {
    // Cascades clean up every owned row.
    for (const user of [userA, userB]) {
      if (user?.id !== undefined) await admin.auth.admin.deleteUser(user.id);
    }
  }, 30_000);

  it("lets user A see its OWN rows — so a zero result below means something", async () => {
    const [profile, attempts, subs] = await Promise.all([
      userA.client.from("profiles").select("id").eq("id", userA.id),
      userA.client.from("drill_attempts").select("id").eq("user_id", userA.id),
      userA.client.from("subscriptions").select("id").eq("user_id", userA.id),
    ]);

    expect(profile.data?.length ?? 0).toBeGreaterThan(0);
    expect(attempts.data?.length ?? 0).toBeGreaterThan(0);
    expect(subs.data?.length ?? 0).toBeGreaterThan(0);
  });

  it("returns ZERO of user B's profiles to user A", async () => {
    const { data } = await userA.client.from("profiles").select("*").eq("id", userB.id);
    expect(data ?? []).toEqual([]);
  });

  it("returns ZERO of user B's drill_attempts to user A", async () => {
    const { data } = await userA.client.from("drill_attempts").select("*").eq("user_id", userB.id);
    expect(data ?? []).toEqual([]);
  });

  it("returns ZERO of user B's subscriptions to user A", async () => {
    const { data } = await userA.client.from("subscriptions").select("*").eq("user_id", userB.id);
    expect(data ?? []).toEqual([]);
  });

  it("returns only user A's rows on an unfiltered select", async () => {
    // The filter above is the attacker being explicit. This is the attacker
    // simply asking for everything.
    const { data } = await userA.client.from("drill_attempts").select("user_id");
    expect(data ?? []).not.toEqual([]);
    for (const row of data ?? []) {
      expect((row as { user_id: string }).user_id).toBe(userA.id);
    }
  });

  it("refuses to write a row owned by user B", async () => {
    const { error } = await userA.client.from("drill_attempts").insert({
      user_id: userB.id,
      node_ref: "forged",
      chosen_action: "raise",
    });
    expect(error, "the insert WITH CHECK policy did not stop a forged user_id").not.toBeNull();
  });

  it("refuses to update user B's profile", async () => {
    const { data } = await userA.client
      .from("profiles")
      .update({ display_name: "pwned" })
      .eq("id", userB.id)
      .select();
    expect(data ?? []).toEqual([]);
  });

  it("lets an authenticated user read reference data", async () => {
    // The /ranges browser depends on this. It is a feature, not a leak.
    const { error } = await userA.client.from("modules").select("id").limit(1);
    expect(error).toBeNull();
  });

  it("refuses to let a client write reference data", async () => {
    const { error } = await userA.client
      .from("solution_sets")
      .insert({ name: "forged", version: "0", game: "nlhe", table_size: 6, stack_depth_bb: 100 });
    expect(error, "a client was able to write solution data").not.toBeNull();
  });

  it("hides the service-role-only tables entirely", async () => {
    const events = await userA.client.from("stripe_events").select("*");
    const cache = await userA.client.from("coach_cache").select("*");
    expect(events.data ?? []).toEqual([]);
    expect(cache.data ?? []).toEqual([]);
  });
});
