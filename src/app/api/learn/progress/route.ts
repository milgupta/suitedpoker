import { NextResponse } from "next/server";
import { z } from "zod";
import { withEntitlement } from "@/lib/api-guard";
import { limit, RULES } from "@/lib/ratelimit";
import { canOpen, loadPath, saveProgress } from "@/lib/curriculum-server";
import { isLessonStatus, judgePractice, PRACTICE_SPOTS } from "@/lib/curriculum-progress";

const bodySchema = z.object({
  slug: z.string().min(1).max(80),
  status: z.string().optional(),
  scrollPos: z.number().int().min(0).max(200_000).optional(),
  /** Present when a practice set just finished. 0..1. */
  accuracy: z.number().min(0).max(1).optional(),
  /** The user chose "mark complete anyway" after three attempts. */
  override: z.boolean().optional(),
});

/**
 * Records progress, and decides whether a practice set completed the lesson.
 *
 * THE VERDICT IS SERVER-SIDE. A client that could post `status: "completed"`
 * could unlock the whole curriculum with one request, which is the same class
 * of problem as a client that grades its own drills.
 */
export const POST = withEntitlement(async (request, auth) => {
  const gate = await limit(auth.userId, RULES.API_GENERIC);
  if (!gate.allowed) {
    return NextResponse.json({ error: "rate_limited", resetAt: gate.resetAt }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  const { slug, scrollPos, accuracy, override } = parsed.data;

  // Locked means locked, on the write path too — otherwise a lesson can be
  // completed without ever being opened.
  if (!(await canOpen(auth.userId, slug))) {
    return NextResponse.json({ error: "lesson_locked" }, { status: 403 });
  }

  // A practice result: the server judges it.
  if (accuracy !== undefined) {
    const path = await loadPath(auth.userId);
    const before = path.rows.find((r) => r.lessonSlug === slug)?.attempts ?? 0;
    const verdict = judgePractice(accuracy, before);

    const saved = await saveProgress(auth.userId, slug, {
      status: verdict.status,
      accuracy,
      incrementAttempt: true,
    });

    return NextResponse.json({ verdict, progress: saved, spots: PRACTICE_SPOTS });
  }

  // The override, allowed only once the attempts are genuinely spent.
  if (override === true) {
    const path = await loadPath(auth.userId);
    const row = path.rows.find((r) => r.lessonSlug === slug);
    const verdict = judgePractice(row?.bestAccuracy ?? 0, (row?.attempts ?? 1) - 1);
    if (!verdict.canOverride) {
      return NextResponse.json({ error: "override_not_available" }, { status: 403 });
    }
    const saved = await saveProgress(auth.userId, slug, { status: "completed" });
    return NextResponse.json({ progress: saved });
  }

  const status = parsed.data.status;
  if (status !== undefined && !isLessonStatus(status)) {
    return NextResponse.json({ error: "invalid_status" }, { status: 400 });
  }
  // "completed" is only ever reached through a judged practice set or the
  // override above — never by asking for it.
  if (status === "completed") {
    return NextResponse.json({ error: "completion_requires_practice" }, { status: 403 });
  }

  const saved = await saveProgress(auth.userId, slug, { status, scrollPos });
  return NextResponse.json({ progress: saved });
});

/** The whole path, for the client to render without a second source of truth. */
export const GET = withEntitlement(async (_request, auth) => {
  const path = await loadPath(auth.userId);
  return NextResponse.json({
    modules: path.modules.map((m) => ({
      slug: m.slug,
      title: m.title,
      order: m.order,
      completed: m.completed,
      total: m.total,
      fraction: m.fraction,
      locked: m.locked,
      lessons: m.lessons.map((l) => ({
        slug: l.lesson.slug,
        title: l.lesson.title,
        estMinutes: l.lesson.estMinutes,
        status: l.status,
        attempts: l.attempts,
        locked: l.locked,
        lockedReason: l.lockedReason,
      })),
    })),
  });
});
