import { useState, useRef } from "react";
import { Mic, Monitor, Upload, Square, Save, Trash2, AlertCircle, Loader2, FileAudio, CheckCircle, HardDrive } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useRecorder } from "@/hooks/useRecorder";
import { useGoogleDrive } from "@/hooks/useGoogleDrive";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";

export default function NewMeeting() {
  const recorder = useRecorder();
  const { user } = useAuth();
  const navigate = useNavigate();
  const drive = useGoogleDrive();
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [loadingDrive, setLoadingDrive] = useState(false);
  const [driveFiles, setDriveFiles] = useState<any[]>([]);
  const [showDrivePicker, setShowDrivePicker] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImportFromDrive = async () => {
    setLoadingDrive(true);
    setShowDrivePicker(true);
    try {
      const files = await drive.listFiles(undefined, true);
      setDriveFiles(files);
    } catch {
      toast.error("Error al listar archivos de Drive");
    } finally {
      setLoadingDrive(false);
    }
  };

  const handleSelectDriveFile = async (file: any) => {
    setLoadingDrive(true);
    try {
      const downloaded = await drive.downloadFile(file.id);
      const binaryStr = atob(downloaded.data);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
      const blob = new File([bytes], downloaded.name, { type: downloaded.mimeType });
      setUploadedFile(blob);
      setUploadedUrl(URL.createObjectURL(blob));
      setShowDrivePicker(false);
      setDriveFiles([]);
      recorder.clearRecording();
      toast.success("Archivo importado desde Drive");
    } catch {
      toast.error("Error al descargar archivo");
    } finally {
      setLoadingDrive(false);
    }
  };

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
  };

  const handleFileSelect = (file: File) => {
    if (!file.type.startsWith("audio/") && !file.type.startsWith("video/")) {
      toast.error("Formato no soportado", { description: "Solo se aceptan archivos de audio o vídeo." });
      return;
    }
    if (file.size > 500 * 1024 * 1024) {
      toast.error("Archivo demasiado grande", { description: "Máximo 500MB." });
      return;
    }
    setUploadedFile(file);
    setUploadedUrl(URL.createObjectURL(file));
    recorder.clearRecording();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileSelect(file);
  };

  const clearUploaded = () => {
    if (uploadedUrl) URL.revokeObjectURL(uploadedUrl);
    setUploadedFile(null);
    setUploadedUrl(null);
  };

  const handleSave = async () => {
    if (!user) {
      toast.error("Debes iniciar sesión");
      return;
    }

    const blob = recorder.recordedBlob || uploadedFile;
    if (!blob) {
      toast.error("No hay grabación para guardar");
      return;
    }

    setSaving(true);
    try {
      const ext = blob.type.includes("video") ? "webm" : blob.type.includes("mp3") ? "mp3" : blob.type.includes("wav") ? "wav" : "webm";
      const fileName = `${user.id}/${Date.now()}.${ext}`;

      // Upload to storage
      const { error: uploadError } = await supabase.storage
        .from("recordings")
        .upload(fileName, blob, { contentType: blob.type });

      if (uploadError) throw uploadError;

      // Create meeting record
      const recordingType = uploadedFile ? "upload" : (recorder.mode || "mic");
      const meetingTitle = title.trim() || (uploadedFile ? uploadedFile.name.replace(/\.[^/.]+$/, "") : "Grabación " + new Date().toLocaleString("es"));

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

      toast.success("Reunión guardada", { description: "Analizando con IA..." });

      // Trigger AI analysis in background
      supabase.functions.invoke("analyze-meeting", {
        body: { meeting_id: meetingData.id },
      }).then(({ error: aiError }) => {
        if (aiError) {
          console.error("AI analysis error:", aiError);
          toast.error("Error en el análisis IA");
        } else {
          toast.success("Análisis completado", { description: "Resumen, tareas y eventos creados automáticamente." });
        }
      });

      recorder.clearRecording();
      clearUploaded();
      setTitle("");
      navigate(`/meetings`);
    } catch (err: any) {
      console.error("Save error:", err);
      toast.error("Error al guardar", { description: err.message });
    } finally {
      setSaving(false);
    }
  };

  const hasRecording = recorder.recordedUrl && !recorder.isRecording;
  const hasUpload = uploadedUrl && uploadedFile;
  const hasMedia = hasRecording || hasUpload;

  return (
    <AppLayout title="Nueva reunión">
      <div className="max-w-xl mx-auto animate-fade-in space-y-6">
        <div className="glass-card rounded-xl p-6">
          <Input
            placeholder="Nombre de la reunión (opcional)"
            className="bg-background mb-6"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />

          {recorder.error && (
            <div className="mb-4 flex items-center gap-2 text-sm text-destructive bg-destructive/10 px-4 py-2 rounded-lg">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              {recorder.error}
            </div>
          )}

          {hasMedia ? (
            <div className="animate-slide-up">
              {/* Preview */}
              {hasRecording && recorder.mode === "screen" && (
                <video src={recorder.recordedUrl!} controls className="w-full rounded-xl border border-border" />
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
                    <CheckCircle className="h-4 w-4 text-success" />
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
                  Guardar y analizar
                </Button>
                <Button
                  variant="outline"
                  onClick={() => { recorder.clearRecording(); clearUploaded(); }}
                  className="gap-2"
                  disabled={saving}
                >
                  <Trash2 className="h-4 w-4" />
                  Descartar
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {recorder.isRecording ? (
                <div className="flex flex-col items-center py-6">
                  <button onClick={recorder.stopRecording} className="w-20 h-20 rounded-full bg-destructive/10 flex items-center justify-center border-4 border-destructive/30 animate-pulse">
                    <Square className="h-8 w-8 text-destructive" />
                  </button>
                  <div className="flex items-center gap-2 mt-4">
                    <span className="w-2.5 h-2.5 rounded-full bg-destructive animate-pulse-dot" />
                    <span className="font-mono font-semibold text-foreground">{formatTime(recorder.elapsed)}</span>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    {recorder.mode === "screen" ? "Grabando pantalla..." : "Grabando audio..."} Pulsa para detener
                  </p>
                </div>
              ) : (
                <>
                  {/* Screen capture */}
                  <button onClick={recorder.startScreenRecording} className="w-full flex items-center gap-4 p-4 rounded-xl border border-border hover:border-primary/30 hover:bg-secondary/50 transition-all group">
                    <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                      <Monitor className="h-6 w-6 text-primary" />
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">Grabar pantalla</p>
                      <p className="text-xs text-muted-foreground">Captura pantalla + audio del sistema y micrófono</p>
                    </div>
                  </button>

                  {/* Mic only */}
                  <button onClick={recorder.startMicRecording} className="w-full flex items-center gap-4 p-4 rounded-xl border border-border hover:border-primary/30 hover:bg-secondary/50 transition-all group">
                    <div className="w-12 h-12 rounded-xl bg-destructive/10 flex items-center justify-center">
                      <Mic className="h-6 w-6 text-destructive" />
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">Grabar con micrófono</p>
                      <p className="text-xs text-muted-foreground">Solo audio desde el micrófono del dispositivo</p>
                    </div>
                  </button>

                  {/* Divider */}
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-px bg-border" />
                    <span className="text-xs text-muted-foreground">o</span>
                    <div className="flex-1 h-px bg-border" />
                  </div>

                  {/* Import */}
                  <label
                    className={cn(
                      "block border-2 border-dashed rounded-xl p-6 text-center transition-colors cursor-pointer group",
                      dragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
                    )}
                    onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                    onDragLeave={() => setDragging(false)}
                    onDrop={handleDrop}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      className="hidden"
                      accept="audio/*,video/*,.mp3,.wav,.m4a,.ogg,.webm,.mp4,.mov"
                      onChange={handleFileInputChange}
                    />
                    <Upload className="h-8 w-8 text-muted-foreground mx-auto mb-2 group-hover:text-primary transition-colors" />
                    <p className="text-sm font-medium text-foreground">
                      {dragging ? "Suelta el archivo aquí" : "Arrastra un archivo aquí"}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">MP3, WAV, M4A, MP4, WebM — máx 500MB</p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="mt-3"
                      onClick={(e) => { e.preventDefault(); fileInputRef.current?.click(); }}
                    >
                      <FileAudio className="h-4 w-4 mr-1" />
                      Seleccionar archivo
                    </Button>
                  </label>

                  {/* Import from Google Drive */}
                  {drive.connected && (
                    <>
                      <div className="flex items-center gap-3">
                        <div className="flex-1 h-px bg-border" />
                        <span className="text-xs text-muted-foreground">o desde la nube</span>
                        <div className="flex-1 h-px bg-border" />
                      </div>

                      {showDrivePicker ? (
                        <div className="border border-border rounded-xl p-4 space-y-2 max-h-60 overflow-y-auto">
                          {loadingDrive ? (
                            <div className="flex items-center justify-center py-6">
                              <Loader2 className="h-5 w-5 animate-spin text-primary" />
                              <span className="ml-2 text-sm text-muted-foreground">Cargando archivos...</span>
                            </div>
                          ) : driveFiles.length === 0 ? (
                            <p className="text-sm text-muted-foreground text-center py-4">No se encontraron archivos de audio/vídeo</p>
                          ) : (
                            driveFiles.map((f) => (
                              <button
                                key={f.id}
                                onClick={() => handleSelectDriveFile(f)}
                                disabled={loadingDrive}
                                className="w-full flex items-center gap-3 p-3 rounded-lg border border-border hover:border-primary/30 hover:bg-secondary/50 transition-all text-left"
                              >
                                <FileAudio className="h-4 w-4 text-primary flex-shrink-0" />
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium text-foreground truncate">{f.name}</p>
                                  <p className="text-xs text-muted-foreground">{f.size ? `${(parseInt(f.size) / (1024 * 1024)).toFixed(1)} MB` : ""}</p>
                                </div>
                              </button>
                            ))
                          )}
                          <Button variant="ghost" size="sm" className="w-full" onClick={() => { setShowDrivePicker(false); setDriveFiles([]); }}>
                            Cancelar
                          </Button>
                        </div>
                      ) : (
                        <button
                          onClick={handleImportFromDrive}
                          className="w-full flex items-center gap-4 p-4 rounded-xl border border-border hover:border-primary/30 hover:bg-secondary/50 transition-all group"
                        >
                          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                            <HardDrive className="h-6 w-6 text-primary" />
                          </div>
                          <div className="text-left">
                            <p className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">Importar desde Google Drive</p>
                            <p className="text-xs text-muted-foreground">Selecciona un archivo de audio o vídeo de tu Drive</p>
                          </div>
                        </button>
                      )}
                    </>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
