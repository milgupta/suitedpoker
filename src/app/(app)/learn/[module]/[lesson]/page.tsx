import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getUser } from "@/lib/supabase/server";
import { getLesson } from "@/lib/curriculum";
import { canOpen, loadPath } from "@/lib/curriculum-server";
import { LESSON_MODULES } from "@/content/curriculum/registry";
import { LessonShell } from "./lesson-shell";
import { drillConfigOf } from "@/lib/curriculum";

export const metadata: Metadata = { robots: { index: false, follow: false } };

interface Params {
  params: Promise<{ module: string; lesson: string }>;
}

/**
 * The lesson.
 *
 * The lock is enforced HERE, on the server, before a byte of content renders.
 * Hiding the link on /learn is presentation; this is the actual gate, and it
 * is the difference between sequencing and the appearance of sequencing.
 */
export default async function LessonPage({ params }: Params) {
  const { module: moduleSlug, lesson: lessonSlug } = await params;

  const user = await getUser();
  if (user === null) redirect("/login");

  const lesson = getLesson(lessonSlug);
  if (lesson === null || lesson.module !== moduleSlug) notFound();

  if (!(await canOpen(user.id, lessonSlug))) redirect("/learn");

  const path = await loadPath(user.id);
  const row = path.rows.find((r) => r.lessonSlug === lessonSlug);

  // Compiled at build time by Next's MDX pipeline; see next.config.ts.
  const load = LESSON_MODULES[lessonSlug];
  if (load === undefined) notFound();
  const { default: Body } = await load();

  return (
    <LessonShell
      slug={lesson.slug}
      title={lesson.title}
      moduleSlug={lesson.module}
      estMinutes={lesson.estMinutes}
      status={row?.status ?? "not_started"}
      attempts={row?.attempts ?? 0}
      initialScroll={row?.scrollPos ?? 0}
      drillConfig={drillConfigOf(lesson)}
    >
      <Body />
    </LessonShell>
  );
}
