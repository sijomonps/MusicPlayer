import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();

// Support both NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (Vercel standard) and NEXT_PUBLIC_SUPABASE_ANON_KEY (Supabase dashboard default)
const rawKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

const isPlaceholder = (val?: string) =>
  !val ||
  val.includes("your-") ||
  val.startsWith("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...") ||
  val === "sb_publishable_key_here";

const isValidUrl = Boolean(supabaseUrl && !isPlaceholder(supabaseUrl) && supabaseUrl.startsWith("http"));
const isValidKey = Boolean(rawKey && !isPlaceholder(rawKey));

export const isSupabaseConfigured = isValidUrl && isValidKey;

export function getSupabaseConfigStatus(): {
  isConfigured: boolean;
  missing: string[];
} {
  const missing: string[] = [];
  if (!isValidUrl) missing.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!isValidKey) missing.push("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  return {
    isConfigured: isSupabaseConfigured,
    missing,
  };
}

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl!, rawKey!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;
