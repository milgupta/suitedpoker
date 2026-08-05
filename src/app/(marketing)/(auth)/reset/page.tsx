import type { Metadata } from "next";
import { AuthShell } from "../auth-shell";
import { ResetForm } from "./reset-form";

export const metadata: Metadata = {
  title: "Set a new password",
  robots: { index: false, follow: false },
};

export default function ResetPage() {
  return (
    <AuthShell title="Set a new password" lead="Make it long. Length beats symbols.">
      <ResetForm />
    </AuthShell>
  );
}
