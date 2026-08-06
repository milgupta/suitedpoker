import { NextResponse, type NextRequest } from "next/server";
import { runDunning } from "@/lib/dunning-server";
import { serverEnv } from "@/lib/env.server";

/**
 * The daily dunning run. Called by a Vercel cron.
 *
 * Authenticated by CRON_SECRET, which fails CLOSED in production — an open
 * endpoint here would let anyone trigger a mass send to real customers.
 */
export async function GET(request: NextRequest) {
  const expected = process.env.CRON_SECRET ?? "";
  const provided = request.headers.get("authorization") ?? "";

  if (expected === "" || provided !== `Bearer ${expected}`) {
    if (serverEnv().NODE_ENV === "production" || expected !== "") {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  const result = await runDunning();
  console.info(
    `[dunning] ${result.considered} past_due · ${result.sent.length} sent · ${result.skipped.length} skipped`,
  );
  return NextResponse.json(result);
}
