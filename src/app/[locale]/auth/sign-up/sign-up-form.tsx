"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { HandHelping, Wrench, MailCheck } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { signUp, type AuthState } from "../actions";
import { AuthField, AuthFormError } from "../auth-ui";

const initial: AuthState = { status: "idle" };

type Role = "client" | "talachero";

export function SignUpForm() {
  const t = useTranslations("auth");
  const [state, formAction, isPending] = useActionState(signUp, initial);
  const [role, setRole] = useState<Role>("client");

  if (state.status === "confirm_email") {
    return (
      <div className="flex flex-col items-center gap-4 py-4 text-center">
        <MailCheck className="text-text-primary h-10 w-10" aria-hidden />
        <h2 className="text-text-primary text-lg font-semibold">
          {t("confirm_email_title")}
        </h2>
        <p className="text-text-secondary text-sm">{t("confirm_email_body")}</p>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-5">
      {state.status === "error" && <AuthFormError code={state.error} />}

      <fieldset className="flex flex-col gap-2">
        <legend className="text-text-secondary mb-2 text-xs font-medium tracking-wider uppercase">
          {t("role_label")}
        </legend>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <RoleOption
            value="client"
            checked={role === "client"}
            onSelect={setRole}
            icon={<HandHelping className="h-5 w-5" aria-hidden />}
            title={t("role_client")}
            description={t("role_client_desc")}
          />
          <RoleOption
            value="talachero"
            checked={role === "talachero"}
            onSelect={setRole}
            icon={<Wrench className="h-5 w-5" aria-hidden />}
            title={t("role_talachero")}
            description={t("role_talachero_desc")}
          />
        </div>
      </fieldset>

      <AuthField label={t("full_name_label")} htmlFor="full_name">
        <Input id="full_name" name="full_name" type="text" autoComplete="name" required />
      </AuthField>

      <AuthField label={t("email_label")} htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </AuthField>

      <AuthField label={t("password_label")} htmlFor="password">
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={6}
          required
        />
      </AuthField>

      <Button type="submit" size="lg" disabled={isPending} className="mt-1 w-full">
        {isPending ? t("submitting") : t("sign_up_cta")}
      </Button>

      <p className="text-text-secondary text-center text-sm">
        {t("have_account")}{" "}
        <Link
          href="/auth/sign-in"
          className="text-text-primary font-medium underline-offset-4 hover:underline"
        >
          {t("sign_in_link")}
        </Link>
      </p>
    </form>
  );
}

function RoleOption({
  value,
  checked,
  onSelect,
  icon,
  title,
  description,
}: {
  value: Role;
  checked: boolean;
  onSelect: (role: Role) => void;
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer flex-col gap-2 rounded-lg border p-4 transition-colors",
        checked
          ? "border-border-strong bg-surface-muted"
          : "border-border hover:bg-surface-muted/50"
      )}
    >
      <input
        type="radio"
        name="role"
        value={value}
        checked={checked}
        onChange={() => onSelect(value)}
        className="sr-only"
      />
      <span className="text-text-primary">{icon}</span>
      <span className="text-text-primary text-sm font-medium">{title}</span>
      <span className="text-text-secondary text-xs">{description}</span>
    </label>
  );
}
