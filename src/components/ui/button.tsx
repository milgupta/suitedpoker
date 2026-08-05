import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import { LoaderIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * DESIGN.md rule 7: anything interactive and text-sized gets a full capsule —
 * there is no in-between, no 6px buttons. Rule 9: 44px minimum touch target,
 * no exceptions, which is why shadcn's 36px default and its xs/sm sizes are
 * gone rather than kept and quietly shipped.
 *
 * Colour roles (DESIGN.md §6 and the plan's colour-role rule agree): WHITE is
 * the primary action — highest contrast on this canvas, and it never competes
 * with data. The lit accent treatment is ONE PER SCREEN. Everything else is
 * ghost or outline.
 */
const buttonVariants = cva(
  [
    "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap",
    "rounded-full font-medium transition-all outline-none",
    "focus-visible:ring-accent-bright/50 focus-visible:ring-[3px]",
    // Disabled reduces the opacity of the enabled style — never a different
    // fill, which is the mistake that makes a disabled button out-contrast an
    // enabled one.
    "disabled:pointer-events-none disabled:opacity-40",
    "aria-invalid:border-danger aria-invalid:ring-danger/20",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  ].join(" "),
  {
    variants: {
      variant: {
        /** The universal advance action. */
        primary: "bg-text-primary text-canvas hover:bg-text-primary/90",
        /** The lit button, §5.2. One per screen. Paint comes from globals.css. */
        accent: "btn-accent",
        secondary: "bg-surface-2 text-text-primary hover:bg-surface-3",
        ghost:
          "border-border text-text-secondary hover:text-text-primary hover:border-border-strong border",
        /** Transparent until hovered — for dense toolbars and icon rows. */
        bare: "text-text-secondary hover:bg-surface-2 hover:text-text-primary",
        destructive: "bg-danger text-on-accent hover:bg-danger/90 focus-visible:ring-danger/50",
        /**
         * The poker decision bar. Large, high-contrast, generous hit area —
         * this is the control the whole product is used through.
         */
        action:
          "border-border-strong bg-surface-2 text-text-primary hover:border-accent border font-semibold",
        link: "text-accent-bright underline-offset-4 hover:underline",
      },
      size: {
        sm: "h-11 px-3",
        default: "h-11 px-5",
        lg: "h-12 px-6 text-body-lg",
        /** Matches the action-bar height in the drill UI. */
        action: "h-14 px-6 text-body-lg",
        icon: "size-11",
        "icon-lg": "size-12",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "default",
    },
  },
);

function Button({
  className,
  variant = "primary",
  size = "default",
  asChild = false,
  loading = false,
  children,
  disabled,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
    loading?: boolean;
  }) {
  const Comp = asChild ? Slot.Root : "button";

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      data-loading={loading || undefined}
      // aria-busy rather than swapping the label: a screen reader announcing
      // "Loading" in place of the button's name loses what it was going to do.
      aria-busy={loading || undefined}
      disabled={disabled === true || loading}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    >
      {/*
        With asChild, Radix's Slot requires exactly ONE element child — and
        `{loading && ...}{children}` is two nodes even when loading is false.
        Passing children straight through keeps asChild working; a slotted
        button is a link or a trigger and never has a loading state anyway.
      */}
      {asChild ? (
        children
      ) : (
        <>
          {loading && <LoaderIcon className="animate-spin" aria-hidden="true" />}
          {children}
        </>
      )}
    </Comp>
  );
}

export { Button, buttonVariants };
