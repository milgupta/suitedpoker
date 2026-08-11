/**
 * The sim's labelled sizing entry: a DockAction with `opensSizing` opens the
 * expander instead of firing `onAction`, and while one exists the standalone
 * arrow expander stays out of the row — two entry points to one panel is
 * clutter. Drills, which never pass `sizing`, are untouched by construction.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

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

const { ActionDock } = await import("@/components/poker/surface/ActionDock");

afterEach(cleanup);

const sizing = { minTo: 6, maxTo: 100, potBb: 8, onConfirm: vi.fn() };

describe("DockAction.opensSizing", () => {
  it("opens the sizing panel instead of firing onAction", () => {
    const onAction = vi.fn();
    render(
      <ActionDock
        kind="actions"
        onAction={onAction}
        sizing={sizing}
        actions={[
          { id: "fold", label: "Fold" },
          { id: "raise", label: "Raise", opensSizing: true },
        ]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Raise" }));
    expect(onAction).not.toHaveBeenCalled();
    expect(document.querySelector("[data-action-dock-sizing]")).not.toBeNull();
  });

  it("suppresses the standalone expander while a labelled entry exists", () => {
    render(
      <ActionDock
        kind="actions"
        onAction={vi.fn()}
        sizing={sizing}
        actions={[
          { id: "fold", label: "Fold" },
          { id: "raise", label: "Raise", opensSizing: true },
        ]}
      />,
    );
    expect(screen.queryByRole("button", { name: "Choose a bet size" })).toBeNull();
  });

  it("keeps the standalone expander when no action opens sizing", () => {
    render(
      <ActionDock
        kind="actions"
        onAction={vi.fn()}
        sizing={sizing}
        actions={[{ id: "check", label: "Check" }]}
      />,
    );
    expect(screen.getByRole("button", { name: "Choose a bet size" })).toBeInTheDocument();
  });

  it("still fires onAction for ordinary actions", () => {
    const onAction = vi.fn();
    render(
      <ActionDock
        kind="actions"
        onAction={onAction}
        sizing={sizing}
        actions={[
          { id: "fold", label: "Fold" },
          { id: "raise", label: "Raise", opensSizing: true },
        ]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Fold" }));
    expect(onAction).toHaveBeenCalledWith("fold");
  });
});
