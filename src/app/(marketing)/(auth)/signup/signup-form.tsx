"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SegmentedMeter } from "@/components/ui/segmented-meter";
import { passwordStrength, signupSchema, type SignupValues } from "@/lib/auth-schemas";
import { createClient } from "@/lib/supabase/client";
import { authErrorMessage } from "@/lib/supabase/errors";
import { capture } from "@/lib/analytics-client";
import { AGE_CONFIRMATION } from "@/lib/compliance";
import { START_CONTINUE_PATH } from "@/lib/start-answers";
import { FormError } from "../auth-shell";

const STRENGTH_COLORS = [
  "var(--color-grade-blunder)",
  "var(--color-grade-mistake)",
  "var(--color-grade-inaccuracy)",
  "var(--color-grade-solid)",
  "var(--color-grade-best)",
];

export function SignupForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const fromStart = searchParams.get("from") === "start";
  const afterAuth = fromStart ? START_CONTINUE_PATH : "/onboarding";

  const [submitError, setSubmitError] = useState("");
  const [checkEmail, setCheckEmail] = useState(false);

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<SignupValues>({
    resolver: zodResolver(signupSchema),
    defaultValues: { email: "", password: "", confirmPassword: "", ageConfirmed: false },
  });

  const password = useWatch({ control, name: "password" }) ?? "";
  const strength = passwordStrength(password);

  async function onSubmit(values: SignupValues) {
    setSubmitError("");
    capture("signup_started", { method: "email" });

    const supabase = createClient();
    const { data, error } = await supabase.auth.signUp({
      email: values.email,
      password: values.password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(afterAuth)}`,
        // Timestamped at the moment they confirmed, and carried through
        // Supabase so the trigger writes it onto the profile.
        data: { age_confirmed_at: new Date().toISOString() },
      },
    });

    if (error !== null) {
      setSubmitError(authErrorMessage(error));
      return;
    }

    // With email confirmation switched on, signUp returns a user but no
    // session. Sending them to /onboarding would just bounce off middleware.
    capture("signup_completed", { method: "email" });

    if (data.session === null) {
      setCheckEmail(true);
      return;
    }

    router.replace(afterAuth);
    router.refresh();
  }

  if (checkEmail) {
    return (
      <div className="border-border bg-surface-1 rounded-lg border p-5">
        <h2 className="text-heading-md">Check your email</h2>
        <p className="text-text-secondary text-body-md mt-2">
          We sent you a link to confirm your address. Open it and you&apos;re in.
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

      <div className="flex flex-col gap-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          type="password"
          autoComplete="new-password"
          aria-invalid={errors.password !== undefined}
          {...register("password")}
        />

        {password !== "" && (
          <div className="flex items-center gap-3">
            <SegmentedMeter
              value={strength.score}
              max={4}
              segments={4}
              color={STRENGTH_COLORS[strength.score] ?? STRENGTH_COLORS[0]}
              label="Password strength"
              className="flex-1"
            />
            <span className="text-text-tertiary text-caption w-24 text-right">
              {strength.label}
            </span>
          </div>
        )}

        {errors.password !== undefined && (
          <p className="text-danger-bright text-body-sm">{errors.password.message}</p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="confirmPassword">Confirm password</Label>
        <Input
          id="confirmPassword"
          type="password"
          autoComplete="new-password"
          aria-invalid={errors.confirmPassword !== undefined}
          {...register("confirmPassword")}
        />
        {errors.confirmPassword !== undefined && (
          <p className="text-danger-bright text-body-sm">{errors.confirmPassword.message}</p>
        )}
      </div>

      {/* One line, not a wall of text. Required — z.literal(true) rejects an
          unchecked box, which a plain boolean would accept silently. */}
      <div className="flex flex-col gap-1.5">
        <label className="text-body-md flex items-start gap-3">
          <input
            type="checkbox"
            {...register("ageConfirmed")}
            className="accent-accent tap-target mt-0.5 size-5"
            data-testid="age-confirm"
          />
          <span>{AGE_CONFIRMATION}</span>
        </label>
        {errors.ageConfirmed?.message !== undefined && (
          <FormError message={errors.ageConfirmed.message} />
        )}
      </div>

      <Button type="submit" variant="primary" size="lg" className="w-full" loading={isSubmitting}>
        Create account
      </Button>
    </form>
  );
}
