import { z } from "zod";

/**
 * Validation for the auth forms.
 *
 * Password rule is 8 characters and nothing else. No symbol requirement, no
 * mixed case, no digit: those rules cost signups and buy almost no security —
 * length is what matters, and a user forced to add a symbol adds "!" to the end.
 * Strength is SHOWN (see passwordStrength) rather than enforced.
 */

export const MIN_PASSWORD_LENGTH = 8;

const email = z
  .string()
  .min(1, "Enter your email.")
  .email("That doesn't look like an email address.");

const password = z
  .string()
  .min(MIN_PASSWORD_LENGTH, `At least ${MIN_PASSWORD_LENGTH} characters.`)
  // Supabase rejects anything longer; catching it here avoids a round trip.
  .max(72, "That's longer than 72 characters.");

export const loginSchema = z.object({
  email,
  password: z.string().min(1, "Enter your password."),
});

export const signupSchema = z
  .object({
    email,
    password,
    confirmPassword: z.string().min(1, "Confirm your password."),
    /**
     * The 18+ confirmation. Required, and stored with a timestamp.
     *
     * A refined boolean rather than `z.literal(true)`: the literal narrows the
     * OUTPUT type to `true`, which makes an unchecked default value a type
     * error and forces the whole form to be typed twice. The refinement rejects
     * `false` just as firmly and leaves the type alone.
     */
    ageConfirmed: z
      .boolean()
      .refine((v) => v === true, "You need to be 18 or over to use SuitedPoker."),
  })
  .refine((v) => v.password === v.confirmPassword, {
    message: "Those passwords don't match.",
    path: ["confirmPassword"],
  });

export const forgotSchema = z.object({ email });

export const resetSchema = z
  .object({
    password,
    confirmPassword: z.string().min(1, "Confirm your password."),
  })
  .refine((v) => v.password === v.confirmPassword, {
    message: "Those passwords don't match.",
    path: ["confirmPassword"],
  });

export type LoginValues = z.infer<typeof loginSchema>;
export type SignupValues = z.infer<typeof signupSchema>;
export type ForgotValues = z.infer<typeof forgotSchema>;
export type ResetValues = z.infer<typeof resetSchema>;

export interface PasswordStrength {
  /** 0–4. Drives the meter. */
  score: number;
  label: string;
}

/**
 * A strength score for the meter.
 *
 * Length dominates, because it genuinely does: an 18-character passphrase beats
 * "P@ssw0rd" by orders of magnitude. Variety contributes a little. This is
 * feedback, not a gate — nothing here blocks a submit.
 */
export function passwordStrength(value: string): PasswordStrength {
  if (value === "") return { score: 0, label: "" };

  let score = 0;
  if (value.length >= MIN_PASSWORD_LENGTH) score += 1;
  if (value.length >= 12) score += 1;
  if (value.length >= 16) score += 1;

  const variety = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(value)).length;
  if (variety >= 3) score += 1;

  // Anything this obvious is a dictionary hit regardless of its shape.
  if (/^(password|qwerty|letmein|welcome|abc123)/i.test(value)) score = Math.min(score, 1);

  const labels = ["Too short", "Weak", "Okay", "Strong", "Very strong"];
  return { score, label: labels[score] ?? "" };
}
