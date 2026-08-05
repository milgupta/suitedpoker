"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { forgotSchema, type ForgotValues } from "@/lib/auth-schemas";
import { createClient } from "@/lib/supabase/client";
import { authErrorMessage } from "@/lib/supabase/errors";
import { FormError } from "../auth-shell";

export function ForgotForm() {
  const [submitError, setSubmitError] = useState("");
  const [sent, setSent] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotValues>({
    resolver: zodResolver(forgotSchema),
    defaultValues: { email: "" },
  });

  async function onSubmit(values: ForgotValues) {
    setSubmitError("");

    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(values.email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/reset`,
    });

    // Rate limiting is worth surfacing; "no such account" is not — and the
    // confirmation below is deliberately identical whether or not the address
    // exists, so this form cannot be used to discover who has an account.
    if (error !== null) {
      setSubmitError(authErrorMessage(error));
      return;
    }

    setSent(true);
  }

  if (sent) {
    return (
      <div className="border-border bg-surface-1 rounded-lg border p-5">
        <h2 className="text-heading-md">Check your email</h2>
        <p className="text-text-secondary text-body-md mt-2">
          If there&apos;s an account with that address, a reset link is on its way.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-5">
      <FormError message={submitError} />

      <div className="flex flex-col gap-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          aria-invalid={errors.email !== undefined}
          {...register("email")}
        />
        {errors.email !== undefined && (
          <p className="text-danger-bright text-body-sm">{errors.email.message}</p>
        )}
      </div>

      <Button type="submit" variant="primary" size="lg" className="w-full" loading={isSubmitting}>
        Send reset link
      </Button>
    </form>
  );
}
