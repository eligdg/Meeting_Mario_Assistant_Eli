import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function refreshTokenIfNeeded(
  tokenRow: { access_token: string; refresh_token: string; expires_at: string; user_id: string },
  supabase: ReturnType<typeof createClient>
) {
  if (new Date(tokenRow.expires_at) > new Date(Date.now() + 60000)) {
    return tokenRow.access_token;
  }

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: Deno.env.get("GOOGLE_CLIENT_ID")!,
      client_secret: Deno.env.get("GOOGLE_CLIENT_SECRET")!,
      refresh_token: tokenRow.refresh_token,
      grant_type: "refresh_token",
    }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(`Token refresh failed: ${JSON.stringify(data)}`);

  const expiresAt = new Date(Date.now() + data.expires_in * 1000).toISOString();

  await supabase.from("google_calendar_tokens").update({
    access_token: data.access_token,
    expires_at: expiresAt,
  }).eq("user_id", tokenRow.user_id);

  return data.access_token as string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      {
        global: {
          headers: { Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}` },
        },
      }
    );

    // Get tokens
    const { data: tokenRow, error: tokenError } = await supabase
      .from("google_calendar_tokens")
      .select("*")
      .eq("user_id", user.id)
      .single();

    if (tokenError || !tokenRow) {
      return new Response(JSON.stringify({ connected: false }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const action = body.action || "sync";

    if (action === "status") {
      return new Response(JSON.stringify({ connected: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "disconnect") {
      await supabase.from("google_calendar_tokens").delete().eq("user_id", user.id);
      await supabase.from("calendar_events").delete().eq("user_id", user.id);
      return new Response(JSON.stringify({ success: true, connected: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Sync: pull events from Google
    const accessToken = await refreshTokenIfNeeded(tokenRow, supabase);

    const now = new Date();
    const timeMin = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const timeMax = new Date(now.getFullYear(), now.getMonth() + 3, 0).toISOString();

    const calRes = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${timeMin}&timeMax=${timeMax}&singleEvents=true&orderBy=startTime&maxResults=250`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    const calData = await calRes.json();
    if (!calRes.ok) {
      throw new Error(`Google Calendar API error: ${JSON.stringify(calData)}`);
    }

    const events = (calData.items || []).map((item: any) => ({
      user_id: user.id,
      google_event_id: item.id,
      title: item.summary || "Sin título",
      description: item.description || null,
      start_time: item.start?.dateTime || item.start?.date,
      end_time: item.end?.dateTime || item.end?.date,
      location: item.location || null,
      sync_direction: "from_google",
      last_synced_at: new Date().toISOString(),
    }));

    // Delete old synced events and insert fresh
    await supabase.from("calendar_events")
      .delete()
      .eq("user_id", user.id)
      .eq("sync_direction", "from_google");

    if (events.length > 0) {
      const { error: insertError } = await supabase.from("calendar_events").insert(events);
      if (insertError) throw new Error(`Insert error: ${insertError.message}`);
    }

    // Push local events to Google
    const { data: localEvents } = await supabase
      .from("calendar_events")
      .select("*")
      .eq("user_id", user.id)
      .eq("sync_direction", "to_google")
      .is("google_event_id", null);

    for (const evt of localEvents || []) {
      const gcalEvent = {
        summary: evt.title,
        description: evt.description,
        start: { dateTime: evt.start_time, timeZone: "Europe/Madrid" },
        end: { dateTime: evt.end_time, timeZone: "Europe/Madrid" },
        location: evt.location,
      };

      const pushRes = await fetch(
        "https://www.googleapis.com/calendar/v3/calendars/primary/events",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(gcalEvent),
        }
      );

      if (pushRes.ok) {
        const created = await pushRes.json();
        await supabase.from("calendar_events")
          .update({ google_event_id: created.id, last_synced_at: new Date().toISOString() })
          .eq("id", evt.id);
      }
    }

    return new Response(JSON.stringify({
      success: true,
      synced: events.length,
      pushed: (localEvents || []).length,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Sync error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
