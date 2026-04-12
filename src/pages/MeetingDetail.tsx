import { useState, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  FileText,
  ListChecks,
  AlertTriangle,
  Lightbulb,
  Calendar,
  Download,
  Play,
  Pause,
  MessageSquareQuote,
  BarChart3,
  Database,
  Sparkles,
  Pencil,
  Check,
  X,
  Loader2,
  RefreshCw,
  HardDrive,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { AppLayout } from "@/components/AppLayout";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useGoogleDrive } from "@/hooks/useGoogleDrive";
import { toast } from "sonner";
import { format } from "date-fns";
import { es } from "date-fns/locale";

const priorityColors: Record<string, string> = {
  alta: "bg-destructive/10 text-destructive border-destructive/20",
  media: "bg-warning/10 text-warning border-warning/20",
  baja: "bg-info/10 text-info border-info/20",
};

const sentimentConfig: Record<string, { label: string; color: string; emoji: string }> = {
  positivo: { label: "Positivo", color: "text-success", emoji: "😊" },
  neutral: { label: "Neutral", color: "text-muted-foreground", emoji: "😐" },
  mixto: { label: "Mixto", color: "text-warning", emoji: "🤔" },
  negativo: { label: "Negativo", color: "text-destructive", emoji: "😟" },
};

interface MeetingData {
  id: string;
  title: string;
  recording_type: string;
  duration_seconds: number | null;
  status: string;
  created_at: string;
  file_path: string | null;
  mime_type: string | null;
  transcript: string | null;
  ai_summary: string | null;
}

interface Analysis {
  summary: string;
  tasks: { text: string; assignee?: string; priority: string; due_date?: string; done?: boolean }[];
  decisions: { text: string; participants?: string[] }[];
  risks: { text: string; severity: string }[];
  sentiment: string;
  key_data: { label: string; value: string }[];
  tags: string[];
  calendar_events: { title: string; date: string; time?: string; duration_minutes?: number; description?: string }[];
}

