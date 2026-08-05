import * as React from "react";

import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "border-border bg-surface-3 text-body-lg selection:bg-text-primary selection:text-canvas file:text-body-md file:text-text-primary placeholder:text-text-secondary md:text-body-md h-12 w-full min-w-0 rounded-md border px-4 py-1 shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        "focus-visible:border-accent-bright focus-visible:ring-accent-bright/50 focus-visible:ring-[3px]",
        "aria-invalid:border-danger aria-invalid:ring-danger/20 dark:aria-invalid:ring-danger/40",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
