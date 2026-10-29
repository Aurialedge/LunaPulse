import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

// Voice-over for the demo video: ElevenLabs reads each caption's line, and ffmpeg lays every clip at the moment its
// caption appeared. Clips are cached by text, so re-recording doesn't spend characters again.
// The key comes from ELEVENLABS_API_KEY or backend/.env (git-ignored); it is never written anywhere else.
const VOICE_ID = "XrExE9yKIg1WjnnlVkGX"; // Matilda: knowledgeable, professional (ElevenLabs premade)
const MODEL_ID = "eleven_multilingual_v2";
const CACHE = resolve("test-results/demo-audio");

export interface Clip {
  file: string;
  seconds: number;
}

export interface Cue extends Clip {
  atMs: number; // offset from the start of the recording
}

function envFileValue(name: string): string | undefined {
  const path = resolve("../backend/.env");
  if (!existsSync(path)) return undefined;
  for (const line of readFileSync(path, "utf-8").split(/\r?\n/)) {
    const match = line.match(new RegExp(`^\\s*${name}\\s*=\\s*(.*)$`));
    if (match) return match[1].trim().replace(/^["']|["']$/g, "") || undefined;
  }
  return undefined;
}

export function elevenLabsKey(): string | undefined {
  return process.env.ELEVENLABS_API_KEY || envFileValue("ELEVENLABS_API_KEY");
}

/** The spoken clip for `text`: from the cache, or generated once. */
export async function speak(text: string, key: string): Promise<Clip> {
  mkdirSync(CACHE, { recursive: true });
  const id = createHash("sha1").update(`${VOICE_ID}|${MODEL_ID}|${text}`).digest("hex").slice(0, 16);
  const file = join(CACHE, `${id}.mp3`);
  const meta = join(CACHE, `${id}.json`);
  if (existsSync(file) && existsSync(meta)) return { file, seconds: JSON.parse(readFileSync(meta, "utf-8")).seconds };

  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}/with-timestamps?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: { "xi-api-key": key, "Content-Type": "application/json" },
      body: JSON.stringify({ text, model_id: MODEL_ID, voice_settings: { stability: 0.5, similarity_boost: 0.75 } }),
    },
  );
  if (!response.ok) throw new Error(`ElevenLabs ${response.status}: ${(await response.text()).slice(0, 200)}`);
  const body = (await response.json()) as { audio_base64: string; alignment: { character_end_times_seconds: number[] } };
  const ends = body.alignment.character_end_times_seconds;
  const seconds = ends[ends.length - 1];
  writeFileSync(file, Buffer.from(body.audio_base64, "base64"));
  writeFileSync(meta, JSON.stringify({ text, seconds }));
  return { file, seconds };
}

/** Video + every clip at its offset → an MP4 (H.264 + AAC) that plays everywhere. */
export function mux(video: string, cues: Cue[], output: string) {
  const ffmpeg = process.env.FFMPEG_PATH || "ffmpeg";
  const inputs = cues.flatMap((c) => ["-i", c.file]);
  const delays = cues.map((c, i) => `[${i + 1}:a]adelay=delays=${Math.round(c.atMs)}:all=1[a${i}]`);
  const mix = `${cues.map((_, i) => `[a${i}]`).join("")}amix=inputs=${cues.length}:normalize=0:dropout_transition=0[voice]`;
  execFileSync(
    ffmpeg,
    [
      "-y", "-loglevel", "error", "-i", video, ...inputs,
      "-filter_complex", [...delays, mix].join(";"),
      "-map", "0:v", "-map", "[voice]",
      "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "22", "-preset", "medium",
      "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", output,
    ],
    { stdio: "inherit" },
  );
}
