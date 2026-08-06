import { NextResponse, type NextRequest } from "next/server";
import { drainQueue } from "@/lib/meta-capi";
import { serverEnv } from "@/lib/env.server";

/**
 * Drains the CAPI retry queue. Called by a Vercel cron.
 *
 * A Purchase that never reaches Meta permanently mis-trains the ad account
 * against the audience that actually bought — which costs far more than the
 * event itself. So a failed send is queued rather than logged, and this is what
 * empties the queue once Meta is answering again.
 *
 * Authenticated by CRON_SECRET, which fails CLOSED in production.
 */
export async function GET(request: NextRequest) {
  const expected = process.env.CRON_SECRET ?? "";
  const provided = request.headers.get("authorization") ?? "";

  if (expected === "" || provided !== `Bearer ${expected}`) {
    if (serverEnv().NODE_ENV === "production" || expected !== "") {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  const result = await drainQueue();
  console.info(`[meta-capi] drained: ${result.sent} sent, ${result.kept} still queued`);
  return NextResponse.json(result);
}
