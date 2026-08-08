import { describe, expect, it } from "vitest";
import { APP_HOME, APP_NAV, chromeMode, navItemActive } from "@/lib/app-chrome";

describe("APP_HOME", () => {
  it("is Practice — there is no separate Home hub", () => {
    expect(APP_HOME).toBe("/practice");
    expect(APP_NAV.map((i) => i.label)).toEqual(["Practice", "Learn", "Ranges", "Progress"]);
    expect(APP_NAV[0]?.href).toBe("/practice");
  });
});

describe("chromeMode", () => {
  it("hides the funnel", () => {
    expect(chromeMode("/onboarding")).toBe("hidden");
    expect(chromeMode("/onboarding/hand")).toBe("hidden");
    expect(chromeMode("/paywall")).toBe("hidden");
    expect(chromeMode("/welcome")).toBe("hidden");
    expect(chromeMode("/diagnosis")).toBe("hidden");
  });

  it("compacts immersive sessions", () => {
    expect(chromeMode("/arena")).toBe("compact");
    expect(chromeMode("/daily")).toBe("compact");
    expect(chromeMode("/table/play")).toBe("compact");
    expect(chromeMode("/learn/before-the-flop/position-is-everything")).toBe("compact");
  });

  it("shows the full bar on hubs", () => {
    expect(chromeMode("/practice")).toBe("full");
    expect(chromeMode("/progress")).toBe("full");
    expect(chromeMode("/learn")).toBe("full");
    expect(chromeMode("/ranges")).toBe("full");
    expect(chromeMode("/table")).toBe("full");
    expect(chromeMode("/account")).toBe("full");
    // Legacy path still gets chrome while the redirect runs.
    expect(chromeMode("/dashboard")).toBe("full");
  });
});

describe("navItemActive", () => {
  const practice = APP_NAV.find((i) => i.href === "/practice")!;
  const learn = APP_NAV.find((i) => i.href === "/learn")!;

  it("marks Practice active across game modes", () => {
    expect(navItemActive("/practice", practice)).toBe(true);
    expect(navItemActive("/arena", practice)).toBe(true);
    expect(navItemActive("/daily", practice)).toBe(true);
    expect(navItemActive("/table/play", practice)).toBe(true);
    expect(navItemActive("/progress", practice)).toBe(false);
  });

  it("prefixes Learn", () => {
    expect(navItemActive("/learn", learn)).toBe(true);
    expect(navItemActive("/learn/before-the-flop/position-is-everything", learn)).toBe(true);
  });
});
