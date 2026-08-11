"use client";

import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Image-led entry card for the home and practice hubs.
 *
 * Prefer a live `preview` (real PlayingCards, etc.) when the art should match
 * the product. `imageSrc` is for product screenshots; a soft azure gradient
 * stands in when neither is set.
 */

export interface HubCardProps {
  href: string;
  title: string;
  description: string;
  cta: string;
  imageSrc?: string;
  imageAlt?: string;
  /** CSS object-position when `imageSrc` is a tall product screenshot. */
  imagePosition?: string;
  /** Live React preview (e.g. real PlayingCards). Wins over `imageSrc`. */
  preview?: ReactNode;
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
  imagePosition,
  preview,
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
        {preview ? (
          <div className="absolute inset-0" aria-hidden>
            {preview}
          </div>
        ) : imageSrc ? (
          <Image
            src={imageSrc}
            alt={imageAlt}
            fill
            sizes={featured ? "(max-width: 1024px) 100vw, 66vw" : "(max-width: 640px) 100vw, 33vw"}
            className="object-cover"
            style={imagePosition ? { objectPosition: imagePosition } : undefined}
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
  // The stagger lives on the children as CSS delays; the grid is layout only.
  void count;
  return <div className={className}>{children}</div>;
}

export function HubCardMotion({ children, index = 0 }: { children: ReactNode; index?: number }) {
  // CSS entrance, not framer: a mount animation must know the reduced-motion
  // verdict at FIRST PAINT, and only a media query does. See .rise-in.
  return (
    <div className="rise-in h-full" style={{ animationDelay: `${index * 70}ms` }}>
      {children}
    </div>
  );
}

export function HubFade({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={`rise-in ${className ?? ""}`}>{children}</div>;
}
