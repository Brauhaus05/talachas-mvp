"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { signIn, type AuthState } from "../actions";
import { AuthField, AuthFormError } from "../auth-ui";

const initial: AuthState = { status: "idle" };

export function SignInForm() {
  const t = useTranslations("auth");
  const [state, formAction, isPending] = useActionState(signIn, initial);

  return (
    <form action={formAction} className="flex flex-col gap-5">
      {state.status === "error" && <AuthFormError code={state.error} />}

      <AuthField label={t("email_label")} htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </AuthField>

      <AuthField label={t("password_label")} htmlFor="password">
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </AuthField>

      <Button type="submit" size="lg" disabled={isPending} className="mt-1 w-full">
        {isPending ? t("submitting") : t("sign_in_cta")}
      </Button>

      <p className="text-text-secondary text-center text-sm">
        {t("no_account")}{" "}
        <Link
          href="/auth/sign-up"
          className="text-text-primary font-medium underline-offset-4 hover:underline"
        >
          {t("sign_up_link")}
        </Link>
      </p>
    </form>
  );
}
