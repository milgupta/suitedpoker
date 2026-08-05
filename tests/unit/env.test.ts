import { describe, it, expect, afterEach, vi } from "vitest";
import { serverEnv, adminEmails, __resetServerEnvForTests } from "@/lib/env";

afterEach(() => {
  vi.unstubAllEnvs();
  __resetServerEnvForTests();
});

describe("env validation", () => {
  it("parses a minimal environment without throwing", () => {
    expect(() => serverEnv()).not.toThrow();
  });

  it("coerces DEV_BYPASS_ENTITLEMENT to a boolean", () => {
    vi.stubEnv("DEV_BYPASS_ENTITLEMENT", "true");
    vi.stubEnv("NODE_ENV", "development");
    __resetServerEnvForTests();
    expect(serverEnv().DEV_BYPASS_ENTITLEMENT).toBe(true);
  });

  // SECURITY: the entitlement bypass exists so Stages 2-6 can be built before
  // Stripe does. It must be structurally impossible for it to reach production.
  it("forces DEV_BYPASS_ENTITLEMENT to false in production", () => {
    vi.stubEnv("DEV_BYPASS_ENTITLEMENT", "true");
    vi.stubEnv("NODE_ENV", "production");
    __resetServerEnvForTests();
    expect(serverEnv().DEV_BYPASS_ENTITLEMENT).toBe(false);
  });

  it("rejects an invalid NODE_ENV with a readable error", () => {
    vi.stubEnv("NODE_ENV", "banana" as "development");
    __resetServerEnvForTests();
    expect(() => serverEnv()).toThrow(/Invalid server environment variables/);
  });

  it("parses ADMIN_EMAILS into a normalised list", () => {
    vi.stubEnv("ADMIN_EMAILS", " A@b.com , c@d.com ,, ");
    __resetServerEnvForTests();
    expect(adminEmails()).toEqual(["a@b.com", "c@d.com"]);
  });
});
