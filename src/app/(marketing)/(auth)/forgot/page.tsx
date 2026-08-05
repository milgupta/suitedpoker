import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "../auth-shell";
import { ForgotForm } from "./forgot-form";

export const metadata: Metadata = {
  title: "Reset your password",
  robots: { index: false, follow: false },
};

export default function ForgotPage() {
  return (
    <AuthShell
      title="Reset your password"
      lead="We'll email you a link to set a new one."
      footer={
        <Link href="/login" className="text-accent-bright hover:underline">
          Back to log in
        </Link>
      }
    >
      <ForgotForm />
    </AuthShell>
  );
}
