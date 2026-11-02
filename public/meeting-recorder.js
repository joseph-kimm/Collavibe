export const MAX_AUDIO_BYTES = 3 * 1024 * 1024;
let activeRecorder;
export function stopMeetingRecording() { activeRecorder?.dispose(); }
if (typeof window !== "undefined") window.addEventListener("pagehide", stopMeetingRecording);

export function createMeetingRecorder({ onClip, onStatus, getUserMedia = options => navigator.mediaDevices.getUserMedia(options), Recorder = globalThis.MediaRecorder }) {
  let recorder, stream, disposed = false, starting = false, chunks = [], total = 0;
  const release = () => { stream?.getTracks().forEach(track => track.stop()); stream = null; };
  const controller = {
    async start(consent) {
      if (!consent) throw new Error("Confirm participant consent before recording.");
      if (disposed || starting || recorder?.state === "recording") throw new Error("The recorder is already active or closed.");
      if (!Recorder) throw new Error("This browser cannot record audio. Upload a clip or paste a transcript instead.");
      starting = true;
      activeRecorder = controller;
      try {
        stream = await getUserMedia({ audio: true });
        if (disposed) { release(); return; }
        const mimeType = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm"].find(type => Recorder.isTypeSupported?.(type));
        recorder = new Recorder(stream, { ...(mimeType ? { mimeType } : {}), audioBitsPerSecond: 16000 });
        chunks = []; total = 0;
        recorder.addEventListener("dataavailable", event => {
          if (!event.data?.size) return;
          if (total + event.data.size > MAX_AUDIO_BYTES) { onStatus("Clip limit reached. Keep this clip and start another for the rest of the meeting."); controller.stop(); return; }
          chunks.push(event.data); total += event.data.size;
          if (total > MAX_AUDIO_BYTES - 32768) controller.stop();
        });
        recorder.addEventListener("stop", () => { release(); if (chunks.length) onClip(new Blob(chunks, { type: recorder.mimeType || "audio/webm" })); onStatus("Recording stopped. Review or download the clip before sending it for transcription."); });
        recorder.addEventListener("error", () => { release(); onStatus("Recording failed. Any completed clip stays available; you can also upload audio or paste text."); });
        recorder.start(1000); activeRecorder = controller; onStatus("Recording. Nothing is being uploaded. Stop when you are ready.");
      } catch (error) { release(); throw error; }
      finally { starting = false; }
    },
    stop() { if (recorder && recorder.state !== "inactive") recorder.stop(); else release(); },
    dispose() { disposed = true; controller.stop(); if (activeRecorder === controller) activeRecorder = undefined; },
  };
  return controller;
}
