import { useState, useRef } from "react";
import { Mic, Square, Upload, FileAudio, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export function RecordingPanel() {
  const { toast } = useToast();
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [recordingMode, setRecordingMode] = useState<"screen" | "mic" | null>(null);
  const [uploading, setUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
  };

  const startRecording = async (mode: "screen" | "mic") => {
    try {
      toast({ title: "Iniciando grabación..." });
      chunksRef.current = [];

      let stream: MediaStream;
      if (mode === "screen") {
        stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
        streamRef.current = stream;
        const recorder = new MediaRecorder(stream, { mimeType: "video/webm;codecs=vp9" });
        mediaRecorderRef.current = recorder;

        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunksRef.current.push(e.data);
        };
        recorder.onstop = handleRecordingComplete;
        recorder.start(1000);
        setRecordingMode("screen");
      } else {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        streamRef.current = stream;
        const recorder = new MediaRecorder(stream, { mimeType: "audio/webm;codecs=opus" });
        mediaRecorderRef.current = recorder;

        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunksRef.current.push(e.data);
        };
        recorder.onstop = handleRecordingComplete;
        recorder.start(1000);
        setRecordingMode("mic");
      }

      setIsRecording(true);
      setRecordingTime(0);
      timerRef.current = setInterval(() => setRecordingTime(t => t + 1), 1000);

      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) videoTrack.onended = () => stopRecording();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const stopRecording = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    streamRef.current?.getTracks().forEach(t => t.stop());
    setIsRecording(false);
    setRecordingMode(null);
  };

  const handleRecordingComplete = async () => {
    const blob = new Blob(chunksRef.current, { type: recordingMode === "screen" ? "video/webm" : "audio/webm" });
    await uploadFile(blob, recordingMode === "screen" ? "video/webm" : "audio/webm");
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const validTypes = ["audio/", "video/"];
    const isValid = validTypes.some(t => file.type.startsWith(t));
    
    if (!isValid) {
      toast({ title: "Archivo inválido", description: "Solo audio/vídeo (MP3, WAV, MP4, WebM)", variant: "destructive" });
      return;
    }
    
    setSelectedFile(file);
  };

  const uploadWithRetry = async (filePath: string, file: Blob, mimeType: string, maxRetries = 3) => {
    let lastErr: any;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const { error } = await supabase.storage
          .from("recordings")
          .upload(filePath, file, { contentType: mimeType, upsert: attempt > 1 });
        if (!error) return;
        lastErr = error;
      } catch (e) {
        lastErr = e;
      }
      if (attempt < maxRetries) {
        toast({ title: `Reintentando subida (${attempt}/${maxRetries})...` });
        await new Promise(r => setTimeout(r, 2000 * attempt));
      }
    }
    throw lastErr || new Error("Fallo al subir tras varios intentos");
  };

  const uploadFile = async (file: Blob, mimeType: string) => {
    setUploading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("No autenticado");

      const sizeMB = file.size / 1024 / 1024;
      if (sizeMB > 200) {
        throw new Error(`Archivo demasiado grande (${sizeMB.toFixed(1)} MB). Máximo 200 MB.`);
      }

      const ext = mimeType.includes("video") ? "webm" : "webm";
      const fileName = `recording-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const filePath = `${user.id}/${fileName}`;

      toast({ title: `Subiendo ${sizeMB.toFixed(1)} MB...`, description: "Puede tardar según tu conexión" });
      await uploadWithRetry(filePath, file, mimeType);

      const duration = recordingMode ? recordingTime : Math.round((file.size / 1024 / 1024) * 2);
      const meetingTitle = title || `Grabación ${new Date().toLocaleString("es-ES")}`;

      const { data: meeting, error: dbError } = await supabase
        .from("meetings")
        .insert({
          user_id: user.id,
          title: meetingTitle,
          recording_type: recordingMode === "screen" ? "screen" : "mic",
          file_path: filePath,
          file_size: file.size,
          mime_type: mimeType,
          duration_seconds: duration,
          status: "pending",
        })
        .select()
        .single();

      if (dbError) throw dbError;

      toast({ title: "Archivo subido", description: "Iniciando análisis con IA..." });

      // Trigger AI analysis automatically
      supabase.functions.invoke("analyze-meeting", {
        body: { meeting_id: meeting.id },
      }).catch((e) => console.error("Analyze trigger failed:", e));

      setSelectedFile(null);
      setTitle("");
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      toast({ title: "Selecciona un archivo", variant: "destructive" });
      return;
    }
    await uploadFile(selectedFile, selectedFile.type);
  };

  return (
    <div className="glass-card rounded-xl p-6">
      <h2 className="text-lg font-semibold mb-4">Grabar o importar</h2>

      <div className="flex flex-col items-center gap-4 py-6">
        <div className="flex gap-3">
          <button
            onClick={() => isRecording ? stopRecording() : startRecording("mic")}
            className={cn(
              "w-16 h-16 rounded-full flex items-center justify-center transition-all",
              isRecording && recordingMode === "mic"
                ? "bg-destructive"
                : "bg-primary hover:scale-105"
            )}
          >
            {isRecording && recordingMode === "mic" ? <Square className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
          </button>
        </div>

        {isRecording && (
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-destructive animate-pulse" />
            <span className="text-sm font-mono">{formatTime(recordingTime)}</span>
          </div>
        )}

        <p className="text-sm text-muted-foreground">
          {isRecording ? "Grabando... Pulsa para detener" : "Pulsa el micrófono para grabar"}
        </p>
      </div>

      <div className="flex items-center gap-3 my-4">
        <div className="flex-1 h-px bg-border" />
        <span className="text-xs text-muted-foreground">o</span>
        <div className="flex-1 h-px bg-border" />
      </div>

      <div 
        className="border-2 border-dashed border-border rounded-xl p-6 text-center hover:border-primary/50 transition-colors"
        onClick={() => fileInputRef.current?.click()}
      >
        <Upload className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
        {selectedFile ? (
          <div className="flex items-center justify-center gap-2">
            <FileAudio className="h-4 w-4" />
            <span className="text-sm">{selectedFile.name}</span>
            <button onClick={(e) => { e.stopPropagation(); setSelectedFile(null); }} className="p-1">
              <X className="h-3 w-3" />
            </button>
          </div>
        ) : (
          <>
            <p className="text-sm font-medium">Arrastra un archivo</p>
            <p className="text-xs text-muted-foreground">MP3, WAV, MP4, WebM</p>
          </>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="audio/*,video/*"
          onChange={handleFileSelect}
          className="hidden"
        />
      </div>

      <div className="mt-4 space-y-3">
        <Input 
          placeholder="Nombre (opcional)" 
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <Button 
          className="w-full" 
          onClick={handleUpload}
          disabled={!selectedFile || uploading}
        >
          {uploading ? "Subiendo..." : "Subir archivo"}
        </Button>
      </div>
    </div>
  );
}