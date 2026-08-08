"use client";

import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { Button } from "@/components/ui/button";
import { fadeUp, staggerChild, staggerContainer } from "@/lib/motion";
import { cn } from "@/lib/utils";

/**
 * Image-led entry card for the home and practice hubs.
 *
 * Art is optional so the layout ships before AI assets land; a soft azure
 * gradient stands in until `/brand/hub/*.png` exists.
 */

export interface HubCardProps {
  href: string;
  title: string;
  description: string;
  cta: string;
  imageSrc?: string;
  imageAlt?: string;
  /** Featured hero on home — taller art, accent CTA. */
  featured?: boolean;
  /** `data-quick` / `data-cta` for e2e. */
  dataQuick?: string;
  dataCta?: string;
  className?: string;
}

export function HubCard({
  href,
  title,
  description,
  cta,
  imageSrc,
  imageAlt = "",
  featured = false,
  dataQuick,
  dataCta,
  className,
}: HubCardProps) {
  return (
    <article
      className={cn(
        "border-border bg-surface-1 group flex flex-col overflow-hidden rounded-lg border",
        "transition-[border-color,transform] duration-[var(--duration-fast)]",
        "hover:border-border-strong motion-safe:hover:-translate-y-0.5",
        className,
      )}
      data-hub={title}
    >
      <div
        className={cn(
          "relative w-full overflow-hidden",
          featured ? "aspect-[16/10] min-h-[10rem]" : "aspect-square sm:aspect-[16/10]",
        )}
      >
        {imageSrc ? (
          <Image
            src={imageSrc}
            alt={imageAlt}
            fill
            sizes={featured ? "(max-width: 1024px) 100vw, 66vw" : "(max-width: 640px) 100vw, 33vw"}
            className="object-cover"
            priority={featured}
          />
        ) : (
          <div
            className="from-accent/25 via-surface-2 to-surface-3 absolute inset-0 bg-gradient-to-br"
            aria-hidden
          />
        )}
      </div>
      <div className="flex flex-1 flex-col gap-3 p-5">
        <div className="flex flex-col gap-1">
          <h2 className={featured ? "text-heading-lg" : "text-heading-md"}>{title}</h2>
          <p className="text-text-secondary text-body-md">{description}</p>
        </div>
        <Button
          variant={featured ? "accent" : "primary"}
          size="lg"
          className="mt-auto w-full"
          asChild
        >
          <Link href={href} data-cta={dataCta} data-quick={dataQuick}>
            {cta}
          </Link>
        </Button>
      </div>
    </article>
  );
}

/** Stagger wrapper for a grid of hub cards. */
export function HubCardGrid({
  children,
  className,
  count,
}: {
  children: ReactNode;
  className?: string;
  count: number;
}) {
  const reduced = useReducedMotion() ?? false;
  return (
    <motion.div
      className={className}
      initial="hidden"
      animate="visible"
      variants={staggerContainer(reduced, count)}
    >
      {children}
    </motion.div>
  );
}

export function HubCardMotion({ children }: { children: ReactNode }) {
  const reduced = useReducedMotion() ?? false;
  return (
    <motion.div variants={staggerChild(reduced)} className="h-full">
      {children}
    </motion.div>
  );
}

export function HubFade({ children, className }: { children: ReactNode; className?: string }) {
  const reduced = useReducedMotion() ?? false;
  return (
    <motion.div className={className} initial="hidden" animate="visible" variants={fadeUp(reduced)}>
      {children}
    </motion.div>
  );
}
