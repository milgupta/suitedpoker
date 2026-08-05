"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { loginSchema, type LoginValues } from "@/lib/auth-schemas";
import { createClient } from "@/lib/supabase/client";
import { authErrorMessage } from "@/lib/supabase/errors";
import { FormError } from "../auth-shell";

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next");
  const [submitError, setSubmitError] = useState("");

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  async function onSubmit(values: LoginValues) {
    setSubmitError("");

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: values.email,
      password: values.password,
    });

    if (error !== null) {
      setSubmitError(authErrorMessage(error));
      return;
    }

    // Honour where they were headed before being bounced to login. Only
    // same-origin paths — an open redirect here would be a phishing gift.
    const destination =
      next !== null && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";

    router.replace(destination);
    // The session cookie was set by the client; refresh so server components
    // and middleware see it on the next navigation.
    router.refresh();
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
        <div className="flex items-baseline justify-between gap-3">
          <Label htmlFor="password">Password</Label>
          <Link href="/forgot" className="text-accent-bright text-body-sm hover:underline">
            Forgot?
          </Link>
        </div>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          aria-invalid={errors.password !== undefined}
          {...register("password")}
        />
        {errors.password !== undefined && (
          <p className="text-danger-bright text-body-sm">{errors.password.message}</p>
        )}
      </div>

      <Button type="submit" variant="primary" size="lg" className="w-full" loading={isSubmitting}>
        Log in
      </Button>
    </form>
  );
}
