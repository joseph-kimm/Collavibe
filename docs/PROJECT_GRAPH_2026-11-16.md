# Project graph and feature briefs

## Workflow boundary

A feature is a piece of ongoing work. Several contributors can work on it across several sessions. A session can include many prompts, edits, tests, and revisions. Collavibe stores structured handoffs rather than a transcript or prompt count. Its current session record has one primary `featureId`; this change does not introduce multi-feature session links.

The previous **Copy agent prompt** action appended a feature selection to the start-session instructions. That could send an agent back into starting and claiming work even when the conversation was already underway. **Copy feature brief** now copies the description, checklist, status, owner, and chronological recorded session summaries. Copying does not call the MCP, create a session, claim a feature, or authorize work. Start and sync messages remain optional examples in connection setup.

## Visual design

The diagram distinguishes four kinds of information:

- A forest-green project hub provides the overall context and recorded totals.
- Contributor branches show initials, names, assignment counts, and recorded session counts.
- Feature cards show status, owner, checklist completion, comments, and an expandable session count.
- Dated session records show the contributor, a summary, and recorded commit/file counts. Opening a record reveals the full handoff.

Large contributor branches stack sibling features rather than spreading every feature across one long row. Small teams spread their features across the available width. By-feature mode brings all contributors' sessions for that feature together. A shared feature can appear in multiple contributor branches; these are views of the same feature, not duplicate work. The footer therefore labels instances as feature cards.

Hover and keyboard focus trace the path to a node. Branch focus, full-screen focus, sidebar collapse, pan, zoom, fit, minimap navigation, and the text outline remain available. The initial view favors readable text; Fit project deliberately switches to an overview. Phone layouts stack session records vertically. Type inherits the workspace's Inter family.

## Research used

- [Nielsen Norman Group: Progressive Disclosure](https://www.nngroup.com/articles/progressive-disclosure/) informed showing the overview first and exposing session detail through expansion and the inspector.
- [React Flow: Expand and Collapse](https://reactflow.dev/examples/layout/expand-collapse) informed preserving the complete underlying graph while changing what is visible.
- [React Flow: Custom Nodes](https://reactflow.dev/examples/nodes/custom-node) informed using different visual treatments for different record types. This implementation remains native DOM/SVG; no gated example code was copied and no graph framework was added.

These are design references, not evidence that this UI has undergone a user study. Lines represent saved project relationships, not Git ancestry, contribution quality, effort, or a claim that one session completes a feature.

## Validation

- TypeScript check and full suite: 180 tests across 28 files passed.
- After the responsive layout changes, the 24 directly affected brief, relationship, and layout tests passed again. Layout coverage includes both directions and compact phone stacking, checking that nodes do not overlap or disappear.
- The explicit read-only sample now includes one unfinished feature with three sessions by two contributors. Tests verify project scoping, complete history, chronological brief ordering, and that copying does not mutate data.
- Browser checks covered feature and session inspectors, existing discussions, contributor and feature grouping, branch focus, phone pan, the text outline, and narrow-screen overflow.
- A foreground Chrome clipboard check verified all three saved sessions, both contributors, and the unfinished status without a start-session command.
- Fixed focus handling so pointer focus does not reposition a target before its click completes. Keyboard focus still brings offscreen nodes into view.
