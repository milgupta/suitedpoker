import type { ReactNode } from "react";
import {
  Body,
  Container,
  Head,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import { email, font, link, type } from "./theme";

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
          <Text
            style={{
              ...type.small,
              color: email.textTertiary,
              margin: "0 0 24px",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            SuitedPoker
          </Text>

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
