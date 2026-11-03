# Assignment 3: Save data and prove the access rules

Individual · About 90 minutes

Due: 6 pm the day before Session 4, in the cohort timezone.

## Purpose

Distinguish a working screen from reliable storage and correctly restricted access.

Add a small saved-items feature to an earlier app or use the supplied database lab. Design one table and explain who should read and change each row. Use fake users and fake data. Your agent can write SQL; you must be able to explain and test the rule.

## What to do

1. Draw the table with its identifier, owner, content, and creation time. State the read/write rules in plain language before asking for SQL.
2. Run the course SQL lab in a disposable Postgres/Supabase environment, or inspect the browser simulation when cloud access is unavailable. A browser-local saved-items feature plus the real SQL policy lab is a valid core route; wiring a cloud-authenticated app is optional. Do not experiment on an existing personal or production database.
3. With the agent, save an item, refresh/reopen the app, and check that the storage behavior matches the claim. Browser-only storage is not evidence of cross-device persistence.
4. Use the lab's separate users to test own-row access, another user's row, and a logged-out request. Check the database result, not only hidden UI buttons.
5. Inspect the Git diff and deployment configuration for server secrets. Demonstrate a preview deployment or document a local-only result honestly.
6. Before Session 4, discuss possible final-project partners and bring one small user problem to the group-planning activity.

## Submit

- A table sketch and plain-language access rules.
- Evidence of save/read behavior and three access tests, including a denied request.
- A link/run guide, a safe Git checkpoint, and a note explaining which environment you tested.
- One unresolved risk and a proposed next test.

## Evidence checks

- The small data model supports the intended saved-items feature.
- The demonstrated persistence claim is accurate.
- Own-user, other-user, and logged-out access are tested.
- No server secrets are present in browser code, commits, or submitted evidence.
- Cloud, local, and simulated evidence are distinguished honestly.

## Boundaries

- The guided SQL lab is sufficient; building a complete authentication interface is optional.
- Keep Row Level Security on. Never solve a permissions problem by putting a service-role key in client code.
- If you use the browser simulation, it teaches the model but does not establish that a real database policy works. Include the SQL lab output when claiming actual policy enforcement.
- No real personal data, password collection, subscription purchase, or payment processing.

## Presentation

Session 4 opening: show a saved item and one denied access case in 60–90 seconds, or explain a failed test and how you would investigate it.

## Optional extension

Add a timestamped edit or deletion path, with the same access rules and tests.

## Resources

- [What a database stores](https://cs50.harvard.edu/sql/weeks/0/) — Watch only the first ten minutes of Querying, or read the opening transcript. Focus on tables, rows, columns, and questions a database can answer. The rest of the lecture is optional.
- [Supabase database overview](https://supabase.com/docs/guides/database/overview) — Find tables, data, and the security guidance. Treat the dashboard as a way to inspect your data model, not proof that access is restricted correctly.
- [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security) — Read the introductory explanation and own-row policy examples with your agent. Policies belong in the database, not just in hidden buttons. Never expose service-role or secret keys in a browser.
- [Environment variables](https://vercel.com/docs/environment-variables) — Keep server credentials outside Git and browser code. Environment changes require a new deployment. A publishable client identifier and a server secret have different permissions.
- [Deploying to Vercel](https://vercel.com/docs/deployments) — Understand preview versus production, then test the URL on another device. Check account eligibility and current limits; the course does not require buying a plan.
