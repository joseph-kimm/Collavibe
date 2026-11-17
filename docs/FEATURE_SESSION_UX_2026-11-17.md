# Feature and session usability audit

Changes:

- Removed the normal Archive feature action and its browser-side archive handler. Previously archived features retain a Restore feature action so historical data remains recoverable.
- Added named GitHub commit links in session details, using the full commit hash and the repository captured by that session. Relinking a project does not silently redirect historical commits to the new repository.
- Moved commits above the longer handoff sections. Collapsed changed-file lists and provenance details keep those records available without obscuring the main actions. Unverified recent-log context remains explicitly distinguished from session work.
- Added Open feature from a session and explanatory states for features without sessions, unsynced sessions, and handoffs without recorded commits.
- Removed wording that implied users must paste a particular start prompt. Sample commits remain labeled, with no fabricated GitHub links.

Validation: TypeScript passes; 186 tests across 29 files pass. New tests cover historical-repository selection, SSH/HTTPS remotes, invalid hashes, unsafe URLs, sample records, unverified context, empty evidence, and HTML escaping. Browser checks cover feature actions, empty-session feedback, session-to-feature navigation, and sample evidence rendering. Production verification follows deployment, including a real private-repository commit and mobile detail navigation.

Scope: this audit addresses feature/session flows and their navigation. It does not assert that every possible client, repository host, network failure, or account configuration has been tested. Commit navigation currently supports github.com; unavailable or unsupported remotes remain readable plain text.
