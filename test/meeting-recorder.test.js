import { describe, expect, it, vi } from "vitest";
import { createMeetingRecorder, stopMeetingRecording } from "../public/meeting-recorder.js";

function recorderFixture() {
  const trackStop = vi.fn(), requestAudio = vi.fn(async () => ({ getTracks: () => [{ stop: trackStop }] }));
  let instance;
  class Recorder {
    static isTypeSupported() { return true; }
    state = "inactive"; mimeType = "audio/webm"; events = {};
    constructor() { instance = this; }
    addEventListener(name, callback) { this.events[name] = callback; }
    start() { this.state = "recording"; }
    stop() { this.state = "inactive"; this.events.dataavailable?.({ data: new Blob(["test-audio"]) }); this.events.stop?.(); }
  }
  const onClip = vi.fn(), onStatus = vi.fn();
  const recorder = createMeetingRecorder({ onClip, onStatus, getUserMedia: requestAudio, Recorder });
  return { recorder, onClip, trackStop, requestAudio, instance: () => instance };
}
describe("consent-based recorder lifecycle", () => {
  it("never requests the microphone on construction or without consent", async () => {
    const f = recorderFixture(); expect(f.requestAudio).not.toHaveBeenCalled();
    await expect(f.recorder.start(false)).rejects.toThrow("consent"); expect(f.requestAudio).not.toHaveBeenCalled();
  });
  it("releases the microphone and returns a local clip on stop", async () => {
    const f = recorderFixture(); await f.recorder.start(true); expect(f.instance().state).toBe("recording");
    f.recorder.stop(); expect(f.trackStop).toHaveBeenCalled(); expect(f.onClip).toHaveBeenCalledOnce(); expect(f.onClip.mock.calls[0][0]).toBeInstanceOf(Blob);
  });
  it("stops a recording when leaving the work surface", async () => {
    const f = recorderFixture(); await f.recorder.start(true); stopMeetingRecording(); expect(f.trackStop).toHaveBeenCalled(); expect(f.instance().state).toBe("inactive");
  });
  it("cancels microphone acquisition even if navigation happens before permission resolves", async () => {
    let finish;
    const stop = vi.fn();
    const recorder = createMeetingRecorder({ getUserMedia: () => new Promise(resolve => { finish = resolve; }), Recorder: class {}, onClip: vi.fn(), onStatus: vi.fn() });
    const starting = recorder.start(true); stopMeetingRecording(); finish({ getTracks: () => [{ stop }] }); await starting; expect(stop).toHaveBeenCalled();
  });
});
