# Exploring a project

The Project map has two views. **Tree** is a connected diagram; **Outline** is a reading-oriented alternative. Both use the same recorded features, contributors and sessions. The connections are work relationships, not Git ancestry or effort measurements.

- **By contributor** groups work by stable account ID, including shared features in each person's branch. Unassigned work stays visible.
- **By feature** groups sessions directly beneath their feature.
- Use the small **+ / −** controls on nodes to expand or collapse children. **Expand all / Collapse all** operate on the current project tree.
- **Focus branch** isolates a person's or feature's subtree. **Entire project** returns to the full filtered tree.
- Drag empty canvas space to pan. Use zoom buttons, Ctrl/Meta-wheel, or trackpad pinch to zoom. **Fit project** fits the visible tree; the percentage button returns to actual size. Click the overview in the lower right to navigate.
- With the canvas focused, arrow keys pan, plus/minus zoom, and zero fits. Node controls are normal keyboard-accessible buttons. The outline remains available at narrow widths.
- **Focus tree** hides the surrounding workspace. **Exit focus** restores it. Escape first closes an open inspector, then exits focus.
- The sidebar button in the top bar toggles navigation on desktop; the preference persists on this device. Command/Control-backslash is the shortcut. Mobile keeps its existing navigation drawer.

## Comments and details

Open a feature to inspect its description, owner, checklist, sessions and discussion. The Comments button on a feature jumps straight to its discussion and composer. Feature comments retain the existing author/owner permissions and archived-work restrictions.

Expand a feature to see sessions. Open a session for its handoff and Git evidence. **Discuss** opens ordinary session questions and replies, separate from the learning journal. These comments stay team-private and are not included in published portfolios. Authors and the team owner can remove them. Removing a root discussion prevents additional replies to its existing children.

Session discussion drafts survive navigation between nodes within the current page. Use **Refresh discussion** to load a teammate's latest reply without discarding those drafts. Unsubmitted drafts are not guaranteed across browser reloads. A shared session link opens the inspector and expands its ancestor path in the tree.

## Verification for the November 16 release

- TypeScript and full automated suite: 177 tests in 27 files passed.
- Tree tests cover stable keys, real parent-child relationships, unassigned and unlinked records, both layout directions without node overlap, collapse preservation, bounded zoom and cursor-centered zoom math.
- Session comment tests cover real actor attribution, replies, private portfolio exclusion, missing/deleted parents, outsiders, archived projects and invalid text. HTTP tests cover authenticated creation, replies and anonymous/outsider denial.
- Browser checks include sidebar preference/reload, focus enter/exit, branch focus, directions, grouping, outline, expansion, zoom, keyboard pan, and 390px/320px widths without page overflow.
- A live labeled test question by Shayan and reply by Shani were saved through separate browser accounts and read back after reload.

The canvas is a project overview. Large projects require zooming or branch focus to read individual nodes. Mobile was tested with browser viewport sizes, not physical-device certification. No new repository or account permissions are required by this release.
