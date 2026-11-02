import { z } from "zod";
import { segmentSchema } from "../src/meetings.js";
import { WorkspaceError } from "../src/workspace-model.js";

export const MAX_MEETING_AUDIO_BYTES = 3 * 1024 * 1024;
const formats: Record<string, string> = { "audio/webm": "webm", "audio/mp4": "m4a", "audio/m4a": "m4a", "audio/x-m4a": "m4a", "audio/mpeg": "mp3", "audio/mp3": "mp3", "audio/wav": "wav", "audio/x-wav": "wav", "audio/ogg": "ogg", "audio/flac": "flac" };

export function audioAvailability() {
  const deepgram = process.env.COLLAVIBE_AUDIO_PROVIDER === "deepgram";
  return { configured: deepgram ? !!process.env.DEEPGRAM_API_KEY : !!process.env.OPENAI_API_KEY, maxBytes: MAX_MEETING_AUDIO_BYTES, provider: deepgram ? "Deepgram" : "OpenAI", speakerIdentification: false,
    model: deepgram ? "nova-3" : process.env.COLLAVIBE_TRANSCRIPTION_MODEL || "gpt-4o-transcribe-diarize", supportedUntil: deepgram ? null : "2027-02-26", rawAudioStored: false, speakerLabels: true };
}

export async function transcribeMeetingAudio(bytes: Uint8Array, contentType: string, consent: boolean, fetcher: typeof fetch = fetch) {
  if (!consent) throw new WorkspaceError("Confirm that participants agreed to recording and external audio transcription.", 400);
  const deepgram = process.env.COLLAVIBE_AUDIO_PROVIDER === "deepgram";
  if (!audioAvailability().configured) throw new WorkspaceError("Audio transcription is not configured. Paste a transcript instead, or configure the selected provider's API key on the server.", 503);
  const mime = contentType.split(";")[0].trim().toLowerCase();
  if (!formats[mime]) throw new WorkspaceError("Use a WebM, M4A, MP3, WAV, OGG, or FLAC audio file.", 415);
  if (!bytes.length || bytes.length > MAX_MEETING_AUDIO_BYTES) throw new WorkspaceError("Upload a non-empty audio clip no larger than 3 MB. Split longer meetings into clips.", 413);
  const model = audioAvailability().model;
  // Speaker separation is not voice identity recognition. This specialized API
  // remains isolated/configurable because OpenAI has announced its retirement.
  if (!deepgram && new Date() >= new Date("2027-02-26T00:00:00Z") && model === "gpt-4o-transcribe-diarize") throw new WorkspaceError("The configured speaker-labeling model has retired. Update the server's transcription provider configuration.", 503);
  const body = new FormData();
  body.append("file", new Blob([new Uint8Array(bytes)], { type: mime }), "meeting." + formats[mime]);
  body.append("model", model); body.append("response_format", "diarized_json"); body.append("chunking_strategy", "auto");
  let response: Response;
  try { response = deepgram
    ? await fetcher("https://api.deepgram.com/v1/listen?model=nova-3&diarize=true&utterances=true&smart_format=true&mip_opt_out=true", { method: "POST", headers: { Authorization: `Token ${process.env.DEEPGRAM_API_KEY}`, "Content-Type": mime }, body: new Uint8Array(bytes), signal: AbortSignal.timeout(45000) })
    : await fetcher("https://api.openai.com/v1/audio/transcriptions", { method: "POST", headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` }, body, signal: AbortSignal.timeout(45000) }); }
  catch { throw new WorkspaceError("Audio transcription did not finish. Keep your clip and retry with a shorter recording.", 504); }
  if (!response.ok) throw new WorkspaceError(response.status === 429 ? "The audio provider is rate-limited or out of credits. Retry later, or paste your transcript." : "The audio provider could not transcribe this clip. Check the server configuration or use a shorter recording.", 502);
  let result: { text?: string; segments?: unknown[]; results?: { utterances?: { speaker?: number; start: number; end: number; transcript: string }[] } };
  try { result = await response.json(); } catch { throw new WorkspaceError("The audio provider returned an unreadable response.", 502); }
  if (deepgram && result.results?.utterances?.some(segment => segment.speaker === undefined)) throw new WorkspaceError("The audio provider did not return speaker labels. Check the diarization configuration.", 502);
  const rawSegments = deepgram ? result.results?.utterances?.map(segment => ({ speaker: `speaker_${segment.speaker}`, start: segment.start, end: segment.end, text: segment.transcript })) : result.segments;
  const parsed = z.array(segmentSchema).min(1).max(3000).safeParse(rawSegments);
  if (!parsed.success) throw new WorkspaceError("The audio provider did not return usable speaker-labeled segments. Paste a transcript or retry the clip.", 502);
  const segments = parsed.data;
  const transcript = segments.map(segment => `${segment.speaker}: ${segment.text}`).join("\n");
  if (transcript.length > 150000) throw new WorkspaceError("This transcript is too long. Split the recording into smaller clips.", 413);
  const speakers = Object.fromEntries([...new Set(segments.map(segment => segment.speaker))].map((id, index) => [id, `Speaker ${index + 1}`]));
  return { transcript, segments, speakers, speakersReviewed: false, provider: deepgram ? "Deepgram" : "OpenAI", source: "audio", rawAudioStored: false };
}
