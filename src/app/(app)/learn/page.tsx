import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/supabase/server";
import { loadPath } from "@/lib/curriculum-server";
import { nextLesson } from "@/lib/curriculum-progress";
import { LearnPathClient } from "./path-client";

export const metadata: Metadata = { title: "Learn", robots: { index: false, follow: false } };

/**
 * The path.
 *
 * Rendered server-side from the same `loadPath` the API gate uses, so what the
 * page shows as locked and what the server refuses can never disagree.
 */
export default async function LearnPage() {
  const user = await getUser();
  if (user === null) redirect("/login");

  const path = await loadPath(user.id);
  const next = nextLesson(path.modules);

  return (
    <div className="mx-auto w-full max-w-[34rem] pb-16">
      <LearnPathClient
        modules={path.modules.map((m) => ({
          slug: m.slug,
          title: m.title,
          completed: m.completed,
          total: m.total,
          fraction: m.fraction,
          locked: m.locked,
          lessons: m.lessons.map((l) => ({
            slug: l.lesson.slug,
            title: l.lesson.title,
            module: l.lesson.module,
            estMinutes: l.lesson.estMinutes,
            status: l.status,
            locked: l.locked,
            lockedReason: l.lockedReason,
          })),
        }))}
        nextHref={next === null ? null : `/learn/${next.lesson.module}/${next.lesson.slug}`}
        nextTitle={next?.lesson.title ?? null}
      />
    </div>
  );
}
