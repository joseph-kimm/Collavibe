# Collavibe visual system

All application and public pages use the locally hosted Inter variable family. Normal and italic files come from @fontsource-variable/inter 5.3.0; the OFL license is in public/fonts. No third-party font request is required. Code, file paths, and terminal commands retain the system monospace stack.

Typography lives in public/typography.css, imported by the common styles.css entry point. Every page preloads the normal face. Use 400 for prose, 500 for controls and navigation, and 600 for headings. The shared scale is 14px metadata, 15px interface text, 16px body, 18px emphasis, 20px section titles, and 24px workspace titles. Public page titles scale responsively. Reading content has more line spacing than controls.

The existing forest green remains the action color. Use pale sage for selected surfaces, white for working content, and the shared muted/ink tokens for text. Controls use 7px corners. Tree and Outline share the same segmented-button treatment, including hover and selected states.

Tree cards have explicit dimensions matched to their typography. Keep titles, metadata, and actions inside those bounds. Narrow screens open at a readable scale; Fit project is an explicit overview action. Panning, branch focus, and Outline are available for larger projects.

## Audit scope, November 16

Reviewed the homepage/account form, course, cohort forum, public forum, blog, examples, public project and learner portfolios, and workspace map/outline, work, tickets, sessions, meetings, repository, team, portfolio, inspector, and connection dialog. Checked real populated public pages after deployment as well as local demo states. Checked shared font-family values and horizontal overflow at desktop and mobile browser widths. Physical device testing is not implied.

Corrections include removal of the serif display font, consistent variable-font weights, more compact workspace headers, aligned public navigation, readable tree labels, consistent selected-button hover contrast, and mobile tree starting scale. The downloadable standalone API exercise retains its self-contained system-font stylesheet so it works away from the website.

Validation: TypeScript passed. All 177 tests passed with two workers after the default parallel run encountered resource/time-limit failures. Tree layout tests passed again after card sizing changes. Detailed browser evidence is saved locally under output/audit/visual-system.
