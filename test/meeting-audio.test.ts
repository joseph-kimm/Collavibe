import { afterEach, describe, expect, it, vi } from "vitest";
import { audioAvailability, MAX_MEETING_AUDIO_BYTES, transcribeMeetingAudio } from "../server/meeting-audio.js";

afterEach(() => { vi.unstubAllEnvs(); });
describe("speaker-labeled audio provider", () => {
  it("never sends audio without consent or an API key", async () => {
    vi.stubEnv("OPENAI_API_KEY", ""); vi.stubEnv("COLLAVIBE_AUDIO_PROVIDER", "openai");
    const send = vi.fn();
    await expect(transcribeMeetingAudio(new Uint8Array([1]), "audio/webm", false, send)).rejects.toMatchObject({ status: 400 });
    await expect(transcribeMeetingAudio(new Uint8Array([1]), "audio/webm", true, send)).rejects.toMatchObject({ status: 503 });
    expect(send).not.toHaveBeenCalled(); expect(audioAvailability().configured).toBe(false);
  });
  it("rejects unsupported content and oversized clips before sending them", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-only-key"); vi.stubEnv("COLLAVIBE_AUDIO_PROVIDER", "openai");
    const send = vi.fn();
    await expect(transcribeMeetingAudio(new Uint8Array([1]), "application/json", true, send)).rejects.toMatchObject({ status: 415 });
    await expect(transcribeMeetingAudio(new Uint8Array(MAX_MEETING_AUDIO_BYTES + 1), "audio/wav", true, send)).rejects.toMatchObject({ status: 413 });
    expect(send).not.toHaveBeenCalled();
  });
  it("uses diarized output and preserves speaker/time segments without identifying people", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-only-key"); vi.stubEnv("COLLAVIBE_AUDIO_PROVIDER", "openai");
    const send = vi.fn(async (_url, options) => {
      const form = options.body as FormData;
      expect(form.get("response_format")).toBe("diarized_json"); expect(form.get("chunking_strategy")).toBe("auto");
      return Response.json({ segments: [{ speaker: "A", start: 0, end: 2, text: "Add a checklist." }, { speaker: "B", start: 2, end: 4, text: "I can help test." }] });
    });
    const result = await transcribeMeetingAudio(new Uint8Array([1,2]), "audio/webm;codecs=opus", true, send as typeof fetch);
    expect(result.segments).toHaveLength(2); expect(result.speakers).toEqual({ A: "Speaker 1", B: "Speaker 2" });
    expect(result.speakersReviewed).toBe(false); expect(result.rawAudioStored).toBe(false);
    expect(JSON.stringify(result)).not.toContain("test-only-key");
  });
  it("supports a dedicated Deepgram diarization provider without silent fallback to another vendor", async () => {
    vi.stubEnv("COLLAVIBE_AUDIO_PROVIDER", "deepgram"); vi.stubEnv("DEEPGRAM_API_KEY", "test-only-deepgram");
    const send = vi.fn(async url => { expect(String(url)).toContain("api.deepgram.com/v1/listen"); expect(String(url)).toContain("diarize=true"); return Response.json({ results: { utterances: [{ speaker: 0, start: 0, end: 3, transcript: "Let's start with the API." }] } }); });
    const result = await transcribeMeetingAudio(new Uint8Array([1]), "audio/mp4", true, send as typeof fetch);
    expect(result.provider).toBe("Deepgram"); expect(result.segments[0].speaker).toBe("speaker_0"); expect(audioAvailability().model).toBe("nova-3");
  });
  it("fails clearly on missing diarization or provider errors without leaking provider internals", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-only-key"); vi.stubEnv("COLLAVIBE_AUDIO_PROVIDER", "openai");
    await expect(transcribeMeetingAudio(new Uint8Array([1]), "audio/wav", true, (async () => Response.json({ text: "No speaker labels" })) as typeof fetch)).rejects.toMatchObject({ status: 502 });
    await expect(transcribeMeetingAudio(new Uint8Array([1]), "audio/wav", true, (async () => Response.json({ error: "secret-provider-details" }, { status: 401 })) as typeof fetch)).rejects.toThrow("could not transcribe");
  });
});
