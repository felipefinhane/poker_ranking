import { createClient } from "@supabase/supabase-js";

export const supabaseClient = () => {
  const url = process.env.SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, anon, {
    auth: { persistSession: true, autoRefreshToken: true },
  });
};
