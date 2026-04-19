import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_RETRIES = 2;
// Hard cap: beyond this we refuse rather than risk OOM in the worker (~256MB RAM).
// 30MB raw audio -> ~40MB base64; safe to keep in memory once.
const MAX_FILE_MB = 30;

interface AnalysisResult {
  transcript: string;
  summary: string;
  tasks: { text: string; assignee?: string; priority: string; due_date?: string }[];
  decisions: { text: string; participants?: string[] }[];
  risks: { text: string; severity: string }[];
  sentiment: string;
  key_data: { label: string; value: string }[];
  tags: string[];
  calendar_events: { title: string; date: string; time?: string; duration_minutes?: number; description?: string }[];
}

const ANALYSIS_TOOL = {
  type: "function",
  function: {
    name: "analyze_meeting",
    description: "Structured meeting analysis",
    parameters: {
      type: "object",
      properties: {
        transcript: { type: "string" },
        summary: { type: "string" },
        tasks: { type: "array", items: { type: "object", properties: { text: { type: "string" }, assignee: { type: "string" }, priority: { type: "string", enum: ["alta", "media", "baja"] }, due_date: { type: "string" } }, required: ["text", "priority"] } },
        decisions: { type: "array", items: { type: "object", properties: { text: { type: "string" }, participants: { type: "array", items: { type: "string" } } }, required: ["text"] } },
        risks: { type: "array", items: { type: "object", properties: { text: { type: "string" }, severity: { type: "string", enum: ["alta", "media", "baja"] } }, required: ["text", "severity"] } },
        sentiment: { type: "string", enum: ["positivo", "neutral", "mixto", "negativo"] },
        key_data: { type: "array", items: { type: "object", properties: { label: { type: "string" }, value: { type: "string" } }, required: ["label", "value"] } },
        tags: { type: "array", items: { type: "string" } },
        calendar_events: { type: "array", items: { type: "object", properties: { title: { type: "string" }, date: { type: "string" }, time: { type: "string" }, duration_minutes: { type: "number" }, description: { type: "string" } }, required: ["title", "date"] } },
      },
      required: ["transcript", "summary", "sentiment"],
    },
  },
};

function buildPrompt(today: string): string {
  return `Hoy es ${today}. Analiza este audio/vídeo de una reunión. Devuelve transcripción completa, resumen, tareas (con responsable, prioridad, fecha si aplica), decisiones, riesgos, sentimiento, datos clave, etiquetas y eventos de calendario detectados.`;
}

