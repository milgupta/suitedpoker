import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface EmptyStateProps {
  icon: LucideIcon;
  headline: string;
  body: string;
  /** The way out. An empty state without one is a dead end. */
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon: Icon, headline, body, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "border-border bg-surface-1 flex flex-col items-center rounded-lg border px-6 py-12 text-center",
        className,
      )}
    >
      <span className="bg-surface-2 text-text-tertiary flex size-12 items-center justify-center rounded-full">
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <h3 className="text-heading-lg mt-4">{headline}</h3>
      <p className="text-text-secondary text-body-md mt-3 max-w-[38ch]">{body}</p>
      {action !== undefined && <div className="mt-6">{action}</div>}
    </div>
  );
}
