import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_RETRIES = 2;
const MAX_CHUNK_MB = 8; // safety cap per chunk

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

async function blobToBase64DataUrl(blob: Blob, mimeType: string): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  const chunkSize = 32768;
  for (let i = 0; i < buf.length; i += chunkSize) {
    const sub = buf.subarray(i, Math.min(i + chunkSize, buf.length));
    let s = "";
    for (let j = 0; j < sub.length; j++) s += String.fromCharCode(sub[j]);
    binary += s;
  }
  const b64 = btoa(binary);
  return `data:${mimeType};base64,${b64}`;
}

async function callAI(
  dataUrl: string,
  today: string,
  apiKey: string,
  partLabel: string
): Promise<AnalysisResult | null> {
  const prompt = `Hoy es ${today}. ${partLabel} Analiza este audio de reunión. Devuelve transcripción literal, resumen, tareas (responsable, prioridad, fecha si aplica), decisiones, riesgos, sentimiento, datos clave, etiquetas y eventos de calendario detectados. Si es una parte intermedia, transcribe lo que oigas aunque empiece o termine a media frase.`;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
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
                { type: "image_url", image_url: { url: dataUrl } },
                { type: "text", text: prompt },
              ],
            },
          ],
          tools: [ANALYSIS_TOOL],
          tool_choice: { type: "function", function: { name: "analyze_meeting" } },
        }),
      });

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
      if (toolCall) return JSON.parse(toolCall.function.arguments);
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

function mergeResults(results: AnalysisResult[]): AnalysisResult {
  if (results.length === 1) return results[0];
  const merged: AnalysisResult = {
    transcript: results.map((r) => r.transcript).join("\n\n"),
    summary: results.map((r, i) => `**Parte ${i + 1}:** ${r.summary}`).join("\n\n"),
    tasks: [],
    decisions: [],
    risks: [],
    sentiment: "neutral",
    key_data: [],
    tags: [],
    calendar_events: [],
  };
  for (const r of results) {
    merged.tasks.push(...(r.tasks || []));
    merged.decisions.push(...(r.decisions || []));
    merged.risks.push(...(r.risks || []));
    merged.key_data.push(...(r.key_data || []));
    merged.tags.push(...(r.tags || []));
    merged.calendar_events.push(...(r.calendar_events || []));
  }
  // Most common sentiment
  const counts: Record<string, number> = { positivo: 0, neutral: 0, mixto: 0, negativo: 0 };
  for (const r of results) if (counts[r.sentiment] !== undefined) counts[r.sentiment]++;
  merged.sentiment = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
  // Dedupe tags
  merged.tags = Array.from(new Set(merged.tags));
  return merged;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

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

    const paths: string[] = (meeting.chunk_paths && meeting.chunk_paths.length > 0)
      ? meeting.chunk_paths
      : (meeting.file_path ? [meeting.file_path] : []);

    if (paths.length === 0) {
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

    const today = new Date().toISOString().split("T")[0];
    const mimeType = meeting.mime_type || "audio/mpeg";
    const results: AnalysisResult[] = [];

    for (let i = 0; i < paths.length; i++) {
      const chunkPath = paths[i];
      const partLabel = paths.length > 1 ? `[Parte ${i + 1} de ${paths.length}]` : "";

      // Update progress in DB so the UI can show it
      await supabase.from("meetings").update({
        ai_summary: JSON.stringify({ progress: i, total: paths.length, status: "processing_chunk" }),
      }).eq("id", meeting_id);

      const { data: fileData, error: fileError } = await supabase.storage
        .from("recordings")
        .download(chunkPath);

      if (fileError || !fileData) {
        console.error(`Failed to download chunk ${i}:`, fileError);
        continue;
      }

      const sizeMB = fileData.size / 1024 / 1024;
      if (sizeMB > MAX_CHUNK_MB) {
        console.error(`Chunk ${i} too large: ${sizeMB.toFixed(1)} MB`);
        continue;
      }

      try {
        const dataUrl = await blobToBase64DataUrl(fileData, mimeType);
        const result = await callAI(dataUrl, today, LOVABLE_API_KEY, partLabel);
        if (result) results.push(result);
      } catch (e) {
        console.error(`Chunk ${i} analysis failed:`, e);
      }

      // Force GC hint by clearing reference
      // (Deno doesn't expose explicit gc, but losing references helps)
    }

    if (results.length === 0) {
      await supabase.from("meetings").update({ status: "error" }).eq("id", meeting_id);
      return new Response(JSON.stringify({ error: "AI analysis failed for all chunks" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const finalAnalysis = mergeResults(results);

    const aiSummary = JSON.stringify({
      summary: finalAnalysis.summary,
      tasks: finalAnalysis.tasks || [],
      decisions: finalAnalysis.decisions || [],
      risks: finalAnalysis.risks || [],
      sentiment: finalAnalysis.sentiment || "neutral",
      key_data: finalAnalysis.key_data || [],
      tags: finalAnalysis.tags || [],
      calendar_events: finalAnalysis.calendar_events || [],
      processed_chunks: results.length,
      total_chunks: paths.length,
    });

    await supabase.from("meetings").update({
      transcript: finalAnalysis.transcript,
      ai_summary: aiSummary,
      status: "completed",
    }).eq("id", meeting_id);

    // Auto-create calendar events
    const calendarEvents = finalAnalysis.calendar_events || [];
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
        summary: finalAnalysis.summary,
        tasks_count: (finalAnalysis.tasks || []).length,
        events_created: createdEvents.length,
        chunks_processed: results.length,
        chunks_total: paths.length,
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
