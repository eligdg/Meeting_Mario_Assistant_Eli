import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) throw new Error("Not authenticated");

    const { redirect_uri } = await req.json();
    const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
    if (!clientId) throw new Error("GOOGLE_CLIENT_ID not configured");

    const scopes = [
      "https://www.googleapis.com/auth/drive.file",
      "https://www.googleapis.com/auth/drive.readonly",
    ].join(" ");

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: `${Deno.env.get("SUPABASE_URL")}/functions/v1/google-drive-callback`,
      response_type: "code",
      scope: scopes,
      access_type: "offline",
      prompt: "consent",
      state: JSON.stringify({ user_id: user.id, redirect_uri }),
    });

    const url = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;

    return new Response(JSON.stringify({ url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