async function callAI(
  imageUrl: string,
  today: string,
  apiKey: string
): Promise<AnalysisResult | null> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(
        "https://ai.gateway.lovable.dev/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: [
              {
                role: "user",
                content: [
                  { type: "image_url", image_url: { url: imageUrl } },
                  { type: "text", text: buildPrompt(today) },
                ],
              },
            ],
            tools: [ANALYSIS_TOOL],
            tool_choice: { type: "function", function: { name: "analyze_meeting" } },
          }),
        }
      );

      if (!response.ok) {
        const errText = await response.text().catch(() => "");
        console.error(`AI HTTP ${response.status}:`, errText.slice(0, 500));
        if (response.status === 429 || response.status === 502 || response.status === 503) {
          await new Promise((r) => setTimeout(r, 3000 * (attempt + 1)));
          continue;
        }
        throw new Error(`AI error: ${response.status}`);
      }

      const data = await response.json();
      if (data.error) throw new Error(data.error.message || "AI error");

      const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
      if (toolCall) {
        return JSON.parse(toolCall.function.arguments);
      }
      const content = data.choices?.[0]?.message?.content || "";
      return JSON.parse(content.replace(/```json?\n?/g, "").replace(/```/g, "").trim());
    } catch (e) {
      console.error(`AI attempt ${attempt + 1} failed:`, e);
      if (attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
        continue;
      }
      throw e;
    }
  }
  return null;
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

    const { meeting_id } = await req.json();
    if (!meeting_id) {
      return new Response(JSON.stringify({ error: "meeting_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: meeting, error: meetingError } = await supabase
      .from("meetings")
      .select("*")
      .eq("id", meeting_id)
      .eq("user_id", user.id)
      .single();

    if (meetingError || !meeting) {
      return new Response(JSON.stringify({ error: "Meeting not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (meeting.status === "processing") {
      return new Response(JSON.stringify({ message: "Already processing" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!meeting.file_path) {
      await supabase.from("meetings").update({ status: "error" }).eq("id", meeting_id);
      return new Response(JSON.stringify({ error: "No file attached" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await supabase.from("meetings").update({ status: "processing" }).eq("id", meeting_id);

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      await supabase.from("meetings").update({ status: "error" }).eq("id", meeting_id);
      return new Response(JSON.stringify({ error: "AI not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const fileSizeMB = (meeting.file_size || 0) / 1024 / 1024;
    const today = new Date().toISOString().split("T")[0];
    const mimeType = meeting.mime_type || "audio/webm";

    let imageUrl: string;

    if (fileSizeMB > 0 && fileSizeMB <= INLINE_BASE64_LIMIT_MB) {
      // Small file: download and inline as base64
      const { data: fileData, error: fileError } = await supabase.storage
        .from("recordings")
        .download(meeting.file_path);

      if (fileError || !fileData) {
        await supabase.from("meetings").update({ status: "error" }).eq("id", meeting_id);
        return new Response(JSON.stringify({ error: "Could not download file" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const buf = new Uint8Array(await fileData.arrayBuffer());
      let binary = "";
      const chunkSize = 8192;
      for (let i = 0; i < buf.length; i += chunkSize) {
        binary += String.fromCharCode.apply(null, Array.from(buf.subarray(i, i + chunkSize)));
      }
      imageUrl = `data:${mimeType};base64,${btoa(binary)}`;
    } else {
      // Large file: pass a signed URL so the AI gateway streams it (no memory load)
      const { data: signed, error: signedErr } = await supabase.storage
        .from("recordings")
        .createSignedUrl(meeting.file_path, 60 * 60); // 1 hour

      if (signedErr || !signed?.signedUrl) {
        console.error("Signed URL error:", signedErr);
        await supabase.from("meetings").update({ status: "error" }).eq("id", meeting_id);
        return new Response(JSON.stringify({ error: "Could not create signed URL" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      imageUrl = signed.signedUrl;
    }

    const result = await callAI(imageUrl, today, LOVABLE_API_KEY);

    if (!result) {
      await supabase.from("meetings").update({ status: "error" }).eq("id", meeting_id);
      return new Response(JSON.stringify({ error: "AI analysis failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiSummary = JSON.stringify({
      summary: result.summary,
      tasks: result.tasks || [],
      decisions: result.decisions || [],
      risks: result.risks || [],
      sentiment: result.sentiment || "neutral",
      key_data: result.key_data || [],
      tags: result.tags || [],
      calendar_events: result.calendar_events || [],
    });

    await supabase.from("meetings").update({
      transcript: result.transcript,
      ai_summary: aiSummary,
      status: "completed",
    }).eq("id", meeting_id);

    // Auto-create calendar events
    const calendarEvents = result.calendar_events || [];
    const createdEvents: string[] = [];
    for (const evt of calendarEvents) {
      try {
        const startTime = evt.time ? `${evt.date}T${evt.time}:00` : `${evt.date}T09:00:00`;
        const durationMs = (evt.duration_minutes || 60) * 60 * 1000;
        const endTime = new Date(new Date(startTime).getTime() + durationMs).toISOString();

        await supabase.from("calendar_events").insert({
          user_id: user.id,
          title: evt.title,
          description: evt.description || `Extraído automáticamente de: ${meeting.title}`,
          start_time: startTime,
          end_time: endTime,
          sync_direction: "to_google",
        });
        createdEvents.push(evt.title);
      } catch (e) {
        console.error("Failed to create calendar event:", e);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        summary: result.summary,
        tasks_count: (result.tasks || []).length,
        events_created: createdEvents.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Analyze error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
