import createMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";
import { routing } from "@/i18n/routing";
import { updateSession } from "@/lib/supabase/middleware";

const handleI18nRouting = createMiddleware(routing);

/** First path segment when it is a known locale, else the default locale. */
function localeOf(pathname: string): (typeof routing.locales)[number] {
  const segment = pathname.split("/")[1];
  return routing.locales.includes(segment as (typeof routing.locales)[number])
    ? (segment as (typeof routing.locales)[number])
    : routing.defaultLocale;
}

function stripLocale(pathname: string): string {
  const locale = pathname.split("/")[1];
  if (routing.locales.includes(locale as (typeof routing.locales)[number])) {
    return pathname.slice(locale.length + 1) || "/";
  }
  return pathname;
}

export async function proxy(request: NextRequest) {
  // 1. Let next-intl resolve the locale (may redirect / → /es or rewrite).
  const response = handleI18nRouting(request);

  // 2. Refresh the Supabase session, writing rotated cookies onto that same
  //    response. Returns the validated user for an optimistic route guard.
  const user = await updateSession(request, response);

  const { pathname } = request.nextUrl;
  const locale = localeOf(pathname);
  const path = stripLocale(pathname);

  // 3. Optimistic guards. The authoritative role check lives in each
  //    dashboard's server layout; this only keeps signed-out users out and
  //    bounces signed-in users away from the auth screens.
  const isProtected = path === "/dashboard" || path.startsWith("/dashboard/");
  const isAuthRoute = path === "/auth/sign-in" || path === "/auth/sign-up";

  if (isProtected && !user) {
    const url = new URL(`/${locale}/auth/sign-in`, request.url);
    url.searchParams.set("redirect", pathname);
    return NextResponse.redirect(url);
  }

  if (isAuthRoute && user) {
    return NextResponse.redirect(new URL(`/${locale}/dashboard`, request.url));
  }

  return response;
}

export const config = {
  matcher: "/((?!api|_next|_vercel|.*\\..*).*)",
};
