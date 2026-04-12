import { useState, useRef, useCallback, useEffect } from "react";

export type RecordingMode = "screen" | "mic" | null;

interface UseRecorderReturn {
  isRecording: boolean;
  mode: RecordingMode;
  elapsed: number;
  startScreenRecording: () => Promise<void>;
  startMicRecording: () => Promise<void>;
  stopRecording: () => void;
  recordedBlob: Blob | null;
  recordedUrl: string | null;
  error: string | null;
  clearRecording: () => void;
}

export function useRecorder(): UseRecorderReturn {
  const [isRecording, setIsRecording] = useState(false);
  const [mode, setMode] = useState<RecordingMode>(null);
  const [elapsed, setElapsed] = useState(0);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamsRef = useRef<MediaStream[]>([]);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const cleanup = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    streamsRef.current.forEach((s) => s.getTracks().forEach((t) => t.stop()));
    streamsRef.current = [];
    mediaRecorderRef.current = null;
  }, []);

  const startTimer = useCallback(() => {
    setElapsed(0);
    timerRef.current = setInterval(() => {
      setElapsed((prev) => prev + 1);
    }, 1000);
  }, []);

  const handleStop = useCallback(() => {
    const blob = new Blob(chunksRef.current, {
      type: chunksRef.current[0]?.type || "video/webm",
    });
    const url = URL.createObjectURL(blob);
    setRecordedBlob(blob);
    setRecordedUrl(url);
    setIsRecording(false);
    cleanup();
  }, [cleanup]);

  const startScreenRecording = useCallback(async () => {
    try {
      setError(null);
      chunksRef.current = [];

      // Capture screen with audio
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true,
      });

      // Also capture mic audio
      let micStream: MediaStream | null = null;
      try {
        micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch {
        // Mic access denied, continue with screen only
      }

      // Combine streams
      const tracks = [
        ...screenStream.getVideoTracks(),
        ...screenStream.getAudioTracks(),
      ];
      if (micStream) {
        tracks.push(...micStream.getAudioTracks());
      }

      const combinedStream = new MediaStream(tracks);
      streamsRef.current = [screenStream];
      if (micStream) streamsRef.current.push(micStream);

      const recorder = new MediaRecorder(combinedStream, {
        mimeType: MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
          ? "video/webm;codecs=vp9"
          : "video/webm",
      });

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = handleStop;

      // If user stops sharing via browser UI
      screenStream.getVideoTracks()[0].onended = () => {
        if (mediaRecorderRef.current?.state === "recording") {
          mediaRecorderRef.current.stop();
        }
      };

      mediaRecorderRef.current = recorder;
      recorder.start(1000);
      setIsRecording(true);
      setMode("screen");
      startTimer();
    } catch (err: any) {
      if (err.name === "NotAllowedError") {
        setError("Permiso denegado. Permite el acceso a la pantalla para grabar.");
      } else {
        setError("No se pudo iniciar la grabación de pantalla.");
      }
    }
  }, [handleStop, startTimer]);

  const startMicRecording = useCallback(async () => {
    try {
      setError(null);
      chunksRef.current = [];

      const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamsRef.current = [micStream];

      const recorder = new MediaRecorder(micStream, {
        mimeType: MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : "audio/webm",
      });

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = handleStop;

      mediaRecorderRef.current = recorder;
      recorder.start(1000);
      setIsRecording(true);
      setMode("mic");
      startTimer();
    } catch (err: any) {
      if (err.name === "NotAllowedError") {
        setError("Permiso denegado. Permite el acceso al micrófono.");
      } else {
        setError("No se pudo iniciar la grabación de audio.");
      }
    }
  }, [handleStop, startTimer]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
  }, []);

  const clearRecording = useCallback(() => {
    if (recordedUrl) URL.revokeObjectURL(recordedUrl);
    setRecordedBlob(null);
    setRecordedUrl(null);
    setMode(null);
    setElapsed(0);
  }, [recordedUrl]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup();
      if (recordedUrl) URL.revokeObjectURL(recordedUrl);
    };
  }, [cleanup, recordedUrl]);

  return {
    isRecording,
    mode,
    elapsed,
    startScreenRecording,
    startMicRecording,
    stopRecording,
    recordedBlob,
    recordedUrl,
    error,
    clearRecording,
  };
}