export default function MeetingDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const drive = useGoogleDrive();
  const [meeting, setMeeting] = useState<MeetingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [exportingDrive, setExportingDrive] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [title, setTitle] = useState("");
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  const analysis: Analysis | null = meeting?.ai_summary ? (() => {
    try { return JSON.parse(meeting.ai_summary); } catch { return null; }
  })() : null;

  const sentiment = sentimentConfig[analysis?.sentiment || "neutral"];

  useEffect(() => {
    fetchMeeting();
  }, [id, user]);

  async function fetchMeeting() {
    if (!user || !id) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("meetings")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !data) {
      toast.error("Reunión no encontrada");
      navigate("/meetings");
      return;
    }
    setMeeting(data as MeetingData);
    setTitle(data.title);

    // Get audio URL
    if (data.file_path) {
      const { data: urlData } = await supabase.storage
        .from("recordings")
        .createSignedUrl(data.file_path, 3600);
      if (urlData) setAudioUrl(urlData.signedUrl);
    }
    setLoading(false);
  }

  async function handleReanalyze() {
    if (!meeting) return;
    setAnalyzing(true);
    try {
      const { error } = await supabase.functions.invoke("analyze-meeting", {
        body: { meeting_id: meeting.id },
      });
      if (error) throw error;
      toast.success("Análisis completado");
      await fetchMeeting();
    } catch (err: any) {
      toast.error("Error en el análisis", { description: err.message });
    } finally {
      setAnalyzing(false);
    }
  }

  async function handleExportToDrive() {
    if (!meeting || !audioUrl) return;
    setExportingDrive(true);
    try {
      // Download file from storage
      const res = await fetch(audioUrl);
      const blob = await res.blob();
      const arrayBuffer = await blob.arrayBuffer();
      const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));

      const ext = meeting.mime_type?.includes("video") ? "webm" : "webm";
      const fileName = `${meeting.title}.${ext}`;

      await drive.uploadFile(fileName, meeting.mime_type || "audio/webm", base64, drive.settings?.drive_folder_id || undefined);

      // Also export summary if available
      if (analysis) {
        const summaryText = `# ${meeting.title}\n\n## Resumen\n${analysis.summary}\n\n## Tareas\n${analysis.tasks.map(t => `- [${t.done ? 'x' : ' '}] ${t.text} (${t.priority})`).join('\n')}\n\n## Decisiones\n${analysis.decisions.map(d => `- ${d.text}`).join('\n')}\n\n## Riesgos\n${analysis.risks.map(r => `- ${r.text} (${r.severity})`).join('\n')}`;
        const encoder = new TextEncoder();
        const summaryBytes = encoder.encode(summaryText);
        const summaryBase64 = btoa(String.fromCharCode(...summaryBytes));
        await drive.uploadFile(`${meeting.title} - Resumen.md`, "text/markdown", summaryBase64, drive.settings?.drive_folder_id || undefined);
      }

      toast.success("Exportado a Google Drive");
    } catch (err: any) {
      toast.error("Error al exportar", { description: err.message });
    } finally {
      setExportingDrive(false);
    }
  }

  async function saveTitle() {
    if (!meeting) return;
    await supabase.from("meetings").update({ title }).eq("id", meeting.id);
    setMeeting({ ...meeting, title });
    setEditingTitle(false);
  }

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }

  if (!meeting) return null;

  const isCompleted = meeting.status === "completed" && analysis;
  const isProcessing = meeting.status === "processing";
  const isPending = meeting.status === "pending";

  return (
    <AppLayout>
      <div className="animate-fade-in max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-5">
          <div className="flex items-start gap-3">
            <Link to="/meetings" className="p-2 rounded-lg hover:bg-secondary transition-colors mt-0.5">
              <ArrowLeft className="h-5 w-5 text-muted-foreground" />
            </Link>
            <div className="flex-1 min-w-0">
              {editingTitle ? (
                <div className="flex items-center gap-2">
                  <Input value={title} onChange={(e) => setTitle(e.target.value)} className="text-xl font-bold h-9" autoFocus />
                  <button onClick={saveTitle} className="p-1 rounded hover:bg-secondary"><Check className="h-4 w-4 text-success" /></button>
                  <button onClick={() => { setTitle(meeting.title); setEditingTitle(false); }} className="p-1 rounded hover:bg-secondary"><X className="h-4 w-4 text-muted-foreground" /></button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <h1 className="text-xl sm:text-2xl font-bold text-foreground">{title}</h1>
                  <button onClick={() => setEditingTitle(true)} className="p-1 rounded hover:bg-secondary"><Pencil className="h-3.5 w-3.5 text-muted-foreground" /></button>
                </div>
              )}
              <p className="text-sm text-muted-foreground mt-0.5">
                {format(new Date(meeting.created_at), "d MMMM yyyy, HH:mm", { locale: es })}
                {meeting.duration_seconds && ` · ${Math.floor(meeting.duration_seconds / 60)}m ${meeting.duration_seconds % 60}s`}
              </p>
              {analysis?.tags && analysis.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {analysis.tags.map((tag) => (
                    <span key={tag} className="text-xs px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground">{tag}</span>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {drive.connected && audioUrl && (
              <Button onClick={handleExportToDrive} variant="outline" size="sm" disabled={exportingDrive} className="gap-2">
                {exportingDrive ? <Loader2 className="h-4 w-4 animate-spin" /> : <HardDrive className="h-4 w-4" />}
                Exportar a Drive
              </Button>
            )}
            {(isPending || meeting.status === "error") && (
              <Button onClick={handleReanalyze} disabled={analyzing} size="sm" className="gap-2">
                {analyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                Analizar con IA
              </Button>
            )}
            {isCompleted && (
              <Button onClick={handleReanalyze} variant="outline" size="sm" disabled={analyzing} className="gap-2">
                <RefreshCw className={cn("h-4 w-4", analyzing && "animate-spin")} />
                Re-analizar
              </Button>
            )}
          </div>
        </div>

        {/* Player */}
        {audioUrl && (
          <div className="glass-card rounded-xl p-4 mb-5">
            {meeting.mime_type?.startsWith("video/") ? (
              <video src={audioUrl} controls className="w-full rounded-lg" />
            ) : (
              <audio src={audioUrl} controls className="w-full" />
            )}
          </div>
        )}

        {/* Status banner */}
        {isProcessing && (
          <div className="glass-card rounded-xl p-6 mb-5 text-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-3" />
            <p className="text-foreground font-semibold">Analizando grabación...</p>
            <p className="text-sm text-muted-foreground mt-1">La IA está transcribiendo y extrayendo información clave</p>
          </div>
        )}

        {isPending && !analyzing && (
          <div className="glass-card rounded-xl p-6 mb-5 text-center">
            <Sparkles className="h-8 w-8 text-primary mx-auto mb-3" />
            <p className="text-foreground font-semibold">Pendiente de análisis</p>
            <p className="text-sm text-muted-foreground mt-1">Pulsa "Analizar con IA" para extraer resumen, tareas y eventos</p>
          </div>
        )}

        {meeting.status === "error" && (
          <div className="glass-card rounded-xl p-6 mb-5 text-center border border-destructive/20">
            <AlertTriangle className="h-8 w-8 text-destructive mx-auto mb-3" />
            <p className="text-foreground font-semibold">Error en el análisis</p>
            <p className="text-sm text-muted-foreground mt-1">Puedes intentarlo de nuevo</p>
          </div>
        )}

        {/* Analysis tabs */}
        {isCompleted && analysis && (
          <Tabs defaultValue="summary" className="space-y-4">
            <div className="overflow-x-auto -mx-4 px-4">
              <TabsList className="bg-secondary/50 p-1 h-auto inline-flex w-auto min-w-full sm:min-w-0">
                <TabsTrigger value="summary" className="text-xs sm:text-sm gap-1"><Sparkles className="h-3.5 w-3.5" /><span className="hidden sm:inline">Resumen</span></TabsTrigger>
                <TabsTrigger value="transcript" className="text-xs sm:text-sm gap-1"><FileText className="h-3.5 w-3.5" /><span className="hidden sm:inline">Transcripción</span></TabsTrigger>
                <TabsTrigger value="tasks" className="text-xs sm:text-sm gap-1"><ListChecks className="h-3.5 w-3.5" /><span className="hidden sm:inline">Tareas</span></TabsTrigger>
                <TabsTrigger value="decisions" className="text-xs sm:text-sm gap-1"><Lightbulb className="h-3.5 w-3.5" /><span className="hidden sm:inline">Decisiones</span></TabsTrigger>
                <TabsTrigger value="risks" className="text-xs sm:text-sm gap-1"><AlertTriangle className="h-3.5 w-3.5" /><span className="hidden sm:inline">Riesgos</span></TabsTrigger>
                <TabsTrigger value="events" className="text-xs sm:text-sm gap-1"><Calendar className="h-3.5 w-3.5" /><span className="hidden sm:inline">Eventos</span></TabsTrigger>
              </TabsList>
            </div>

            {/* Summary */}
            <TabsContent value="summary">
              <div className="space-y-4">
                <div className="glass-card rounded-xl p-6">
                  <h3 className="font-semibold text-foreground text-lg mb-3">Resumen ejecutivo</h3>
                  <p className="text-muted-foreground leading-relaxed whitespace-pre-line">{analysis.summary}</p>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="glass-card rounded-xl p-4 text-center">
                    <p className="text-2xl font-bold text-success">{analysis.tasks.length}</p>
                    <p className="text-xs text-muted-foreground mt-1">Tareas</p>
                  </div>
                  <div className="glass-card rounded-xl p-4 text-center">
                    <p className="text-2xl font-bold text-info">{analysis.decisions.length}</p>
                    <p className="text-xs text-muted-foreground mt-1">Decisiones</p>
                  </div>
                  <div className="glass-card rounded-xl p-4 text-center">
                    <p className="text-2xl font-bold text-warning">{analysis.risks.length}</p>
                    <p className="text-xs text-muted-foreground mt-1">Riesgos</p>
                  </div>
                  <div className="glass-card rounded-xl p-4 text-center">
                    <p className="text-2xl">{sentiment.emoji}</p>
                    <p className={cn("text-xs font-medium mt-1", sentiment.color)}>{sentiment.label}</p>
                  </div>
                </div>

                {analysis.key_data.length > 0 && (
                  <div className="glass-card rounded-xl p-5">
                    <h4 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                      <Database className="h-4 w-4 text-primary" />Datos clave
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {analysis.key_data.map((d, i) => (
                        <div key={i} className="p-3 rounded-lg bg-secondary/50">
                          <p className="text-xs text-muted-foreground">{d.label}</p>
                          <p className="text-sm font-bold text-foreground mt-0.5">{d.value}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </TabsContent>

            {/* Transcript */}
            <TabsContent value="transcript">
              <div className="glass-card rounded-xl p-6">
                <h3 className="font-semibold text-foreground text-lg mb-4">Transcripción completa</h3>
                {meeting.transcript ? (
                  <p className="text-sm text-foreground leading-relaxed whitespace-pre-line">{meeting.transcript}</p>
                ) : (
                  <p className="text-muted-foreground text-center py-8">Transcripción no disponible</p>
                )}
              </div>
            </TabsContent>

            {/* Tasks */}
            <TabsContent value="tasks">
              <div className="glass-card rounded-xl p-6 space-y-3">
                <h3 className="font-semibold text-foreground text-lg">Tareas extraídas ({analysis.tasks.length})</h3>
                {analysis.tasks.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">No se identificaron tareas</p>
                ) : (
                  analysis.tasks.map((task, i) => (
                    <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-background/50 border border-border/50 hover:border-primary/20 transition-colors">
                      <input type="checkbox" defaultChecked={task.done} className="mt-1 rounded border-input accent-primary" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground">{task.text}</p>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          {task.assignee && <span className="text-xs text-muted-foreground">{task.assignee}</span>}
                          {task.due_date && <span className="text-xs text-muted-foreground">· Fecha: {task.due_date}</span>}
                        </div>
                      </div>
                      <Badge variant="outline" className={priorityColors[task.priority]}>{task.priority}</Badge>
                    </div>
                  ))
                )}
              </div>
            </TabsContent>

            {/* Decisions */}
            <TabsContent value="decisions">
              <div className="glass-card rounded-xl p-6 space-y-3">
                <h3 className="font-semibold text-foreground text-lg">Decisiones clave ({analysis.decisions.length})</h3>
                {analysis.decisions.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">No se identificaron decisiones</p>
                ) : (
                  analysis.decisions.map((d, i) => (
                    <div key={i} className="p-4 rounded-lg bg-info/5 border border-info/20">
                      <p className="text-sm font-medium text-foreground">{d.text}</p>
                      {d.participants && d.participants.length > 0 && (
                        <p className="text-xs text-muted-foreground mt-2">Acordado por: {d.participants.join(", ")}</p>
                      )}
                    </div>
                  ))
                )}
              </div>
            </TabsContent>

            {/* Risks */}
            <TabsContent value="risks">
              <div className="glass-card rounded-xl p-6 space-y-3">
                <h3 className="font-semibold text-foreground text-lg">Riesgos detectados ({analysis.risks.length})</h3>
                {analysis.risks.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">No se detectaron riesgos</p>
                ) : (
                  analysis.risks.map((r, i) => (
                    <div key={i} className="p-4 rounded-lg bg-warning/5 border border-warning/20 flex items-start gap-3">
                      <AlertTriangle className="h-5 w-5 text-warning flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-foreground">{r.text}</p>
                        <Badge variant="outline" className={cn("mt-2", priorityColors[r.severity])}>Severidad: {r.severity}</Badge>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </TabsContent>

            {/* Calendar events */}
            <TabsContent value="events">
              <div className="glass-card rounded-xl p-6 space-y-3">
                <h3 className="font-semibold text-foreground text-lg flex items-center gap-2">
                  <Calendar className="h-5 w-5 text-primary" />
                  Eventos creados automáticamente ({analysis.calendar_events.length})
                </h3>
                {analysis.calendar_events.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">No se detectaron fechas o eventos</p>
                ) : (
                  analysis.calendar_events.map((e, i) => (
                    <div key={i} className="flex items-center justify-between p-3 rounded-lg border border-primary/20 bg-primary/5">
                      <div>
                        <p className="text-sm font-medium text-foreground">✅ {e.title}</p>
                        <p className="text-xs text-muted-foreground">{e.date}{e.time ? ` · ${e.time}` : ""}{e.duration_minutes ? ` · ${e.duration_minutes}min` : ""}</p>
                        {e.description && <p className="text-xs text-muted-foreground mt-1">{e.description}</p>}
                      </div>
                      <Badge variant="outline" className="text-xs bg-success/10 text-success border-success/20">Añadido</Badge>
                    </div>
                  ))
                )}
              </div>
            </TabsContent>
          </Tabs>
        )}
      </div>
    </AppLayout>
  );
}
