import { FFmpeg } from "@ffmpeg/ffmpeg";
import { toBlobURL, fetchFile } from "@ffmpeg/util";

const FFMPEG_BASE = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd";

let ffmpegInstance: FFmpeg | null = null;
let loadingPromise: Promise<FFmpeg> | null = null;

async function getFFmpeg(): Promise<FFmpeg> {
  if (ffmpegInstance) return ffmpegInstance;
  if (loadingPromise) return loadingPromise;

  loadingPromise = (async () => {
    const ff = new FFmpeg();
    await ff.load({
      coreURL: await toBlobURL(`${FFMPEG_BASE}/ffmpeg-core.js`, "text/javascript"),
      wasmURL: await toBlobURL(`${FFMPEG_BASE}/ffmpeg-core.wasm`, "application/wasm"),
    });
    ffmpegInstance = ff;
    return ff;
  })();

  return loadingPromise;
}

export interface ProcessedChunk {
  blob: Blob;
  index: number;
  total: number;
  durationSeconds: number;
}

export interface ProcessOptions {
  onProgress?: (stage: string, percent: number) => void;
  // Max size per chunk in bytes (default ~6.5 MB to stay under edge fn limit)
  maxChunkBytes?: number;
}

/**
 * Compresses any audio/video to MP3 mono 32kbps and splits into chunks
 * that fit in the AI edge function memory budget (~8 MB).
 */
export async function compressAndChunk(
  file: File | Blob,
  opts: ProcessOptions = {}
): Promise<ProcessedChunk[]> {
  const maxChunkBytes = opts.maxChunkBytes ?? 6.5 * 1024 * 1024;
  const onProgress = opts.onProgress ?? (() => {});

  onProgress("Cargando compresor de audio...", 5);
  const ff = await getFFmpeg();

  const inputName = "input";
  const outputName = "output.mp3";

  onProgress("Preparando archivo...", 15);
  await ff.writeFile(inputName, await fetchFile(file));

  // Compress to MP3 mono 32kbps — keeps speech intelligible for transcription.
  // 32kbps mono ≈ 4 KB/s ≈ 14 MB per hour.
  onProgress("Comprimiendo audio (esto puede tardar)...", 25);
  const progressHandler = ({ progress }: { progress: number }) => {
    const pct = 25 + Math.min(60, Math.max(0, progress * 60));
    onProgress("Comprimiendo audio...", pct);
  };
  ff.on("progress", progressHandler);

  await ff.exec([
    "-i", inputName,
    "-vn",
    "-ac", "1",
    "-ar", "16000",
    "-b:a", "32k",
    "-codec:a", "libmp3lame",
    outputName,
  ]);
  ff.off("progress", progressHandler);

  onProgress("Leyendo audio comprimido...", 88);
  const data = (await ff.readFile(outputName)) as Uint8Array;
  const compressedBlob = new Blob([data.buffer as ArrayBuffer], { type: "audio/mpeg" });

  // Cleanup
  try { await ff.deleteFile(inputName); } catch { /* ignore */ }
  try { await ff.deleteFile(outputName); } catch { /* ignore */ }

  // Get duration via probe (re-decode quickly to compute duration in seconds)
  const totalSeconds = await estimateDurationFromMp3(compressedBlob);

  // If small enough, ship as one chunk
  if (compressedBlob.size <= maxChunkBytes) {
    onProgress("Listo", 100);
    return [{ blob: compressedBlob, index: 0, total: 1, durationSeconds: totalSeconds }];
  }

  // Split by time. 32kbps mono → 4000 bytes/sec → safe target.
  const bytesPerSecond = compressedBlob.size / Math.max(1, totalSeconds);
  const secondsPerChunk = Math.floor(maxChunkBytes / bytesPerSecond);
  const numChunks = Math.ceil(totalSeconds / secondsPerChunk);

  onProgress(`Troceando en ${numChunks} partes...`, 92);

  // Re-load the compressed file into ffmpeg for splitting
  await ff.writeFile("compressed.mp3", new Uint8Array(await compressedBlob.arrayBuffer()));

  const chunks: ProcessedChunk[] = [];
  for (let i = 0; i < numChunks; i++) {
    const start = i * secondsPerChunk;
    const partName = `part_${i}.mp3`;
    await ff.exec([
      "-i", "compressed.mp3",
      "-ss", String(start),
      "-t", String(secondsPerChunk),
      "-c", "copy",
      partName,
    ]);
    const partData = (await ff.readFile(partName)) as Uint8Array;
    chunks.push({
      blob: new Blob([partData.buffer as ArrayBuffer], { type: "audio/mpeg" }),
      index: i,
      total: numChunks,
      durationSeconds: Math.min(secondsPerChunk, totalSeconds - start),
    });
    try { await ff.deleteFile(partName); } catch { /* ignore */ }
    onProgress(`Troceando... (${i + 1}/${numChunks})`, 92 + (i + 1) / numChunks * 8);
  }

  try { await ff.deleteFile("compressed.mp3"); } catch { /* ignore */ }

  onProgress("Listo", 100);
  return chunks;
}

/**
 * Quick MP3 duration estimate using a hidden audio element.
 * Reliable for CBR MP3 files like the ones we produce.
 */
async function estimateDurationFromMp3(blob: Blob): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const audio = new Audio();
    audio.preload = "metadata";
    audio.src = url;
    const cleanup = () => URL.revokeObjectURL(url);
    audio.onloadedmetadata = () => {
      const d = isFinite(audio.duration) ? audio.duration : 0;
      cleanup();
      resolve(Math.round(d));
    };
    audio.onerror = () => {
      cleanup();
      // Fallback: assume 32kbps mono → 4000 bytes/sec
      resolve(Math.round(blob.size / 4000));
    };
  });
}
