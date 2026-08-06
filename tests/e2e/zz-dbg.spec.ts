import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import { loadLocalEnv } from "../support/load-local-env";
loadLocalEnv();
const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);
test("debug arena preset", async ({ page }) => {
  const email = `e2e+dbg${Date.now()}@suitedpoker.com`;
  const { data } = await admin.auth.admin.createUser({
    email,
    password: "correct-horse-battery",
    email_confirm: true,
  });
  await admin.from("subscriptions").insert({
    user_id: data.user!.id,
    status: "active",
    price_id: "p",
    current_period_end: new Date(Date.now() + 30 * 86400000).toISOString(),
  });
  page.on("console", (m) => console.log("CONSOLE:", m.type(), m.text().slice(0, 300)));
  page.on("pageerror", (e) => console.log("PAGEERROR:", e.message.slice(0, 300)));
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("correct-horse-battery");
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL(/dashboard/);
  await page.goto("/ranges");
  await page.waitForTimeout(1500);
  const link = page.getByRole("link", { name: "Practise this spot" });
  console.log("HREF:", await link.getAttribute("href"));
  await link.click();
  await page.waitForTimeout(3000);
  console.log("URL:", page.url());
  console.log("BODY:", (await page.locator("body").innerText()).slice(0, 600));
  await admin.auth.admin.deleteUser(data.user!.id);
  expect(true).toBe(true);
});
