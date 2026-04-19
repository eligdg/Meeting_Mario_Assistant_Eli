import { useState, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Mic,
  Monitor,
  Square,
  Upload,
  ChevronRight,
  Trash2,
  Save,
  AlertCircle,
  FileAudio,
  Loader2,
  Plus,
} from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { WeatherWidget } from "@/components/WeatherWidget";
import { MiniCalendar } from "@/components/MiniCalendar";
import { Button } from "@/components/ui/button";
import { useRecorder } from "@/hooks/useRecorder";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface DbMeeting {
  id: string;
  title: string;
  status: string;
  created_at: string;
  duration_seconds: number | null;
  recording_type: string;
}

interface CalendarEvent {
  id: string;
  title: string;
  start_time: string;
  end_time: string;
  sync_direction: string;
}

export default function Index() {
  const recorder = useRecorder();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [recentMeetings, setRecentMeetings] = useState<DbMeeting[]>([]);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const [loadingMeetings, setLoadingMeetings] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!user) return;
    // Fetch recent meetings
    supabase
      .from("meetings")
      .select("id, title, status, created_at, duration_seconds, recording_type")
      .order("created_at", { ascending: false })
      .limit(6)
      .then(({ data }) => {
        setRecentMeetings((data as DbMeeting[]) || []);
        setLoadingMeetings(false);
      });

    // Fetch calendar events
    supabase
      .from("calendar_events")
      .select("id, title, start_time, end_time, sync_direction")
      .gte("start_time", new Date().toISOString())
      .order("start_time", { ascending: true })
      .limit(50)
      .then(({ data }) => {
        setCalendarEvents((data as CalendarEvent[]) || []);
      });
  }, [user]);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
  };

  // Calendar event dots
  const calendarDots = calendarEvents.map((e) => ({
    date: e.start_time.split("T")[0],
    title: e.title,
    type: e.sync_direction === "from_google" ? "google" : "ai",
  }));

  // Meetings as dots too
  const meetingDots = recentMeetings.map((m) => ({
    date: m.created_at.split("T")[0],
    title: m.title,
    type: m.status,
  }));

  const allDots = [...calendarDots, ...meetingDots];

  const selectedDateStr = format(selectedDate, "yyyy-MM-dd");
  const dayEvents = calendarEvents.filter((e) => e.start_time.startsWith(selectedDateStr));
  const dayMeetings = recentMeetings.filter((m) => m.created_at.startsWith(selectedDateStr));

  const handleFileSelect = (file: File) => {
    if (!file.type.startsWith("audio/") && !file.type.startsWith("video/")) {
      toast.error("Solo se aceptan archivos de audio o vídeo");
      return;
    }
    setUploadedFile(file);
    setUploadedUrl(URL.createObjectURL(file));
    recorder.clearRecording();
  };

  const clearUploaded = () => {
    if (uploadedUrl) URL.revokeObjectURL(uploadedUrl);
    setUploadedFile(null);
    setUploadedUrl(null);
  };

  const handleSave = async () => {
    if (!user) return;
    const blob = recorder.recordedBlob || uploadedFile;
    if (!blob) return;

    setSaving(true);
    try {
      const ext = blob.type.includes("video") ? "webm" : blob.type.includes("mp3") ? "mp3" : "webm";
      const fileName = `${user.id}/${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("recordings")
        .upload(fileName, blob, { contentType: blob.type });
      if (uploadError) throw uploadError;

      const recordingType = uploadedFile ? "upload" : (recorder.mode || "mic");
      const meetingTitle = uploadedFile
        ? uploadedFile.name.replace(/\.[^/.]+$/, "")
        : "Grabación " + new Date().toLocaleString("es");

      const { data: meetingData, error: dbError } = await supabase.from("meetings").insert({
        user_id: user.id,
        title: meetingTitle,
        recording_type: recordingType,
        duration_seconds: recorder.elapsed || null,
        file_path: fileName,
        file_size: blob.size,
        mime_type: blob.type,
        status: "pending",
      }).select("id").single();

      if (dbError) throw dbError;

      toast.success("Grabación guardada", { description: "Analizando con IA..." });

      supabase.functions.invoke("analyze-meeting", {
        body: { meeting_id: meetingData.id },
      }).then(({ error }) => {
        if (error) toast.error("Error en el análisis IA");
        else toast.success("Análisis iniciado", { description: "Se está procesando en segundo plano." });
      });

      recorder.clearRecording();
      clearUploaded();
      navigate("/meetings");
    } catch (err: any) {
      toast.error("Error al guardar", { description: err.message });
    } finally {
      setSaving(false);
    }
  };

  const hasRecording = recorder.recordedUrl && !recorder.isRecording;
  const hasUpload = uploadedUrl && uploadedFile;
  const hasMedia = hasRecording || hasUpload;

  return (
    <AppLayout title="Meeting Mario Assistant">
      <div className="animate-fade-in">
        {/* Top row: Calendar + Weather */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          <div className="space-y-3">
            <MiniCalendar events={allDots} selectedDate={selectedDate} onDateSelect={setSelectedDate} />
            <div className="glass-card rounded-xl p-4">
              <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">
                {format(selectedDate, "EEEE, d 'de' MMMM", { locale: es })}
              </h3>
              {dayEvents.length === 0 && dayMeetings.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">Sin eventos</p>
              ) : (
                <div className="space-y-1.5">
                  {dayEvents.map((e) => (
                    <div key={e.id} className="flex items-center gap-2 p-2 rounded-lg bg-secondary/30">
                      <span className={cn("w-2 h-2 rounded-full flex-shrink-0", e.sync_direction === "from_google" ? "bg-info" : "bg-primary")} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{e.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(e.start_time), "HH:mm")} - {format(new Date(e.end_time), "HH:mm")}
                        </p>
                      </div>
                    </div>
                  ))}
                  {dayMeetings.map((m) => (
                    <Link key={m.id} to={`/meeting/${m.id}`} className="flex items-center gap-2 p-2 rounded-lg hover:bg-secondary/50 transition-colors group">
                      <span className={cn("w-2 h-2 rounded-full flex-shrink-0", m.status === "completed" ? "bg-success" : "bg-warning")} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate group-hover:text-primary transition-colors">{m.title}</p>
                        <p className="text-xs text-muted-foreground">{format(new Date(m.created_at), "HH:mm")}</p>
                      </div>
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50" />
                    </Link>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-4 mt-3 pt-2 border-t border-border/50">
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><span className="w-2 h-2 rounded-full bg-success" />Reunión</span>
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><span className="w-2 h-2 rounded-full bg-primary" />Evento IA</span>
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><span className="w-2 h-2 rounded-full bg-info" />Google Cal</span>
              </div>
            </div>
          </div>
          <WeatherWidget />
        </div>

        <div className="space-y-6">
          <div className="glass-card rounded-2xl p-8 flex flex-col items-center">
            {recorder.error && (
              <div className="mb-4 flex items-center gap-2 text-sm text-destructive bg-destructive/10 px-4 py-2 rounded-lg w-full max-w-md animate-fade-in">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                {recorder.error}
              </div>
            )}

            {hasMedia ? (
              <div className="w-full max-w-lg animate-slide-up">
                {hasRecording && recorder.mode === "screen" && (
                  <video src={recorder.recordedUrl!} controls className="w-full rounded-xl border border-border shadow-sm" />
                )}
                {hasRecording && recorder.mode === "mic" && (
                  <audio src={recorder.recordedUrl!} controls className="w-full" />
                )}
                {hasUpload && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-3 p-3 rounded-lg border border-border bg-secondary/30">
                      <FileAudio className="h-5 w-5 text-primary flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{uploadedFile!.name}</p>
                        <p className="text-xs text-muted-foreground">{(uploadedFile!.size / (1024 * 1024)).toFixed(1)} MB</p>
                      </div>
                    </div>
                    {uploadedFile!.type.startsWith("audio/") ? (
                      <audio src={uploadedUrl!} controls className="w-full" />
                    ) : (
                      <video src={uploadedUrl!} controls className="w-full rounded-xl border border-border" />
                    )}
                  </div>
                )}
                <div className="flex items-center justify-center gap-3 mt-4">
                  <Button onClick={handleSave} className="gap-2" disabled={saving}>
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    Guardar y analizar con IA
                  </Button>
                  <Button variant="outline" onClick={() => { recorder.clearRecording(); clearUploaded(); }} className="gap-2" disabled={saving}>
                    <Trash2 className="h-4 w-4" />
                    Descartar
                  </Button>
                </div>
              </div>
            ) : (
              <>
                {/* Big record button */}
                <button
                  onClick={() => {
                    if (recorder.isRecording) {
                      recorder.stopRecording();
                    } else {
                      recorder.startScreenRecording();
                    }
                  }}
                  className={cn(
                    "relative w-32 h-32 rounded-full flex items-center justify-center transition-all duration-300 group",
                    recorder.isRecording ? "bg-destructive/10" : "bg-secondary hover:shadow-xl"
                  )}
                >
                  <span className={cn(
                    "absolute inset-0 rounded-full border-4 transition-colors",
                    recorder.isRecording ? "border-destructive/30 animate-pulse" : "border-border group-hover:border-primary/30"
                  )} />
                  <span className={cn(
                    "flex items-center justify-center transition-all duration-300",
                    recorder.isRecording
                      ? "w-10 h-10 bg-destructive rounded-lg"
                      : "w-14 h-14 bg-destructive rounded-full group-hover:scale-110"
                  )}>
                    {recorder.isRecording && <Square className="h-5 w-5 text-destructive-foreground" />}
                  </span>
                </button>

                {recorder.isRecording ? (
                  <div className="flex items-center gap-2 mt-5 animate-fade-in">
                    <span className="w-2.5 h-2.5 rounded-full bg-destructive animate-pulse-dot" />
                    <span className="text-base font-mono text-foreground font-semibold">{formatTime(recorder.elapsed)}</span>
                    <span className="text-xs text-muted-foreground ml-2">
                      {recorder.mode === "screen" ? "Grabando pantalla" : "Grabando audio"}
                    </span>
                  </div>
                ) : (
                  <div className="mt-5 text-center">
                    <p className="text-base font-medium text-foreground">Pulsa para iniciar la grabación</p>
                    <p className="text-xs text-muted-foreground mt-1">Captura la pantalla y el audio del sistema</p>
                  </div>
                )}

                {!recorder.isRecording && (
                  <>
                    <div className="flex items-center gap-3 w-full max-w-sm mt-6">
                      <div className="flex-1 h-px bg-border" />
                      <span className="text-xs text-muted-foreground">o graba directamente</span>
                      <div className="flex-1 h-px bg-border" />
                    </div>

                    <button
                      onClick={recorder.startMicRecording}
                      className="flex items-center gap-2 mt-4 px-4 py-2.5 rounded-xl hover:bg-secondary transition-colors group"
                    >
                      <Mic className="h-4 w-4 text-destructive" />
                      <span className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">
                        Grabar con micrófono
                      </span>
                    </button>

                    <label className="mt-4 w-full max-w-md border-2 border-dashed border-border rounded-xl p-4 text-center hover:border-primary/40 transition-colors cursor-pointer group">
                      <input
                        ref={fileInputRef}
                        type="file"
                        className="hidden"
                        accept="audio/*,video/*,.mp3,.wav,.m4a,.ogg,.webm,.mp4,.mov"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleFileSelect(file);
                        }}
                      />
                      <div className="flex items-center justify-center gap-3">
                        <Upload className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
                        <span className="text-sm text-muted-foreground group-hover:text-foreground transition-colors">
                          Importar archivo de audio o vídeo
                        </span>
                      </div>
                    </label>
                  </>
                )}
              </>
            )}
          </div>

          {/* Recent meetings from DB */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-semibold text-foreground">Reuniones recientes</h2>
              <Link to="/meetings" className="text-xs text-primary hover:underline flex items-center gap-1">
                Ver todas <ChevronRight className="h-3 w-3" />
              </Link>
            </div>
            {loadingMeetings ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : recentMeetings.length === 0 ? (
              <div className="glass-card rounded-xl p-8 text-center">
                <FileAudio className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">No tienes reuniones aún</p>
                <p className="text-xs text-muted-foreground mt-1">Graba o sube un audio para empezar</p>
                <Link to="/new-meeting">
                  <Button size="sm" className="mt-4 gap-2">
                    <Plus className="h-4 w-4" />
                    Nueva reunión
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {recentMeetings.map((m) => (
                  <Link key={m.id} to={`/meeting/${m.id}`} className="glass-card glass-float rounded-xl p-4 hover:border-primary/20 transition-colors border border-transparent">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <FileAudio className="h-5 w-5 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-foreground truncate">{m.title}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {format(new Date(m.created_at), "dd/MM/yyyy HH:mm")}
                          {m.duration_seconds ? ` · ${Math.floor(m.duration_seconds / 60)}m` : ""}
                        </p>
                        <span className={cn(
                          "text-[10px] px-2 py-0.5 rounded-full font-medium mt-1 inline-block",
                          m.status === "completed" ? "bg-success/10 text-success" :
                          m.status === "processing" ? "bg-info/10 text-info" :
                          m.status === "error" ? "bg-destructive/10 text-destructive" :
                          "bg-warning/10 text-warning"
                        )}>
                          {m.status === "completed" ? "Analizada" :
                           m.status === "processing" ? "Procesando..." :
                           m.status === "error" ? "Error" : "Pendiente IA"}
                        </span>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
