/**
 * The reduced-motion contract at the DOM level.
 *
 * matchMedia is stubbed before the components are imported, because Framer
 * Motion samples the media query once per module instance — a stub applied
 * after import would arrive too late.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

vi.stubGlobal("matchMedia", (query: string) => ({
  matches: query.includes("prefers-reduced-motion"),
  media: query,
  onchange: null,
  addEventListener: () => {},
  removeEventListener: () => {},
  addListener: () => {},
  removeListener: () => {},
  dispatchEvent: () => false,
}));

const { AnimatedNumber, FadeUp, PageTransition, Shimmer, Stagger } =
  await import("../../src/components/motion");

afterEach(cleanup);

const styleOf = (el: Element | null): CSSStyleDeclaration => {
  if (el === null) throw new Error("element not found");
  return (el as HTMLElement).style;
};

describe("with prefers-reduced-motion: reduce", () => {
  it("FadeUp writes no transform", () => {
    const { container } = render(
      <FadeUp>
        <p>rises</p>
      </FadeUp>,
    );
    expect(styleOf(container.firstElementChild).transform).toBe("");
    expect(screen.getByText("rises")).toBeInTheDocument();
  });

  it("Stagger writes no transform on the container or its children", () => {
    const { container } = render(
      <Stagger>
        <span>one</span>
        <span>two</span>
      </Stagger>,
    );
    const wrapper = container.firstElementChild;
    expect(styleOf(wrapper).transform).toBe("");
    for (const child of Array.from(wrapper?.children ?? [])) {
      expect(styleOf(child).transform).toBe("");
    }
  });

  it("PageTransition writes no transform", () => {
    const { container } = render(
      <PageTransition>
        <p>page</p>
      </PageTransition>,
    );
    expect(styleOf(container.firstElementChild).transform).toBe("");
  });

  it("Shimmer does not render its sweep", () => {
    const { container } = render(<Shimmer className="h-4 w-32" />);
    expect(container.querySelector(".animate-shimmer")).toBeNull();
    expect(screen.getByRole("status")).toHaveAttribute("aria-busy", "true");
  });

  it("AnimatedNumber shows the settled value immediately", () => {
    render(<AnimatedNumber value={42} suffix="%" />);
    expect(screen.getByLabelText("42%")).toHaveTextContent("42%");
  });

  it("AnimatedNumber still formats decimals and signs", () => {
    render(<AnimatedNumber value={3.25} decimals={1} signed suffix=" bb/100" />);
    expect(screen.getByLabelText("+3.3 bb/100")).toBeInTheDocument();
  });
});
