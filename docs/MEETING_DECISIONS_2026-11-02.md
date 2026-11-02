# Implementation decisions from the latest project discussions

## Sources and scope

The two matching Shayan/Joseph discussions are the October 23 recording, **University of Pennsylvania 28** (30:50), and the November 2 recording, **d&l readings 2 nov** (23:08). Their embedded Apple transcripts were read in full and checked against the [shared project document](https://docs.google.com/document/d/1YLtUHWR26x7OexHQt3rjr91zcBUXq9rBHk2VXRN6N7s/edit), especially Ideas and Weekly Reflection Weeks 10 and 11. The newer October 27/29/30 recordings are other classes or the unrelated escape-room study, not these Collavibe discussions. Automatic transcript wording and speaker attribution are not independently corrected. Original recordings and extracted transcripts remain outside the Git repository.

## Agreed software work and acceptance criteria

| Increment | Source | Acceptance criteria |
| --- | --- | --- |
| Session learning journal and threaded replies | Oct 23 11:09–18:13; Week 10 | Learners write/edit their own reflections on a coding session; teammates can discuss and reply. Reflections are distinct from agent-authored handoffs. One chat can contain multiple sessions and one feature can span sessions. Reflections are not generated or scored by AI. |
| Tickets and human-reviewed suggestions | Oct 23 24:26–30:20; Week 10 | Planning tickets are separate from recorded work/features. People can assign and track tasks and link related work. Agents can propose next steps as draft tickets; only a human can approve or reject them. A meeting or coding session can be the proposal source. |
| Meeting/brainstorming recorder | Oct 23 25:29–30:20; Week 10 | Explicit recording/upload consent, transcript input or audio transcription with speaker labels, editable speaker names/attribution, summary and proposed tasks. Review proposals before making live assignments. Never silently record or infer a person's identity from a voice. |
| Optional public project portfolios and feedback | Nov 2 20:08–22:34; Week 11 | Owner previews and explicitly publishes a sanitized project snapshot; public visitors see the building process and can give session-level feedback after signing in. Sharing is revocable; private notes, intake, credentials, internal paths, and raw transcripts are not automatically exposed. Authors must opt in to publishing personal reflections. |
| Separate course website and resources | Nov 2 15:51–17:37; Week 11 | A distinct course surface for Vibecode 101, not a blog bolted onto the Collavibe marketing page. Five two-hour sessions, practical activities, resource links, learner intake, and human-written project stories/demo links. No invented instructors, enrollment, scholarships, or scheduled events. |
| Learner intake and adaptive support | Nov 2 07:02–10:44; Week 11 | Learners can save background, interests, examples, goals, and support requests. Responses are private to the learner and team/course organizer, not public or available to ordinary teammates. Demographic disclosure is not required. |
| Course stories and showcase | Nov 2 17:03–20:08; Week 11 | Learners/instructors write and revise draft posts; deliberate publication exposes only the chosen post/demo link. A showcase can link opted-in project portfolios. The software does not automatically generate learners' reflections or post to external social accounts. |

## Decisions not to implement as product features

- No contribution scores, grading, timers, line-count comparisons, leaderboards, or surveillance claims. Oct 23 22:07–24:26 explicitly explains why these misrepresent effort; the Week 10 reflection confirms their exclusion.
- Funding/sponsorship and targeted instructor support are course design commitments, not permission to purchase subscriptions, contact sponsors, or make access decisions about learners.
- The public forum/Stack Overflow comparison describes the portfolio/feedback direction, not a requirement to clone Reddit or introduce ranking systems.
- Preserve the existing division of responsibility: coding agents inspect repositories and author structured summaries; Collavibe coordinates durable records. It does not commit, push, or independently verify remote Git evidence.
- Neither a new universal slash command nor a new coding agent is required. Use the client's existing MCP tools/prompts and plain-language instructions.

## Delivery discipline

Work is isolated on `codex/meeting-features-nov-02`. Each logical increment gets tests and its own commit. Raw meeting recordings/transcripts, private reflection exports, credentials, and real production learner records are not committed. Tests use disposable local fixtures. Changes to public visibility and recording require explicit user action in the product. Database migration and external-provider setup are verified separately from local-only functionality; no unconfigured integration is presented as working.
