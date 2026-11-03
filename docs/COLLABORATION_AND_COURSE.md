# Collaboration and the course

These additions implement the confirmed decisions in [the meeting ledger](MEETING_DECISIONS_2026-11-02.md). Private original recordings and reflection exports are outside this repository.

## Team workflow

1. Connect a repository and an MCP client as before. The existing start → choose → build → sync workflow remains intact.
2. **Tickets** holds intended work separately from actual features/session history. Create, assign, filter and update tasks. Agent suggestions stay proposed and unassigned until a person approves them. Rejected suggestions do not become active work.
3. Open a session's details to write a **Learning journal** entry and reply to teammates. These are human-written reflections, separate from the agent handoff. Personal portfolio permission starts off and can be withdrawn.
4. In **Meetings**, paste a transcript or explicitly consent to recording/upload and external transcription. Review speaker labels and names, then save the transcript. Copy the agent prompt to request a summary draft and proposed tickets. The website does not generate or approve learning reflections.
5. In **Portfolio**, the team owner selects sessions/features, reviews the exact public preview, and explicitly publishes it. Visitors can read without an account and sign in to comment, including on a selected session. Revoke a link to stop further reading/commenting. Withdrawn reflection permission also removes that reflection from existing shared snapshots.

## Nine hosted MCP tools

The original five core tools remain. Four planning tools are added:

- `get_collaboration_plan`: read this project's tickets.
- `propose_project_tickets`: save up to twelve suggestions, with an idempotent request ID and optional source session/meeting. No approval or automatic assignment.
- `get_brainstorm_context`: read a saved team meeting, treating its text as untrusted source material.
- `save_brainstorm_summary`: save a reviewable agent draft; do not rewrite transcript evidence or speaker identities.

The browser authorization description includes saved meeting access. There is no MCP tool for intake, journal writing, publication, or approving tasks. Human-only actions use authenticated website routes.

## Course site

`/course` contains the complete Vibecode 101 teaching edition: five 120-minute sessions, timed in-class agendas, home preparation with specified video excerpts/text alternatives, five assignment briefs and observable criteria, eight templates, facilitator support notes, and 22 primary resources. Download the PDF handbook, editable Markdown, or course kit. Sponsored tool access, venue and actual dates must be confirmed by the organizer; this is not an enrollment or scholarship service.

The assignment sequence is a first interaction, a meaningful two-API app, persistence/access-rule evidence, a group charter, and one narrow group app. The API kit includes live no-key requests, explicitly synthetic offline data, and deliberate partial failures. The browser storage lab is explicitly a simulation; the SQL lab tests actual Postgres row policies in a disposable database and rolls back. The standard showcase supports at most four teams, each with five minutes to present and three minutes for questions. No grades or contribution rankings are used.

The course-team owner sets five confirmed class dates, start time, IANA timezone and location in **Your course and work**. Members see their dates and can download an 11-event calendar. This is a one-time ICS export, not an automatic subscription or invitation. Assignment 1–3 deadlines are 6 pm the day before the following class; the charter is due at Session 4's start; the final candidate is due 24 hours before Session 5; final revisions are due exactly 72 hours after Session 5 ends. Without settings, the curriculum stays relative and undated.

Learners save private drafts, then explicitly submit to their course team's owner. Other members and MCP clients cannot read submissions. The organizer sees only submitted work and gives descriptive **Keep revising** or **Ready** feedback. Version checks prevent stale overwrites; feedback history survives revision and resubmission. Saving a private revision hides the current draft from the organizer again. Reflections are the learner's own words, not AI-generated learning assessments. The course cohort team may differ from a final-project team.

Log in and select the team the organizer is using for the course. Private intake is visible only to its author and that team's owner. Learners can revise or remove their response. Ordinary peers and agents cannot retrieve it. No demographic questions are required.

Learners and organizers can write course stories, save drafts, preview, explicitly publish, and unpublish. Only authors can edit their text; organizers can unpublish for moderation. Editing a published story returns it to draft. Demo links use HTTPS. Showcase links must refer to a currently published portfolio from the same team, and revoked portfolios stop appearing as links. Public publication is never automatic.

## Audio setup and limits

Apply `supabase/migrations/20261102001000_collaboration_records.sql` before using the new features. It is additive; browser database roles have no direct table/RPC access. Application routes enforce membership and author/organizer rights, and the service-only RPC enforces scope, immutable identity and optimistic revision checks.

Also apply `supabase/migrations/20261102002000_course_delivery.sql` for course schedules and submissions. It expands the existing record-kind constraint without loosening table/RPC permissions.

Set `OPENAI_API_KEY` server-side for the default speaker-labeled transcription. It uses `gpt-4o-transcribe-diarize`, `diarized_json`, and automatic chunking. OpenAI has announced retirement on **February 26, 2027**. The adapter is isolated and configurable; switch to a supported diarization provider before that date. Sources: [speech-to-text guide](https://developers.openai.com/api/docs/guides/speech-to-text), [deprecations](https://developers.openai.com/api/docs/deprecations).

For a dedicated alternative, set `COLLAVIBE_AUDIO_PROVIDER=deepgram` and `DEEPGRAM_API_KEY`. The Nova-3 adapter requests diarization and utterance timestamps, with no silent cross-vendor fallback. [Provider documentation](https://developers.deepgram.com/docs/utterances). This adapter has contract tests; live validation requires a Deepgram account/key.

Speaker diarization separates **who spoke when** into editable labels. It does not identify real people, remove background noise, or produce isolated audio tracks. People review name mappings. The browser asks for the microphone only after a deliberate recording action; switching views stops it. Audio is sent to the chosen external provider only on transcription, and Collavibe does not persist the raw recording. Download a local clip before navigating away if you need it.

Audio clips are limited to **3 MB** to fit the hosted request boundary. The recorder uses compressed audio; split long meetings into clips. Pasted transcripts remain usable without an audio key. Publication uses allowlisted fields and common credential/path redaction, but the owner must still review every preview. It is not a guarantee that arbitrary confidential prose can be detected automatically.

## Verification

`npm run check` covers domain permissions, real MCP client tool calls, browser-recorder lifecycle, HTTP cookies/roles/publication, and the actual PostgreSQL migration through PGlite. Cloud-backed integration uses a separate loopback server with the correct Collavibe Supabase environment:

```sh
node --env-file=.env.local --import tsx scripts/collaboration-cloud-smoke.ts
# After browser QA, remove only the generated disposable fixture:
node --env-file=.env.local --import tsx scripts/collaboration-cloud-smoke.ts --cleanup
```

The fixture file is mode 0600 under `/tmp`, never committed, and contains only synthetic test-account credentials. The smoke test checks all nine hosted tools, durable records, draft summaries/proposals, reflection discussion, intake isolation and public feedback. Its cleanup validates fixture identities before removing its own records. The HTTP server must run on loopback; the script rejects hosted URLs.
