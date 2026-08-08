"use client";

import Link from "next/link";
import { Menu, Settings } from "lucide-react";
import { Wordmark } from "@/components/Wordmark";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  APP_HOME,
  APP_NAV,
  navItemActive,
  type AppNavItem,
  type ChromeMode,
} from "@/lib/app-chrome";
import { cn } from "@/lib/utils";

/**
 * The product glass bar — DESIGN.md §6.
 *
 * Floating in document flow (not sticky): the shell puts 16px above it, it is
 * 56px tall, radius-xl, with blur. On narrow viewports the capsule row becomes
 * a sheet — four labels cannot fit next to the logo inside 390px without
 * overflowing, and the overflow e2e correctly refuses that.
 */

export function AppNav({
  mode,
  pathname,
}: {
  mode: Exclude<ChromeMode, "hidden">;
  pathname: string;
}) {
  const compact = mode === "compact";

  return (
    <header
      className={cn(
        "glass glass-blur border-border-strong flex h-14 items-center gap-2 rounded-xl border p-2",
        "mb-6",
      )}
      data-app-chrome={mode}
    >
      <Link
        href={APP_HOME}
        className="tap-target flex shrink-0 items-center rounded-lg px-1"
        aria-label="SuitedPoker home"
      >
        <Wordmark size="sm" className="[&>span:last-child]:hidden md:[&>span:last-child]:inline" />
      </Link>

      {compact ? (
        <div className="flex flex-1 justify-center">
          <Link
            href={APP_HOME}
            className="text-text-secondary hover:text-text-primary tap-target rounded-full px-3 py-2 text-sm"
          >
            Practice
          </Link>
        </div>
      ) : (
        <>
          <nav
            className="hidden min-w-0 flex-1 items-center justify-center gap-0.5 md:flex"
            aria-label="Product"
          >
            {APP_NAV.map((item) => (
              <NavLink key={item.href} item={item} pathname={pathname} />
            ))}
          </nav>

          <MobileNav pathname={pathname} />
        </>
      )}

      <Link
        href="/account"
        className={cn(
          "border-border bg-surface-2 text-text-secondary hover:text-text-primary hover:border-border-strong",
          "tap-target ml-auto flex size-10 shrink-0 items-center justify-center rounded-full border md:ml-0",
        )}
        aria-label="Account and settings"
        data-cta="account"
      >
        <Settings className="size-4" aria-hidden />
      </Link>
    </header>
  );
}

function NavLink({
  item,
  pathname,
  className,
}: {
  item: AppNavItem;
  pathname: string;
  className?: string;
}) {
  const active = navItemActive(pathname, item);
  return (
    <Link
      href={item.href}
      data-nav={item.label}
      aria-current={active ? "page" : undefined}
      className={cn(
        "tap-target shrink-0 rounded-lg px-3 py-2 text-sm whitespace-nowrap transition-colors",
        active ? "bg-surface-2 text-text-primary" : "text-text-secondary hover:text-text-primary",
        className,
      )}
    >
      {item.label}
    </Link>
  );
}

function MobileNav({ pathname }: { pathname: string }) {
  return (
    <Sheet>
      <SheetTrigger
        className={cn(
          "border-border bg-surface-2 text-text-secondary hover:text-text-primary",
          "tap-target flex size-10 shrink-0 items-center justify-center rounded-full border md:hidden",
        )}
        aria-label="Open menu"
        data-nav-menu
      >
        <Menu className="size-4" aria-hidden />
      </SheetTrigger>
      <SheetContent side="left" className="bg-canvas border-border w-[min(20rem,100%)]">
        <SheetHeader>
          <SheetTitle>Menu</SheetTitle>
        </SheetHeader>
        <nav className="mt-4 flex flex-col gap-1 px-2" aria-label="Product">
          {APP_NAV.map((item) => (
            <NavLink
              key={item.href}
              item={item}
              pathname={pathname}
              className="w-full px-3 py-3 text-base"
            />
          ))}
        </nav>
      </SheetContent>
    </Sheet>
  );
}
