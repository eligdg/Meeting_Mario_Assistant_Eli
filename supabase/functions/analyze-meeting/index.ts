import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Base64 encode that handles large files (no spread operator stack overflow)
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

    // Get meeting
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

    // Update status to processing
    await supabase.from("meetings").update({ status: "processing" }).eq("id", meeting_id);

    // Download the audio/video file from storage
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

    // Convert to base64 for Gemini (safe for large files)
    const arrayBuffer = await fileData.arrayBuffer();
    const base64 = uint8ToBase64(new Uint8Array(arrayBuffer));
    const mimeType = meeting.mime_type || "audio/webm";

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      await supabase.from("meetings").update({ status: "error" }).eq("id", meeting_id);
      return new Response(JSON.stringify({ error: "AI not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const today = new Date().toISOString().split("T")[0];

    // Call Lovable AI with audio using inline_data (native Gemini multimodal)
    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
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
                  url: `data:${mimeType};base64,${base64}`,
                },
              },
              {
                type: "text",
                text: `Hoy es ${today}. Analiza este audio/vídeo de una reunión o grabación. Responde SOLO con un JSON válido (sin markdown, sin backticks) con esta estructura exacta:
{
  "transcript": "Transcripción completa del audio",
  "summary": "Resumen ejecutivo de 2-3 párrafos con los puntos más importantes",
  "tasks": [
    {"text": "Descripción de la tarea", "assignee": "Persona responsable o 'Sin asignar'", "priority": "alta|media|baja", "due_date": "YYYY-MM-DD o null"}
  ],
  "decisions": [
    {"text": "Decisión tomada", "participants": ["persona1"]}
  ],
  "risks": [
    {"text": "Riesgo identificado", "severity": "alta|media|baja"}
  ],
  "calendar_events": [
    {"title": "Nombre del evento", "date": "YYYY-MM-DD", "time": "HH:MM", "duration_minutes": 60, "description": "Descripción"}
  ],
  "sentiment": "positivo|neutral|mixto|negativo",
  "key_data": [
    {"label": "Etiqueta", "value": "Valor"}
  ],
  "tags": ["etiqueta1", "etiqueta2"]
}

Reglas:
- calendar_events: extrae TODAS las fechas, plazos, reuniones futuras, deadlines mencionados. Crea eventos de calendario automáticamente.
- Si mencionan "la semana que viene", "el viernes", "mañana", calcula la fecha real basándote en que hoy es ${today}.
- tasks: extrae TODAS las acciones pendientes, compromisos, tareas mencionadas.
- Sé exhaustivo y preciso en la transcripción.
- Si no hay contenido claro para algún campo, devuelve un array vacío [].`
              }
            ]
          }
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "analyze_meeting",
              description: "Structured analysis of a meeting recording",
              parameters: {
                type: "object",
                properties: {
                  transcript: { type: "string" },
                  summary: { type: "string" },
                  tasks: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        text: { type: "string" },
                        assignee: { type: "string" },
                        priority: { type: "string", enum: ["alta", "media", "baja"] },
                        due_date: { type: "string" }
                      },
                      required: ["text", "priority"]
                    }
                  },
                  decisions: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        text: { type: "string" },
                        participants: { type: "array", items: { type: "string" } }
                      },
                      required: ["text"]
                    }
                  },
                  risks: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        text: { type: "string" },
                        severity: { type: "string", enum: ["alta", "media", "baja"] }
                      },
                      required: ["text", "severity"]
                    }
                  },
                  calendar_events: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        title: { type: "string" },
                        date: { type: "string" },
                        time: { type: "string" },
                        duration_minutes: { type: "number" },
                        description: { type: "string" }
                      },
                      required: ["title", "date"]
                    }
                  },
                  sentiment: { type: "string", enum: ["positivo", "neutral", "mixto", "negativo"] },
                  key_data: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        label: { type: "string" },
                        value: { type: "string" }
                      },
                      required: ["label", "value"]
                    }
                  },
                  tags: { type: "array", items: { type: "string" } }
                },
                required: ["transcript", "summary", "sentiment"]
              }
            }
          }
        ],
        tool_choice: { type: "function", function: { name: "analyze_meeting" } }
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("AI error:", aiResponse.status, errText);
      
      if (aiResponse.status === 429) {
        await supabase.from("meetings").update({ status: "pending" }).eq("id", meeting_id);
        return new Response(JSON.stringify({ error: "Rate limit exceeded, try again later" }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResponse.status === 402) {
        await supabase.from("meetings").update({ status: "pending" }).eq("id", meeting_id);
        return new Response(JSON.stringify({ error: "AI credits exhausted" }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      await supabase.from("meetings").update({ status: "error" }).eq("id", meeting_id);
      return new Response(JSON.stringify({ error: "AI analysis failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiResponse.json();

    // Check for AI gateway errors in the response body
    if (aiData.error) {
      console.error("AI gateway error in body:", JSON.stringify(aiData.error));
      const errMsg = aiData.error.message || "AI analysis failed";
      const errCode = aiData.error.code || 500;
      
      if (errMsg === "PROHIBITED_CONTENT") {
        await supabase.from("meetings").update({ status: "error" }).eq("id", meeting_id);
        return new Response(JSON.stringify({ error: "El contenido del audio fue rechazado por los filtros de seguridad de la IA. Intenta con otro archivo." }), {
          status: 422,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      await supabase.from("meetings").update({ status: "error" }).eq("id", meeting_id);
      return new Response(JSON.stringify({ error: `AI error: ${errMsg}` }), {
        status: typeof errCode === "number" ? errCode : 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    
    // Extract from tool call response
    let analysis: any;
    try {
      const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
      if (toolCall) {
        analysis = JSON.parse(toolCall.function.arguments);
      } else {
        // Fallback: try parsing content directly
        const content = aiData.choices?.[0]?.message?.content || "";
        analysis = JSON.parse(content.replace(/```json?\n?/g, "").replace(/```/g, "").trim());
      }
    } catch (parseErr) {
      console.error("Parse error:", parseErr, "AI response:", JSON.stringify(aiData).substring(0, 500));
      await supabase.from("meetings").update({ status: "error" }).eq("id", meeting_id);
      return new Response(JSON.stringify({ error: "Failed to parse AI response" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Save analysis results
    const aiSummary = JSON.stringify({
      summary: analysis.summary,
      tasks: analysis.tasks || [],
      decisions: analysis.decisions || [],
      risks: analysis.risks || [],
      sentiment: analysis.sentiment || "neutral",
      key_data: analysis.key_data || [],
      tags: analysis.tags || [],
      calendar_events: analysis.calendar_events || [],
    });

    await supabase.from("meetings").update({
      transcript: analysis.transcript,
      ai_summary: aiSummary,
      status: "completed",
    }).eq("id", meeting_id);

    // Auto-create calendar events
    const calendarEvents = analysis.calendar_events || [];
    for (const evt of calendarEvents) {
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
    }

    return new Response(JSON.stringify({
      success: true,
      summary: analysis.summary,
      tasks_count: (analysis.tasks || []).length,
      events_created: calendarEvents.length,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Analyze error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
