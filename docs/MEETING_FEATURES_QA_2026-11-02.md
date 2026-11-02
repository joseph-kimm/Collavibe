# November 2 meeting-feature verification

Branch: `codex/meeting-features-nov-02`. Source decisions: [October 23 / November 2 ledger](MEETING_DECISIONS_2026-11-02.md). No original meeting audio/transcripts, private reflection exports, keys, or real learner records were committed.

## Executed

- `npm run check`: **120 tests, 18 files passing**, including the existing repository/MCP contracts, new domain permissions, HTTP role/publication workflow, recorder cleanup, and actual PostgreSQL migration through PGlite.
- `npm audit --omit=dev`: **0 vulnerabilities** after compatible dependency patches. Full install audit also reported zero.
- `git diff --check` and syntax checks on the new browser modules passed.
- Supabase project `knlrwxeycnjifroybaxn`: checked the actual referenced table/column types, then applied the additive collaboration-record migration through the SQL editor. It returned **Success. No rows returned**.
- A cloud-backed loopback server and official MCP client exercised all **nine hosted tools**, existing start/choose/sync, meeting reading, summary drafts, idempotent proposed tickets, session journals/replies, private intake, public portfolio feedback and course stories. Eight records persisted at the automated test checkpoint. No real team was used.
- A synthetic two-voice audio clip passed a direct provider test: **six timed segments, two speaker labels**, no raw audio persisted and no identities inferred.
- Chrome computer-use QA independently uploaded that synthetic clip through Meetings, transcribed it with OpenAI, reviewed the two labels, and saved the meeting. Starting the recorder without consent was refused before microphone access. Live microphone capture of the user's surroundings was not used for testing.
- Chrome verified login returning to `/course`, private intake saving, story draft → exact preview → explicit consent → publication, and human approval/assignment of an MCP-proposed ticket.
- At **390 × 844**, tested navigation/course access and the meeting form. Found and fixed checkbox sizing overflow: document width changed from 436px to **390px**, matching the viewport. Course page width also matched 390px. Restored the normal browser viewport afterward.
- Background updates no longer replace forms or interrupt recording in the new editing views. These views refresh on save or explicit Refresh.

Screenshots are local, ignored QA artifacts under `output/playwright/nov02/`. Cloud fixtures and generated credentials are disposable and removed after preview QA.

## Configuration and honest limits

The approved OpenAI key was installed as a sensitive server-side Vercel environment variable for **Preview and Production**, without printing or committing it. Environment changes apply to subsequent deployments. Deepgram's separate diarization adapter has mocked contract coverage; no Deepgram key was available for a live call. Speaker diarization is not noise removal, voice recognition, or isolated audio-track extraction. The default OpenAI diarization model retires February 26, 2027; provider migration is documented.

This is browser/contract/cloud integration QA, not a completed classroom study, independent security audit, long-term reliability test, or load test. Public snapshots remain explicitly reviewed and agent Git evidence remains agent-attested. Production publication of the full new branch is tracked separately from database/configuration setup.

## Hosted preview

Runtime commit `77c9f71` deployed successfully as [the November 2 preview](https://collavibe-fav0ldxh2-shayan-ahmads-projects.vercel.app), deployment `dpl_5m1Btd9LfbnM3QNDyYtkQziufk96`. Chrome verified public course loading, HTTPS login and return-to-course, authenticated meeting records, and a complete synthetic audio upload → Vercel function → OpenAI diarization → two editable speaker labels. No browser-side key was used.

The branch was pushed to `origin/codex/meeting-features-nov-02`. `main` was not merged or pushed. The full new runtime was **not promoted to collavibe.vercel.app**. Existing production account/team data was not used as test fixtures. The database migration and approved server environment setup are shared infrastructure changes, already applied.
