import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CHUNK_DURATION_MS = 10 * 60 * 1000; // 10 minutes per chunk
const MAX_RETRIES = 2;

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    for (let j = 0; j < chunk.length; j++) {
      binary += String.fromCharCode(chunk[j]);
    }
  }
  return btoa(binary);
}

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

async function callAIWithRetry(
  base64Audio: string,
  mimeType: string,
  today: string,
  chunkIndex: number,
  totalChunks: number,
  apiKey: string
): Promise<AnalysisResult | null> {
  const isMultiChunk = totalChunks > 1;
  const chunkContext = isMultiChunk
    ? `\n[Parte ${chunkIndex + 1} de ${totalChunks}] Procesa esta parte del audio.`
    : "";

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
                  {
                    type: "image_url",
                    image_url: {
                      url: `data:${mimeType};base64,${base64Audio}`,
                    },
                  },
                  {
                    type: "text",
                    text: `Hoy es ${today}.${chunkContext} Analiza este audio/vídeo de una reunión. Responde SOLO con un JSON válido (sin markdown, sin backticks):
{
  "transcript": "Transcripción completa de esta parte",
  "summary": "Resumen de esta parte (1-2 párrafos)",
  "tasks": [{"text": "tarea", "assignee": "nombre o Sin asignar", "priority": "alta|media|baja", "due_date": "YYYY-MM-DD o null"}],
  "decisions": [{"text": "decisión", "participants": ["persona"]}],
  "risks": [{"text": "riesgo", "severity": "alta|media|baja"}],
  "sentiment": "positivo|neutral|mixto|negativo",
  "key_data": [{"label": "etiqueta", "value": "valor"}],
  "tags": ["etiqueta"],
  "calendar_events": [{"title": "evento", "date": "YYYY-MM-DD", "time": "HH:MM", "duration_minutes": 60}]
}

Si es una parte intermedia y no hay contenido claro, devuelve arrays vacíos pero incluye lo que encuentres.`,
                  },
                ],
              },
            ],
            tools: [
              {
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
              },
            ],
            tool_choice: { type: "function", function: { name: "analyze_meeting" } },
          }),
        }
      );

      if (!response.ok) {
        if (response.status === 429 || response.status === 502) {
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
      if (attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
        continue;
      }
      throw e;
    }
  }
  return null;
}

function mergeAnalysisResults(results: AnalysisResult[], totalChunks: number): AnalysisResult {
  const merged: AnalysisResult = {
    transcript: results.map((r) => r.transcript).join("\n\n--- [Continuación] ---\n\n"),
    summary: results.map((r) => r.summary).join("\n\n"),
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

  const sentimentCounts: Record<string, number> = { positivo: 0, neutral: 0, mixto: 0, negativo: 0 };
  for (const r of results) {
    if (r.sentiment && sentimentCounts[r.sentiment] !== undefined) {
      sentimentCounts[r.sentiment]++;
    }
  }
  merged.sentiment = Object.entries(sentimentCounts).sort((a, b) => b[1] - a[1])[0][0];

  return merged;
}

// Helper for chunk splitting - we'll handle this in the function
async function splitAudioIntoChunks(
  audioData: ArrayBuffer,
  chunkDurationMs: number,
  mimeType: string
): Promise<string[]> {
  // For now, we'll use a simpler approach: if file is small, process normally
  // Large files will be split into multiple base64 strings at roughly equal sizes
  // This is an approximation - a full implementation would require proper audio decoding
  
  const totalSize = audioData.byteLength;
  const bytesPerMs = totalSize / chunkDurationMs;
  const chunkSizeBytes = Math.floor(chunkDurationMs * bytesPerMs * 0.9);
  
  if (totalSize <= chunkSizeBytes) {
    return [uint8ToBase64(new Uint8Array(audioData))];
  }

  const chunks: string[] = [];
  for (let i = 0; i < totalSize; i += chunkSizeBytes) {
    const end = Math.min(i + chunkSizeBytes, totalSize);
    const chunk = new Uint8Array(audioData.slice(i, end));
    chunks.push(uint8ToBase64(chunk));
  }

  return chunks;
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

    // Check if already processing (prevent duplicate runs)
    if (meeting.status === "processing") {
      return new Response(JSON.stringify({ message: "Already processing" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await supabase.from("meetings").update({ status: "processing" }).eq("id", meeting_id);

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

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      await supabase.from("meetings").update({ status: "error" }).eq("id", meeting_id);
      return new Response(JSON.stringify({ error: "AI not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const mimeType = meeting.mime_type || "audio/webm";
    const today = new Date().toISOString().split("T")[0];
    const arrayBuffer = await fileData.arrayBuffer();
    const totalDurationMs = meeting.duration_seconds ? meeting.duration_seconds * 1000 : 0;
    
    // Determine number of chunks based on duration or file size
    let numChunks: number;
    if (totalDurationMs > CHUNK_DURATION_MS) {
      numChunks = Math.ceil(totalDurationMs / CHUNK_DURATION_MS);
    } else if (arrayBuffer.byteLength > 20 * 1024 * 1024) { // > 20MB
      numChunks = Math.ceil(arrayBuffer.byteLength / (15 * 1024 * 1024)); // ~15MB per chunk
    } else {
      numChunks = 1;
    }

    // Split audio into chunks
    const chunks: string[] = [];
    const totalSize = arrayBuffer.byteLength;
    
    if (numChunks === 1) {
      chunks.push(uint8ToBase64(new Uint8Array(arrayBuffer)));
    } else {
      // Calculate approximately equal chunks
      const chunkSizeBytes = Math.ceil(totalSize / numChunks);
      for (let i = 0; i < totalSize; i += chunkSizeBytes) {
        const end = Math.min(i + chunkSizeBytes, totalSize);
        const chunkData = new Uint8Array(arrayBuffer.slice(i, end));
        chunks.push(uint8ToBase64(chunkData));
      }
    }

    // Process each chunk
    const results: AnalysisResult[] = [];
    for (let i = 0; i < chunks.length; i++) {
      // Update progress in database
      await supabase.from("meetings").update({ 
        status: "processing",
        ai_summary: JSON.stringify({ progress: i + 1, total: chunks.length, status: "processing_chunk" })
      }).eq("id", meeting_id);

      const result = await callAIWithRetry(
        chunks[i],
        mimeType,
        today,
        i,
        chunks.length,
        LOVABLE_API_KEY
      );

      if (result) {
        results.push(result);
      }
    }

    if (results.length === 0) {
      await supabase.from("meetings").update({ status: "error" }).eq("id", meeting_id);
      return new Response(JSON.stringify({ error: "AI analysis failed for all chunks" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Merge results
    const finalAnalysis = results.length === 1 ? results[0] : mergeAnalysisResults(results, chunks.length);

    // Save final results
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
        const startTime = evt.time
          ? `${evt.date}T${evt.time}:00`
          : `${evt.date}T09:00:00`;
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
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("Analyze error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});