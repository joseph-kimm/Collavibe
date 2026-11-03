# Vibecode 101: teaching edition and release checks

## Scope

Built from the existing proposal and the November 2 reflection snapshot, retaining the agreed adult-beginner audience, five two-hour classes, individual-to-group progression, meaningful data literacy, human reflections, and no grading/ranking. The original private discussions and source reflections remain outside Git. Real cohort dates, venue and sponsored access are unconfirmed and are not advertised as established.

The website, Markdown handbook and assignment briefs derive from `src/course-content.ts`, `course-resources.ts` and `course-assignments.ts`. The source-verified resource catalog contains 22 official teaching/provider links, checked November 2, 2026. Required excerpts and preparation budgets are separate from optional reference material. Videos have transcript/reading alternatives where available. External access and terms should be rechecked before teaching.

## Course sequence

| Week | Class result | Work before the following class |
| --- | --- | --- |
| 1 | A small prototype and observed revision | Individual interaction, three checks and a short explanation |
| 2 | A two-source API prototype and partial-failure behavior | Two-API app, primary-source checks, interpretation and five tests |
| 3 | A data model and actual policy-test evidence | Persistence/access lab, group interviews and charter |
| 4 | Reviewed parallel work and usable handoffs | Narrow release candidate, user test and demo rehearsal |
| 5 | Integration checks, four-team showcase and reflection | One reasoned revision and final package within 72 hours of class end |

Each agenda totals 120 minutes including a ten-minute break. Total planned preparation and assignment work is 580 minutes, approximately 9 hours 40 minutes outside class. Class size is 8–12, organized into at most four final teams of two or three. Larger showcases require a revised timetable. This is a feasible first teaching design, not evidence from an actual classroom pilot.

## Materials and boundaries

- The two-API assignment is a coherent user task, not unrelated widgets. Two independent datasets from one provider are allowed; a geocoding lookup alone does not count as the second substantive source. Weather/air is the no-key guided pair; Open Library/Gutendex is an independent alternative.
- The API starter exposes live requests, synthetic fixtures, timeout and partial failure. It makes sources, units and times visible. Only the starter route's CSP permits the two fixed external hosts; authenticated workspace/course pages retain self-only connections.
- The storage browser lab is labeled a simulation. Real authorization evidence comes from the rollback-only Postgres RLS lab. A complete cloud authentication app is optional, not secretly required in a 90-minute task.
- Final projects implement one useful journey with at least one API or persistent store. No payment flow, regulated advice or sensitive real records. Local run instructions and private presentations are valid fallbacks.
- Assignment work and reflections stay private until explicitly submitted to the course owner. Public stories/portfolios remain separate, reviewed consent decisions. The platform does not score people or infer learning from Git counts.
- The actual cohort schedule is owner-configured. The calendar has five classes, five assignment deadlines and one demo-candidate milestone, with timezone/DST handling and no invitation/send action.

## Executed checks before deployment

- `npm run check`: **133 tests across 19 files**, including existing collaboration/MCP contracts, HTTP role boundaries, stale writes, timetable integrity, privacy, resubmission, calendar escaping/folding and the real Postgres policy lab through PGlite.
- `npm audit --omit=dev`: **0 reported vulnerabilities** at this check. This is not an independent security audit.
- Cloud-backed smoke: all nine hosted MCP tools, durable records, meeting summary drafts, proposed/unassigned tickets, journals/replies, private intake, course schedule/calendar, private draft/submission/review cycle, publication/feedback/stories, and outsider rejection passed against the real Collavibe Supabase backend through a loopback HTTP server.
- Course-delivery migration applied successfully in the Collavibe Supabase project. Existing RLS and service-only RPC grants retained.
- Chrome browser: learner resubmission, organizer schedule edit/save and Ready feedback persisted. Live weather plus air requests displayed both datasets; intentionally unavailable air retained the working weather result and showed the failure.
- PDF handbook: 27 pages rendered and visually inspected. Full Markdown, five briefs, eight templates, runnable starters and the SQL script are included in the downloadable kit.

The Vercel preview `dpl_3JhUwD8GznUofWzbEaBPd8SrX8va` served version 0.10.0 and the 22-file kit downloaded successfully through the browser. At 390px the public lessons/assignments and resource filter worked; the authenticated learner saw the persisted Ready decision and feedback history. This check exposed a long intake button overflowing the viewport, fixed by allowing course buttons to wrap. Disposable synthetic fixtures are removed after deployment QA; no real learner work is used for tests.

## Rebuilding the downloads

Run `npm run build:course-kit` to regenerate the Markdown handbook, briefs and templates. For the PDF, run `python3 scripts/build-course-pdf.py` with ReportLab installed; it uses Arial when available or standard Helvetica. `COURSE_FONT_DIR` can supply the font directory. Run `npm run build:course-kit` again after the PDF to include it in the archive. No Python dependency is needed by the hosted app. Generated teaching artifacts are checked in.

## Remaining operational limits

Set and confirm actual cohort dates/location, facilitator support and learner agent access before opening enrollment. The course has not yet been piloted, and workload estimates should be revised from learner experience. There is no automatic course enrollment, certificate, reminder email or gradebook. Existing documented product limits, including account recovery delivery, independent security/load audit and provider-specific audio limits, still apply.

## Production verification

- Published runtime commit: `19d4324` on `main`, pushed without rewriting history. The existing development branch is retained.
- Vercel production deployment: `dpl_9uKxeA9M2opSGfJipukqFSvDeirQ`, aliased to https://collavibe.vercel.app. Browser health showed version `0.10.0`, `hosted-mcp` mode.
- Live course: https://collavibe.vercel.app/course. Five lessons and five briefs loaded; direct lesson/assignment links opened and scrolled to the correct content.
- A disposable learner signed in on production, saw the saved organizer feedback, saved an Assignment 2 private draft and retrieved its exact text after a reload.
- At 390px the authenticated course page had a document width of 390px after the wrapping fix. The public final brief also fit 320px without horizontal overflow. Resource filtering and expand/collapse controls worked. These are browser checks, not a full accessibility audit.
- Production API starter displayed two live datasets. With intentional air failure enabled it displayed one working dataset and reported the missing provider without silently switching to fictional data.
- The downloaded production PDF matched the checked-in, rendered 27-page handbook byte-for-byte (SHA-256 `03d45d82c191d864869bece29ec82a7a0b28c5d787ec758bde04d142a58668fe`). The kit contained 22 files including the PDF.
- Disposable synthetic team, projects, records, three accounts and the temporary credential file were removed after QA. A fresh live course page showed no test stories. Production screenshots were saved under ignored `output/playwright/`; no credentials or private discussion sources were committed.
