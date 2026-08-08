import { cn } from "@/lib/utils";

/**
 * A browser-window chrome around a piece of the real product.
 *
 * The page this replaced showed the product inside a 300px phone-shaped video
 * and three 390px-wide screenshots. That is an accurate picture of the mobile
 * build and a poor picture of the thing being sold — a wide, dense, desktop
 * strategy tool. A phone frame also caps how much of the product can be shown
 * at all: a 13x13 range grid inside a 300px column is a texture, not a grid.
 *
 * Deliberately NOT a photorealistic macOS window. Three dots and an address
 * pill is enough signal for "this is software"; anything more competes with
 * the product inside it, which is the only part worth looking at.
 */
export function AppFrame({
  label,
  children,
  className,
}: {
  /** The address-bar text. A real route in the product, never a slogan. */
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "border-border-strong bg-surface-1/40 overflow-hidden rounded-xl border shadow-2xl",
        className,
      )}
    >
      <div className="border-border bg-surface-1 flex items-center gap-3 border-b px-4 py-3">
        <div aria-hidden className="flex gap-1.5">
          <span className="bg-text-tertiary/40 size-2.5 rounded-full" />
          <span className="bg-text-tertiary/40 size-2.5 rounded-full" />
          <span className="bg-text-tertiary/40 size-2.5 rounded-full" />
        </div>
        <span className="bg-canvas/60 text-text-tertiary text-caption truncate rounded-full px-3 py-1 font-mono">
          {label}
        </span>
      </div>

      <div className="bg-canvas p-4 sm:p-6">{children}</div>
    </div>
  );
}
