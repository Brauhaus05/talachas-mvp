import { setRequestLocale, getTranslations } from "next-intl/server";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { SignUpForm } from "./sign-up-form";

export default async function SignUpPage({
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
        <CardTitle className="text-2xl">{t("sign_up_title")}</CardTitle>
        <CardDescription>{t("sign_up_subtitle")}</CardDescription>
      </CardHeader>
      <CardContent>
        <SignUpForm />
      </CardContent>
    </Card>
  );
}
