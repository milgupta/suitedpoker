/**
 * The other half of the reduced-motion contract: with the preference off, the
 * primitives really do transform. Without this, a bug that disabled motion
 * everywhere would pass the reduced-motion suite silently.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

vi.stubGlobal("matchMedia", (query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addEventListener: () => {},
  removeEventListener: () => {},
  addListener: () => {},
  removeListener: () => {},
  dispatchEvent: () => false,
}));

const { FadeUp, Shimmer } = await import("../../src/components/motion");

afterEach(cleanup);

describe("with motion allowed", () => {
  it("FadeUp starts translated", () => {
    const { container } = render(
      <FadeUp>
        <p>rises</p>
      </FadeUp>,
    );
    const el = container.firstElementChild as HTMLElement;
    expect(el.style.transform).toMatch(/translateY/);
  });

  it("Shimmer renders its sweep", () => {
    const { container } = render(<Shimmer className="h-4 w-32" />);
    expect(container.querySelector(".animate-shimmer")).not.toBeNull();
  });

  it("AnimatedNumber exposes the settled value to assistive tech while animating", async () => {
    const { AnimatedNumber } = await import("../../src/components/motion");
    render(<AnimatedNumber value={100} />);
    expect(screen.getByLabelText("100")).toBeInTheDocument();
  });
});
