"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SegmentedMeter } from "@/components/ui/segmented-meter";
import { passwordStrength, resetSchema, type ResetValues } from "@/lib/auth-schemas";
import { createClient } from "@/lib/supabase/client";
import { authErrorMessage } from "@/lib/supabase/errors";
import { FormError } from "../auth-shell";
import { APP_HOME } from "@/lib/app-chrome";

const STRENGTH_COLORS = [
  "var(--color-grade-blunder)",
  "var(--color-grade-mistake)",
  "var(--color-grade-inaccuracy)",
  "var(--color-grade-solid)",
  "var(--color-grade-best)",
];

export function ResetForm() {
  const router = useRouter();
  const [submitError, setSubmitError] = useState("");
  const [ready, setReady] = useState<boolean | null>(null);

  // Arriving here means /auth/callback exchanged the recovery token for a
  // session. Without one there is nothing to update — saying so beats letting
  // someone type a new password into a form that cannot save it.
  useEffect(() => {
    const supabase = createClient();
    void supabase.auth.getSession().then(({ data }) => setReady(data.session !== null));
  }, []);

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<ResetValues>({
    resolver: zodResolver(resetSchema),
    defaultValues: { password: "", confirmPassword: "" },
  });

  const password = useWatch({ control, name: "password" }) ?? "";
  const strength = passwordStrength(password);

  async function onSubmit(values: ResetValues) {
    setSubmitError("");

    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password: values.password });

    if (error !== null) {
      setSubmitError(authErrorMessage(error));
      return;
    }

    router.replace(APP_HOME);
    router.refresh();
  }

  if (ready === false) {
    return (
      <div className="border-border bg-surface-1 rounded-lg border p-5">
        <h2 className="text-heading-md">That link has expired</h2>
        <p className="text-text-secondary text-body-md mt-2">
          Reset links are single use and time limited. Request a new one.
        </p>
        <Button variant="ghost" size="lg" className="mt-4 w-full" asChild>
          <a href="/forgot">Request a new link</a>
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-5">
      <FormError message={submitError} />

      <div className="flex flex-col gap-2">
        <Label htmlFor="password">New password</Label>
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
        <Label htmlFor="confirmPassword">Confirm new password</Label>
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

      <Button
        type="submit"
        variant="primary"
        size="lg"
        className="w-full"
        loading={isSubmitting}
        disabled={ready === null}
      >
        Set new password
      </Button>
    </form>
  );
}
