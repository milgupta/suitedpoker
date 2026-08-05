"use client";

import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { Toaster as Sonner, type ToasterProps } from "sonner";

/**
 * The theme is pinned rather than read from next-themes: this product is
 * dark-only in v1, so a theme provider would be a dependency that exists to
 * return a constant.
 *
 * Sonner is styled through its own custom properties, pointed at our tokens.
 */
const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="dark"
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      style={
        {
          "--normal-bg": "var(--color-surface-2)",
          "--normal-text": "var(--color-text-primary)",
          "--normal-border": "var(--color-border-strong)",
          "--success-bg": "var(--color-surface-2)",
          "--success-text": "var(--color-grade-best)",
          "--error-bg": "var(--color-surface-2)",
          "--error-text": "var(--color-danger-bright)",
          "--border-radius": "var(--radius-lg)",
        } as React.CSSProperties
      }
      {...props}
    />
  );
};

export { Toaster };
