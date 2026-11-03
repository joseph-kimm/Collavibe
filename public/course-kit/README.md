# Vibecode 101 course kit

Use this with the full briefs at https://collavibe.vercel.app/course.

## Two-API starter

Run a simple static server in this folder (your agent can help), then open `api-starter/`. For example, with Python installed: `python3 -m http.server 8000`, then open http://localhost:8000/api-starter/ . Opening HTML directly as a file may behave differently for browser requests.

Choose live requests or explicitly synthetic fixtures and press **Load both datasets**. Nothing polls automatically. Requests go only to the two documented Open-Meteo HTTPS services, with no key. The partial-failure controls skip a service deliberately. Errors never silently become fake live data.

Read `app.js`, trace the fields, adapt the user task, and make your own tested change. Submitting the starter unchanged does not satisfy the assignment. Check current API access/usage/attribution terms before reusing it outside a non-commercial course.

## Storage and permissions

`storage-lab/` is a browser simulation using fictional localStorage data. It is not real authentication or authorization. The **Inspect all fictional rows** panel deliberately shows why hiding rows in a screen is not security.

`database-lab.sql` is a separate real PostgreSQL/Supabase RLS exercise. In a disposable Supabase project's SQL editor, inspect the script with your agent, then run the entire script as postgres. It uses fake UUIDs with separate caller roles, tests allowed/denied access, and ends with ROLLBACK. Record the PASS outputs; do not claim this transaction creates a persistent deployed app. If it stops early, run ROLLBACK before retrying. Never use a personal/production database for this exercise.

If cloud access is blocked, the facilitator can demonstrate this SQL lab or run it in a local PostgreSQL environment with the appropriate role/auth helper setup. Use the browser simulation to explain the model, but label it as simulated evidence.

## Assignment 3 scope

A browser-local saved-items feature plus the SQL policy lab is a valid core route. Explain that browser persistence is local to that browser/device. Wiring a cloud-authenticated saved-items app is optional, not a hidden requirement in a 90-minute exercise.

## Safety and evidence

Use fake records. No paid API, billing card, real credentials, or personal-data upload is needed. Screenshots and reflections must exclude keys. Explain expected versus actual results, including outages and local-only behavior. The supplied fixtures are fictional teaching values; they are not current weather or air-quality observations.
