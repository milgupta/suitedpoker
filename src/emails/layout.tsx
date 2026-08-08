import type { ReactNode } from "react";
import {
  Body,
  Container,
  Head,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import { email, font, link, LOGO_DISPLAY_PX, logoUrl, monoFont, type } from "./theme";

/**
 * The brand lockup: mark, then wordmark. The email counterpart of
 * `src/components/Wordmark.tsx`, and deliberately the same shape — a logo that
 * is subtly different in the email from the one on the page is the kind of
 * thing that reads as a phishing attempt without anybody being able to say why.
 *
 * TWO RULES MAKE THIS SURVIVE A REAL INBOX:
 *
 * 1. The wordmark is LIVE TEXT, never part of the image. Outlook and Gmail
 *    block remote images by default until the reader trusts the sender — which
 *    is precisely the first email they get from us. A logo baked entirely into
 *    a PNG makes that first impression a grey box.
 * 2. It is a table, not a flex row. Nothing in Outlook's Word rendering engine
 *    implements flexbox, and the fallback is the mark stacked above the name.
 *
 * The image is therefore decorative and carries an empty alt: the name is
 * already right beside it, and alt text would print "SuitedPoker SUITEDPOKER"
 * with images off and announce the brand twice to a screen reader.
 */
function BrandLockup() {
  return (
    <Section style={{ margin: "0 0 28px" }}>
      <table
        cellPadding={0}
        cellSpacing={0}
        role="presentation"
        style={{ borderCollapse: "collapse" }}
      >
        <tbody>
          <tr>
            <td style={{ verticalAlign: "middle", paddingRight: "10px" }}>
              <Img
                src={logoUrl()}
                alt=""
                width={LOGO_DISPLAY_PX}
                height={LOGO_DISPLAY_PX}
                // `display: block` kills the baseline gap an inline image leaves
                // under itself, which otherwise sits the wordmark a few pixels
                // high of centre in every client that honours it.
                style={{ display: "block", borderRadius: "9px" }}
              />
            </td>
            <td style={{ verticalAlign: "middle" }}>
              <Text
                style={{
                  ...type.heading,
                  fontFamily: monoFont,
                  color: email.accentBright,
                  letterSpacing: "0.12em",
                  margin: 0,
                }}
              >
                SUITEDPOKER
              </Text>
            </td>
          </tr>
        </tbody>
      </table>
    </Section>
  );
}

/**
 * The shell every email shares.
 *
 * `Preview` is the line shown next to the subject in an inbox list, and it is
 * the single highest-leverage string in a transactional email — with it unset,
 * clients show the first words of the body, which is usually the greeting.
 */
export function EmailLayout({
  preview,
  children,
  footerNote,
}: {
  preview: string;
  children: ReactNode;
  footerNote?: string;
}) {
  return (
    <Html lang="en">
      <Head>
        {/* Tells a client this design is already dark, so Gmail and Apple Mail
            stop trying to invert it into something unreadable. */}
        <meta name="color-scheme" content="dark" />
        <meta name="supported-color-schemes" content="dark" />
      </Head>
      <Preview>{preview}</Preview>
      <Body
        style={{ backgroundColor: email.canvas, margin: 0, padding: "32px 0", fontFamily: font }}
      >
        <Container
          style={{
            backgroundColor: email.surface,
            border: `1px solid ${email.border}`,
            borderRadius: "12px",
            maxWidth: "560px",
            margin: "0 auto",
            padding: "32px",
          }}
        >
          <BrandLockup />

          {children}

          <Hr style={{ borderColor: email.border, margin: "32px 0 16px" }} />

          <Text style={{ ...type.small, color: email.textTertiary, margin: 0 }}>
            {footerNote ?? "You are receiving this because you have a SuitedPoker account."}
          </Text>
          <Text style={{ ...type.small, color: email.textTertiary, margin: "8px 0 0" }}>
            <Link href={link("/account")} style={{ color: email.textTertiary }}>
              Manage your account
            </Link>
            {" · "}
            <Link href={link("/legal/privacy")} style={{ color: email.textTertiary }}>
              Privacy
            </Link>
          </Text>
          <Text style={{ ...type.small, color: email.textTertiary, margin: "8px 0 0" }}>
            SuitedPoker is educational software. It is not a gambling service and involves no
            real-money play.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export function Heading({ children }: { children: ReactNode }) {
  return (
    <Text style={{ ...type.display, color: email.textPrimary, margin: "0 0 16px" }}>
      {children}
    </Text>
  );
}

export function Paragraph({ children }: { children: ReactNode }) {
  return (
    <Text style={{ ...type.body, color: email.textSecondary, margin: "0 0 16px" }}>{children}</Text>
  );
}

/**
 * A table-based button.
 *
 * Outlook ignores padding on an anchor, so a styled <a> renders as bare text
 * with no hit area. The table is what makes it a button everywhere.
 */
export function CtaButton({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Section style={{ margin: "24px 0" }}>
      <table cellPadding={0} cellSpacing={0} role="presentation">
        <tbody>
          <tr>
            <td style={{ backgroundColor: email.accent, borderRadius: "10px" }}>
              <Link
                href={href}
                style={{
                  ...type.heading,
                  color: email.onAccent,
                  display: "inline-block",
                  padding: "14px 28px",
                  textDecoration: "none",
                }}
              >
                {children}
              </Link>
            </td>
          </tr>
        </tbody>
      </table>
    </Section>
  );
}

/** A figure with its label — the shape dunning #2 leans on. */
export function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <Section
      style={{
        border: `1px solid ${email.border}`,
        borderRadius: "10px",
        padding: "12px 16px",
        margin: "0 0 8px",
      }}
    >
      <Text style={{ ...type.small, color: email.textTertiary, margin: 0 }}>{label}</Text>
      <Text style={{ ...type.heading, color: email.textPrimary, margin: "2px 0 0" }}>{value}</Text>
    </Section>
  );
}
