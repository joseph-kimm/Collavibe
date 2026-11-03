# Assignment 2: Make two APIs useful together

Individual, with a peer tester · About 105 minutes

Due: 6 pm the day before Session 3, in the cohort timezone.

## Purpose

Understand how data is requested, combined, interpreted, and shown to a person.

Build an app in which two real APIs contribute to one coherent user task. Browse the public-apis GitHub directory for ideas, then check each provider's own documentation. Two unrelated panels do not count as a meaningful combination. Two independent datasets from the same provider are allowed; two requests to the same dataset, or adding geocoding alone, are not the aim.

## What to do

1. Choose a user question and explain why answering it needs both datasets. Start with a guided pair below if you are new.
2. Complete an API check for each provider: endpoint, useful fields, authentication, current free-use conditions, rate limits, attribution, CORS, and a sample response.
3. Use fixed sample data to sketch the interface first. Keep the sample visibly labeled until real requests work.
4. Fetch a small result from each API. Join on a justified shared key such as location/time; otherwise present distinct results and explain their relationship. Do not join records only because the first result looks similar.
5. Show where data came from, units, relevant time, and any missing coverage. Match coordinates/timezones before comparing weather and air data.
6. Test normal results, an empty search, a missing field, one unavailable provider, and rapid repeated clicks. Keep the working part usable when one service fails.
7. Ask a partner to explain what the data means. Revise one misleading label, assumption, or display.

## Submit

- Working app or an explicitly labeled offline demonstration, repository/run instructions, and a two-minute demo.
- A short API check for both services, with links to primary documentation and the date checked.
- A request-to-screen diagram and a note explaining how the datasets relate.
- Five test results, the partner's interpretation, and one change you made.

## Evidence checks

- Both datasets help with the same meaningful user task.
- The app makes two documented API requests or clearly reports a provider outage.
- Sources, units, time, coverage, and joining assumptions are explained.
- Empty, partial, missing-field, and failed responses have deliberate behavior.
- Requests are bounded; provider terms, attribution, secrets, and privacy are handled.

## Boundaries

- Use read-only public data. No paid API, billing card, scraping, private-data upload, or provider signup is required for the guided option.
- Use one explicit search/refresh action, bounded results, caching where appropriate, and a timeout. Do not poll continuously or fire requests on every keystroke.
- If a provider blocks the browser, use your app's server with a fixed upstream allowlist. Never build an unrestricted URL proxy or disable browser security.
- Data is not automatically accurate or complete. Do not turn this exercise into medical, financial, or other high-stakes advice.
- An offline fixture is a fallback, not evidence that a live API succeeded. Label its source and capture time and tell the instructor what failed.

## Presentation

Session 3: two minutes per learner. Show the combined user task, trace one response into the screen, and demonstrate one failure case. No slide deck required.

## Optional extension

Add a second location or an accessible comparison chart only after the two-source failure cases work.

## Resources

- [Public APIs directory](https://github.com/public-apis/public-apis) — Browse by interest. A directory listing is not a guarantee of free access, current availability, browser support, or permission to reuse data. Check the provider itself before choosing.
- [HTTP: requests and responses](https://cs50.harvard.edu/x/shorts/http/) — Watch the HTTP short, or read its transcript. Focus on requests, responses, and status codes; memorizing protocol details is unnecessary.
- [Inspect one network request](https://developer.chrome.com/docs/devtools/network/) — Open the Network panel, trigger one search, and inspect its URL, status, and response. Stop there; the advanced performance material is optional.
- [Weather API documentation](https://open-meteo.com/en/docs) — Use the forecast endpoint for the guided assignment. Check units, timezone, timestamps, attribution, and current non-commercial usage limits. No key is needed for this course's non-commercial example.
- [Air Quality API documentation](https://open-meteo.com/en/docs/air-quality-api) — A separate API/dataset for the same location and time. Identify the air-quality measure and its units. It is modeled data, not a personal sensor reading or medical recommendation.
- [Book metadata search](https://openlibrary.org/dev/docs/api/search) — Search works and editions with a small result limit. Missing authors or covers are normal. A book title alone is not a reliable unique identifier.
- [Project Gutenberg metadata API](https://gutendex.com/) — Use a small search result to complement Open Library. Keep separate result lists unless a match can be justified. Copyright availability varies by jurisdiction; do not promise every work is free everywhere.
