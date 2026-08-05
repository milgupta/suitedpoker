import { NextResponse } from "next/server";
import { withEntitlement } from "@/lib/api-guard";

export const GET = withEntitlement((_request, auth) =>
  NextResponse.json({ ok: true, userId: auth.userId }),
);
