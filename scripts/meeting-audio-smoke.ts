import { readFile } from "node:fs/promises";
import { transcribeMeetingAudio } from "../server/meeting-audio.js";

const input = process.argv[2];
if (!input) throw new Error("Pass the path to an explicitly approved or synthetic WAV test clip.");
const result = await transcribeMeetingAudio(await readFile(input), "audio/wav", true);
const speakers = new Set(result.segments.map(segment => segment.speaker));
console.log(JSON.stringify({ provider: result.provider, segmentCount: result.segments.length, distinctSpeakers: speakers.size, timestampsPresent: result.segments.every(segment => segment.end >= segment.start), rawAudioStored: result.rawAudioStored, identitiesInferred: false }));
if (speakers.size < 2) throw new Error("This clip did not establish separation of two speakers. Review the provider output; do not claim voice separation passed.");
