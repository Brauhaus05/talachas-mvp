import { setRequestLocale, getTranslations } from "next-intl/server";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { SignInForm } from "./sign-in-form";

export default async function SignInPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("auth");

  return (
    <Card>
      <CardHeader className="items-center text-center">
        <CardTitle className="text-2xl">{t("sign_in_title")}</CardTitle>
        <CardDescription>{t("sign_in_subtitle")}</CardDescription>
      </CardHeader>
      <CardContent>
        <SignInForm />
      </CardContent>
    </Card>
  );
}
