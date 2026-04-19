import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const stateStr = url.searchParams.get("state");

    if (!code || !stateStr) throw new Error("Missing code or state");

    const state = JSON.parse(stateStr);
    const { user_id, redirect_uri } = state;

    const clientId = Deno.env.get("GOOGLE_CLIENT_ID")!;
    const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET")!;
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;

    // Exchange code for tokens
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: `${supabaseUrl}/functions/v1/google-drive-callback`,
        grant_type: "authorization_code",
      }),
    });

    const tokens = await tokenRes.json();
    if (!tokenRes.ok) throw new Error(tokens.error_description || "Token exchange failed");

    const supabase = createClient(
      supabaseUrl,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

    await supabase.from("google_drive_tokens").upsert({
      user_id,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: expiresAt,
    }, { onConflict: "user_id" });

    // Create default sync settings if not exists
    await supabase.from("drive_sync_settings").upsert({
      user_id,
      auto_export_recordings: false,
      auto_export_summaries: false,
    }, { onConflict: "user_id" });

    const redirectUrl = `${redirect_uri}/settings?google_drive=connected`;
    return new Response(null, {
      status: 302,
      headers: { Location: redirectUrl },
    });
  } catch (error: any) {
    console.error("Google Drive callback error:", error);
    return new Response("Authentication failed", { status: 500 });
  }
});
