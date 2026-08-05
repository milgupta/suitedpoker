import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full border border-transparent px-2 py-0.5 text-caption font-medium whitespace-nowrap transition-[color,box-shadow] focus-visible:border-accent-bright focus-visible:ring-[3px] focus-visible:ring-accent-bright/50 aria-invalid:border-danger aria-invalid:ring-danger/20 dark:aria-invalid:ring-danger/40 [&>svg]:pointer-events-none [&>svg]:size-3",
  {
    variants: {
      variant: {
        default: "bg-text-primary text-canvas [a&]:hover:bg-text-primary/90",
        secondary: "bg-surface-2 text-text-primary [a&]:hover:bg-surface-2/90",
        destructive:
          "bg-danger text-on-accent focus-visible:ring-danger/50 [a&]:hover:bg-danger/90",
        outline:
          "border-border text-text-primary [a&]:hover:bg-surface-2 [a&]:hover:text-text-primary",
        ghost: "[a&]:hover:bg-surface-2 [a&]:hover:text-text-primary",
        link: "text-accent-bright underline-offset-4 [a&]:hover:underline",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

function Badge({
  className,
  variant = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "span";

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
