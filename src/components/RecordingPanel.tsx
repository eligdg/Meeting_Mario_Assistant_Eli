import { useState } from "react";
import { Mic, Square, Upload, FileAudio } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export function RecordingPanel() {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
  };

  return (
    <div className="glass-card rounded-xl p-6 animate-slide-up">
      <h2 className="text-lg font-semibold text-foreground mb-4">Grabar o importar</h2>

      {/* Recording */}
      <div className="flex flex-col items-center gap-4 py-6">
        <button
          onClick={() => setIsRecording(!isRecording)}
          className={cn(
            "w-20 h-20 rounded-full flex items-center justify-center transition-all duration-300",
            isRecording
              ? "bg-destructive text-destructive-foreground shadow-lg"
              : "bg-primary text-primary-foreground hover:shadow-lg hover:scale-105"
          )}
        >
          {isRecording ? <Square className="h-8 w-8" /> : <Mic className="h-8 w-8" />}
        </button>

        {isRecording && (
          <div className="flex items-center gap-2 animate-fade-in">
            <span className="w-2 h-2 rounded-full bg-destructive animate-pulse-dot" />
            <span className="text-sm font-mono text-foreground">{formatTime(recordingTime)}</span>
          </div>
        )}

        <p className="text-sm text-muted-foreground">
          {isRecording ? "Grabando... Pulsa para detener" : "Pulsa para comenzar a grabar"}
        </p>
      </div>

      {/* Divider */}
      <div className="flex items-center gap-3 my-4">
        <div className="flex-1 h-px bg-border" />
        <span className="text-xs text-muted-foreground uppercase tracking-wider">o</span>
        <div className="flex-1 h-px bg-border" />
      </div>

      {/* Import */}
      <div className="border-2 border-dashed border-border rounded-xl p-8 text-center hover:border-primary/50 transition-colors cursor-pointer group">
        <Upload className="h-8 w-8 text-muted-foreground mx-auto mb-2 group-hover:text-primary transition-colors" />
        <p className="text-sm font-medium text-foreground">Arrastra un archivo aquí</p>
        <p className="text-xs text-muted-foreground mt-1">MP3, WAV, MP4, WebM — máx 500MB</p>
        <Button variant="outline" size="sm" className="mt-3">
          <FileAudio className="h-4 w-4 mr-1" />
          Seleccionar archivo
        </Button>
      </div>

      {/* Meeting title */}
      <div className="mt-4">
        <Input placeholder="Nombre de la reunión (opcional)" className="bg-background" />
      </div>
    </div>
  );
}
