"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";
import { Button } from "@/components/ui/button";
import { capture } from "@/lib/analytics-client";
import { buildArenaLink } from "@/lib/arena-preset";
import { PRACTICE_SPOTS, type LessonStatus } from "@/lib/curriculum-progress";
import { SPRING } from "@/lib/motion";

/**
 * The reading shell around a lesson's MDX.
 *
 * Three jobs: show how far through they are, remember where they stopped, and
 * hand them off to practice at the end. The prose is the product here — the
 * chrome stays out of its way.
 */

export interface LessonShellProps {
  slug: string;
  title: string;
  moduleSlug: string;
  estMinutes: number;
  status: LessonStatus;
  attempts: number;
  initialScroll: number;
  children: ReactNode;
}

export function LessonShell({
  slug,
  title,
  moduleSlug,
  estMinutes,
  status,
  attempts,
  initialScroll,
  children,
}: LessonShellProps) {
  const router = useRouter();
  const params = useSearchParams();
  const reduced = useReducedMotion() ?? false;

  const [read, setRead] = useState(0);
  const [verdict, setVerdict] = useState<{
    passed: boolean;
    message: string;
    canOverride: boolean;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const article = useRef<HTMLElement | null>(null);
  const restored = useRef(false);

  const post = useCallback(
    async (payload: Record<string, unknown>): Promise<Response | null> => {
      try {
        return await fetch("/api/learn/progress", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ slug, ...payload }),
        });
      } catch {
        return null;
      }
    },
    [slug],
  );

  // Opening a lesson starts it. `saveProgress` ratchets, so this can never
  // knock a completed lesson back to reading.
  useEffect(() => {
    capture("lesson_started", { lessonId: slug });
    void Promise.resolve().then(() => post({ status: "reading" }));
  }, [slug, post]);

  /**
   * Restore where they stopped.
   *
   * Retried rather than fired once: cards, range grids and the rest settle
   * over several frames, and a single scrollTo lands while the document is
   * still short — the browser clamps it to the bottom, which is 0 on a page
   * that has not laid out yet. This keeps asking until the document is tall
   * enough to honour the position, then stops.
   */
  useEffect(() => {
    if (restored.current || initialScroll <= 0) return;

    let attempts = 0;
    const timer = setInterval(() => {
      attempts += 1;
      const reachable = document.body.scrollHeight - window.innerHeight;
      if (reachable >= initialScroll) {
        window.scrollTo({ top: initialScroll, behavior: "auto" });
        restored.current = true;
        clearInterval(timer);
      } else if (attempts > 40) {
        // Two seconds of waiting: the page is genuinely shorter than it was.
        window.scrollTo({ top: Math.max(0, reachable), behavior: "auto" });
        restored.current = true;
        clearInterval(timer);
      }
    }, 50);

    return () => clearInterval(timer);
  }, [initialScroll]);

  // Reading progress, and a debounced save of the position.
  useEffect(() => {
    let saveTimer: ReturnType<typeof setTimeout> | null = null;

    function onScroll(): void {
      const element = article.current;
      if (element === null) return;
      const total = element.scrollHeight - window.innerHeight;
      const fraction = total <= 0 ? 1 : Math.min(1, Math.max(0, window.scrollY / total));
      setRead(fraction);

      // Never save while the restore is still running, or the restore's own
      // intermediate positions overwrite the place they were restoring to.
      if (!restored.current && initialScroll > 0) return;
      if (saveTimer !== null) clearTimeout(saveTimer);
      saveTimer = setTimeout(() => void post({ scrollPos: Math.round(window.scrollY) }), 800);
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (saveTimer !== null) clearTimeout(saveTimer);
    };
  }, [post, initialScroll]);

  // Coming back from a practice set: the arena appends its accuracy.
  useEffect(() => {
    const accuracy = params.get("accuracy");
    if (accuracy === null) return;

    void (async () => {
      const response = await post({ accuracy: Number(accuracy) / 100 });
      if (response === null || !response.ok) return;
      const body = (await response.json()) as {
        verdict: { passed: boolean; message: string; canOverride: boolean };
      };
      setVerdict(body.verdict);
      capture("lesson_completed", {
        lessonId: slug,
        accuracy: Number(accuracy) / 100,
      });
      // Drop the parameter so a refresh does not re-record the attempt.
      router.replace(`/learn/${moduleSlug}/${slug}`);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const practiceHref = buildArenaLink({
    config: { type: "preflop" },
    length: PRACTICE_SPOTS,
    label: title,
    returnTo: `/learn/${moduleSlug}/${slug}`,
  });

  async function markAnyway(): Promise<void> {
    setBusy(true);
    const response = await post({ override: true });
    setBusy(false);
    if (response?.ok === true) router.push("/learn");
  }

  return (
    <div className="mx-auto w-full max-w-[38rem] pb-20">
      {/* The reading bar: thin, fixed, and the only chrome above the prose. */}
      <div
        className="bg-surface-2 fixed inset-x-0 top-0 z-20 h-0.5"
        role="progressbar"
        aria-label="Reading progress"
        aria-valuenow={Math.round(read * 100)}
        data-read={Math.round(read * 100)}
      >
        <motion.div
          className="bg-accent h-full origin-left"
          style={{ width: `${read * 100}%` }}
          transition={reduced ? { duration: 0 } : SPRING.snappy}
        />
      </div>

      <nav className="text-text-tertiary text-caption mb-6 flex items-center gap-2">
        <Link href="/learn" className="hover:text-text-secondary">
          ← Path
        </Link>
        <span aria-hidden>·</span>
        <span className="font-mono">{estMinutes} min read</span>
        {status === "completed" && (
          <span className="text-accent-bright ml-auto" data-completed>
            Completed
          </span>
        )}
      </nav>

      <h1 className="text-display-lg mb-8">{title}</h1>

      {/* The lesson. Generous measure, generous leading — this is reading, not
          scanning, and the components sit inside the prose rhythm. */}
      <article
        ref={article}
        data-lesson-body
        className="prose-lesson text-body-lg text-text-secondary flex flex-col gap-5"
      >
        {children}
      </article>

      <section className="border-border mt-10 flex flex-col gap-4 border-t pt-8">
        {verdict === null ? (
          <>
            <h2 className="text-heading-lg">Now make it stick</h2>
            <p className="text-text-secondary text-body-md">
              {PRACTICE_SPOTS} hands on exactly this concept. Reading it is not the same as seeing
              it.
            </p>
            <Button variant="accent" size="lg" className="w-full" asChild>
              <Link href={practiceHref} data-practice>
                Practice this
              </Link>
            </Button>
          </>
        ) : (
          <div className="flex flex-col gap-4" data-verdict={verdict.passed ? "pass" : "fail"}>
            <h2 className="text-heading-lg">{verdict.passed ? "Lesson complete" : "Not yet"}</h2>
            <p className="text-body-lg">{verdict.message}</p>

            {verdict.passed ? (
              <Button variant="accent" size="lg" className="w-full" asChild>
                <Link href="/learn">Back to the path</Link>
              </Button>
            ) : (
              <div className="flex flex-col gap-2">
                <Button variant="accent" size="lg" className="w-full" asChild>
                  <Link href={practiceHref}>Try 10 more</Link>
                </Button>
                {verdict.canOverride && (
                  // Never a permanent wall. After three real attempts, the
                  // choice to move on is theirs.
                  <Button
                    variant="bare"
                    size="sm"
                    className="w-full"
                    loading={busy}
                    onClick={() => void markAnyway()}
                    data-override
                  >
                    Mark complete anyway
                  </Button>
                )}
              </div>
            )}
          </div>
        )}

        <p className="text-text-tertiary text-caption">
          {attempts === 0 ? "" : `${attempts} practice ${attempts === 1 ? "set" : "sets"} so far.`}
        </p>
      </section>
    </div>
  );
}
