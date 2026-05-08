import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function getValidToken(supabase: any, userId: string) {
  const { data: tokenData, error } = await supabase
    .from("google_drive_tokens")
    .select("*")
    .eq("user_id", userId)
    .single();

  if (error || !tokenData) return null;

  // Refresh if expired
  if (new Date(tokenData.expires_at) < new Date()) {
    const clientId = Deno.env.get("GOOGLE_CLIENT_ID")!;
    const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET")!;

    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: tokenData.refresh_token,
        grant_type: "refresh_token",
      }),
    });

    const newTokens = await res.json();
    if (!res.ok) return null;

    const expiresAt = new Date(Date.now() + newTokens.expires_in * 1000).toISOString();

    const adminSupabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    await adminSupabase.from("google_drive_tokens").update({
      access_token: newTokens.access_token,
      expires_at: expiresAt,
    }).eq("user_id", userId);

    return newTokens.access_token;
  }

  return tokenData.access_token;
}

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

    const body = await req.json();
    const { action } = body;

    if (action === "status") {
      const { data } = await supabase
        .from("google_drive_tokens")
        .select("id")
        .eq("user_id", user.id)
        .single();

      return new Response(JSON.stringify({ connected: !!data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "disconnect") {
      const adminSupabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );
      await adminSupabase.from("google_drive_tokens").delete().eq("user_id", user.id);

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // All other actions need a valid token
    const accessToken = await getValidToken(supabase, user.id);
    if (!accessToken) {
      return new Response(JSON.stringify({ error: "Not connected to Google Drive" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "list") {
      const rawFolderId = String(body.folder_id || "root");
      // Validate folder_id: must be 'root' or Google Drive ID pattern
      const folderId = /^(root|[a-zA-Z0-9_-]{10,})$/.test(rawFolderId) ? rawFolderId : "root";
      // Sanitize query: strip backslashes and single quotes to prevent Drive query injection
      const rawQ = String(body.query || "");
      const q = rawQ.replace(/\\/g, "").replace(/'/g, "").slice(0, 100);
      const mimeFilter = body.audio_only
        ? " and (mimeType contains 'audio/' or mimeType contains 'video/')"
        : "";
      const nameFilter = q ? ` and name contains '${q}'` : "";

      const query = `'${folderId}' in parents and trashed = false${mimeFilter}${nameFilter}`;
      const params = new URLSearchParams({
        q: query,
        fields: "files(id,name,mimeType,size,modifiedTime,webContentLink,iconLink)",
        pageSize: "50",
        orderBy: "modifiedTime desc",
      });

      const res = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || "Failed to list files");

      return new Response(JSON.stringify({ files: data.files || [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "download") {
      const { file_id } = body;
      if (!file_id) throw new Error("file_id required");

      // Get file metadata
      const metaRes = await fetch(
        `https://www.googleapis.com/drive/v3/files/${file_id}?fields=name,mimeType,size`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      const meta = await metaRes.json();

      // Download file content
      const dlRes = await fetch(
        `https://www.googleapis.com/drive/v3/files/${file_id}?alt=media`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );

      if (!dlRes.ok) throw new Error("Failed to download file");

      const fileBytes = await dlRes.arrayBuffer();
      const base64 = btoa(String.fromCharCode(...new Uint8Array(fileBytes)));

      return new Response(JSON.stringify({
        name: meta.name,
        mimeType: meta.mimeType,
        size: parseInt(meta.size || "0"),
        data: base64,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "upload") {
      const { file_name, mime_type, file_data, folder_id } = body;
      if (!file_name || !file_data) throw new Error("file_name and file_data required");

      // Create file metadata
      const metadata: any = { name: file_name };
      if (folder_id) metadata.parents = [folder_id];

      // Decode base64
      const binaryStr = atob(file_data);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }

      // Multipart upload
      const boundary = "---mma-boundary---";
      const metadataBody = JSON.stringify(metadata);

      const parts = [
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadataBody}\r\n`,
        `--${boundary}\r\nContent-Type: ${mime_type || "application/octet-stream"}\r\n\r\n`,
      ];

      const encoder = new TextEncoder();
      const part1 = encoder.encode(parts[0]);
      const part2 = encoder.encode(parts[1]);
      const ending = encoder.encode(`\r\n--${boundary}--`);

      const bodyArray = new Uint8Array(part1.length + part2.length + bytes.length + ending.length);
      bodyArray.set(part1, 0);
      bodyArray.set(part2, part1.length);
      bodyArray.set(bytes, part1.length + part2.length);
      bodyArray.set(ending, part1.length + part2.length + bytes.length);

      const uploadRes = await fetch(
        "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": `multipart/related; boundary=${boundary}`,
          },
          body: bodyArray,
        }
      );

      const uploadData = await uploadRes.json();
      if (!uploadRes.ok) throw new Error(uploadData.error?.message || "Upload failed");

      return new Response(JSON.stringify({ file: uploadData }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "create_folder") {
      const { folder_name, parent_id } = body;
      const metadata: any = {
        name: folder_name || "Meeting Mario Assistant",
        mimeType: "application/vnd.google-apps.folder",
      };
      if (parent_id) metadata.parents = [parent_id];

      const res = await fetch("https://www.googleapis.com/drive/v3/files?fields=id,name", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(metadata),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || "Failed to create folder");

      return new Response(JSON.stringify({ folder: data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "get_settings") {
      const { data } = await supabase
        .from("drive_sync_settings")
        .select("*")
        .eq("user_id", user.id)
        .single();

      return new Response(JSON.stringify({ settings: data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "update_settings") {
      const { settings } = body;
      const adminSupabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );

      await adminSupabase.from("drive_sync_settings").upsert({
        user_id: user.id,
        ...settings,
      }, { onConflict: "user_id" });

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Google Drive sync error:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
