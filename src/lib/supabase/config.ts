/**
 * Reads the public Supabase connection values, failing loudly if they are
 * missing so a misconfigured environment surfaces clearly.
 *
 * These are functions (not module-level constants) on purpose: evaluating them
 * lazily means importing this module has no side effects, so `next build` can
 * collect page data without the env vars present (CI, etc.). The check runs
 * only when a Supabase client is actually created at request time.
 */
function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `Missing environment variable ${name}. ` +
        `Copy .env.example to .env.local and fill in the Supabase values ` +
        `(printed by \`pnpm exec supabase status\` for local dev).`
    );
  }
  return value;
}

export function getSupabaseUrl(): string {
  return required("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL);
}

export function getSupabaseAnonKey(): string {
  return required(
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}
