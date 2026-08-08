/**
 * The two auth emails Supabase sends, rendered from our own templates.
 *
 * Signup confirmation and password reset do not go through `sendTransactional`
 * and cannot: they are sent by Supabase Auth, which owns the one-time token in
 * the link. So the only way our design reaches the FIRST email a new user ever
 * receives is to paste this HTML into
 * Supabase → Authentication → Emails → Templates.
 *
 *   npm run emails:supabase
 *
 * Re-run it after touching `src/emails/*` and paste again — nothing in a build
 * can reach into the Supabase dashboard, so this is a copy that WILL drift.
 * `tests/unit/emails.test.ts` covers the templates themselves; it cannot cover
 * what is pasted.
 *
 * The URLs are Supabase's Go-template variables, left unsubstituted on purpose.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { render } from "@react-email/render";
import { PasswordResetEmail, VerifyEmail } from "../src/emails/templates";
import { subjectFor } from "../src/emails/subjects";

/**
 * Supabase substitutes this server-side, so it must survive rendering as a
 * literal. It is a full absolute URL by the time the mail is sent.
 */
const CONFIRMATION_URL = "{{ .ConfirmationURL }}";

const OUT = join(process.cwd(), "docs", "supabase-emails");

const TEMPLATES = [
  {
    file: "confirm-signup.html",
    supabaseTemplate: "Confirm signup",
    subject: subjectFor("verify_email"),
    element: VerifyEmail({ verifyUrl: CONFIRMATION_URL }),
  },
  {
    file: "reset-password.html",
    supabaseTemplate: "Reset password",
    subject: subjectFor("password_reset"),
    element: PasswordResetEmail({ resetUrl: CONFIRMATION_URL }),
  },
] as const;

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });

  for (const { file, supabaseTemplate, subject, element } of TEMPLATES) {
    const html = await render(element);

    // A rendered file with the variable HTML-escaped would be pasted, look
    // right, and mail every user a dead link — so this is checked, not assumed.
    if (!html.includes(CONFIRMATION_URL)) {
      throw new Error(`${file}: ${CONFIRMATION_URL} did not survive rendering`);
    }

    writeFileSync(join(OUT, file), html);
    console.log(
      `docs/supabase-emails/${file.padEnd(22)} → "${supabaseTemplate}"   subject: ${subject}`,
    );
  }

  console.log(
    "\nPaste each into Supabase → Authentication → Emails → Templates,\n" +
      "and set the subject line shown above.\n",
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
