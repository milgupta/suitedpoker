"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { capture } from "@/lib/analytics-client";
import { fadeIn } from "@/lib/motion";
import { cn } from "@/lib/utils";

/**
 * Hand-scoped chat.
 *
 * A bottom sheet on mobile, which is where the thumb already is, and which
 * dismisses with a swipe. It NEVER blocks "next hand": the whole panel is one
 * tap to close, and the drill player keeps its own controls. A coach that
 * interrupts the loop stops being used by exactly the people who need it.
 *
 * The starter chips exist because a blank input after a hand is a question
 * about what the box is for, not a prompt to ask something.
 */

const STARTERS = [
  "Why not just call?",
  "What if I had a flush draw?",
  "What does he have here?",
  "What should I do on the turn?",
] as const;

export interface CoachChatProps {
  attemptId: string;
  spotId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface Message {
  role: "user" | "assistant";
  content: string;
}

export function CoachChat({ attemptId, spotId, open, onOpenChange }: CoachChatProps) {
  const reduced = useReducedMotion() ?? false;
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [capped, setCapped] = useState(false);
  const [turnsUsed, setTurnsUsed] = useState(0);
  const [maxTurns, setMaxTurns] = useState(10);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Loaded from the server rather than kept in component state, so the
  // conversation is still there after a reload or a trip to another hand.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    void (async () => {
      try {
        const response = await fetch(`/api/coach/chat?attemptId=${encodeURIComponent(attemptId)}`, {
          cache: "no-store",
        });
        if (!response.ok || cancelled) return;
        const body = (await response.json()) as {
          messages?: Message[];
          turnsUsed?: number;
          maxTurns?: number;
        };
        if (cancelled) return;
        setMessages(body.messages ?? []);
        setTurnsUsed(body.turnsUsed ?? 0);
        setMaxTurns(body.maxTurns ?? 10);
      } catch {
        // An empty transcript is the right default; the box still works.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [attemptId, open]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  const send = useCallback(
    async (text: string) => {
      const question = text.trim();
      if (question === "" || sending || capped) return;

      setDraft("");
      setError(null);
      setSending(true);
      setMessages((prior) => [...prior, { role: "user", content: question }]);
      capture("coach_chat_message", {});

      try {
        const response = await fetch("/api/coach/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ attemptId, spotId, message: question }),
        });

        const body = (await response.json()) as {
          text?: string;
          capped?: boolean;
          turnsUsed?: number;
          maxTurns?: number;
          message?: string;
          error?: string;
        };

        if (response.status === 429) {
          // The friendly message the server wrote, not "429".
          setError(body.message ?? "You've used today's coach questions.");
          setMessages((prior) => prior.slice(0, -1));
          return;
        }

        if (!response.ok) {
          setError("That didn't get through. Ask again?");
          setMessages((prior) => prior.slice(0, -1));
          return;
        }

        if (body.capped === true) setCapped(true);
        if (typeof body.turnsUsed === "number") setTurnsUsed(body.turnsUsed);
        if (typeof body.maxTurns === "number") setMaxTurns(body.maxTurns);

        setMessages((prior) => [...prior, { role: "assistant", content: body.text ?? "" }]);
      } catch {
        setError("That didn't get through. Ask again?");
        setMessages((prior) => prior.slice(0, -1));
      } finally {
        setSending(false);
      }
    },
    [attemptId, capped, sending, spotId],
  );

  const remaining = Math.max(0, maxTurns - turnsUsed);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="flex h-[80dvh] flex-col sm:h-[70dvh]">
        <SheetHeader>
          <SheetTitle className="text-heading-md">Ask about this hand</SheetTitle>
        </SheetHeader>

        <div
          ref={scrollRef}
          className="flex-1 space-y-3 overflow-y-auto px-4 pb-2"
          data-testid="chat-log"
        >
          {messages.length === 0 && (
            <p className="text-text-secondary text-body-md">
              The full solution for this hand is loaded. Ask anything about it.
            </p>
          )}

          {messages.map((message, index) => (
            <motion.div
              key={`${message.role}-${index}`}
              variants={fadeIn(reduced)}
              initial="hidden"
              animate="visible"
              className={cn(
                "text-body-md max-w-[85%] rounded-xl px-3 py-2",
                message.role === "user"
                  ? "bg-accent/15 text-text-primary ml-auto"
                  : "bg-surface-2 text-text-primary",
              )}
              data-role={message.role}
            >
              {message.content}
            </motion.div>
          ))}

          {sending && (
            <div
              className="bg-surface-2 w-fit rounded-xl px-3 py-2"
              aria-label="Thinking"
              role="status"
            >
              <TypingDots reduced={reduced} />
            </div>
          )}
        </div>

        {messages.length === 0 && (
          <div className="flex flex-wrap gap-2 px-4 pb-2">
            {STARTERS.map((starter) => (
              <button
                key={starter}
                type="button"
                onClick={() => void send(starter)}
                className="border-border text-body-sm tap-target hover:bg-surface-2 rounded-full border px-3 py-1.5"
                data-testid="chat-starter"
              >
                {starter}
              </button>
            ))}
          </div>
        )}

        {error !== null && (
          <p className="text-grade-mistake text-body-sm px-4 pb-2" role="status">
            {error}
          </p>
        )}

        <form
          className="flex items-center gap-2 px-4 pb-4"
          onSubmit={(event) => {
            event.preventDefault();
            void send(draft);
          }}
        >
          <Input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={capped ? "That's this hand covered" : "Ask about this hand"}
            maxLength={500}
            disabled={capped}
            aria-label="Ask about this hand"
            data-testid="chat-input"
          />
          <Button type="submit" disabled={sending || capped || draft.trim() === ""}>
            Ask
          </Button>
        </form>

        <p className="text-text-tertiary text-body-sm px-4 pb-3">
          {capped ? "Ask me on the next hand." : `${remaining} questions left on this hand.`}
        </p>
      </SheetContent>
    </Sheet>
  );
}

function TypingDots({ reduced }: { reduced: boolean }) {
  return (
    <span className="flex gap-1" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="bg-text-tertiary block size-1.5 rounded-full"
          animate={reduced ? undefined : { opacity: [0.3, 1, 0.3] }}
          transition={{ repeat: Infinity, duration: 1.2, delay: i * 0.15 }}
        />
      ))}
    </span>
  );
}
