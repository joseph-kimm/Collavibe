# Assignment 5: Build, test, and explain a group app

Teams of two or three; individual reflection · About 150 minutes

Due: 72 hours after Session 5 ends; demo-ready candidate 24 hours before Session 5 starts.

## Purpose

Demonstrate a small working product and a collaborative process that another person can understand.

Build the single journey in your approved charter. Use at least one external API or a persistent data store. The important work is directing the agent, testing the result, making decisions together, and handing off context.

## What to do

1. Before Session 5, finish a narrow release candidate and submit a draft/demo-ready version at least 24 hours before class. Split the work fairly; each member should budget about 2–2.5 hours, not 2.5 hours of mandatory synchronized meetings.
2. Use separate coding-agent sessions. Each person begins by reading relevant context and ends by saving a factual handoff. Write your own short journal note; do not ask the agent to invent what you learned.
3. Review proposed tickets before treating them as assigned work. Inspect a branch or diff and run the relevant checks before merging.
4. Ask someone outside your building pair to attempt the main task. Capture the observation and revise or explain why you did not change the design.
5. Run the acceptance matrix: normal journey, empty input/data, failed dependency, logged-out/unauthorized behavior if applicable, keyboard, and a phone-width layout. Record actual results.
6. Prepare an eight-minute showcase slot: five-minute demonstration and explanation, then three minutes of questions. Every member contributes; agree an accessible speaking/written role.
7. After showcase feedback, make one final revision or document why you retained the design. Submit the final package within 72 hours after Session 5 ends.

## Submit

- The app URL or reproducible local run instructions. Include a 1–2-minute captioned demo or an equivalent written walkthrough with screenshots that shows one journey and one decision.
- Repository access or an agreed source snapshot for the organizer. Keep a private repository private when submitting.
- The charter, final scope, architecture sketch, dependency and data source notes, and setup instructions without real keys.
- The acceptance matrix, one outsider test, changes after feedback, and known limitations.
- Selected Collavibe handoffs or tickets that explain the sequence of decisions.
- Each member's portfolio covering the three individual builds and final team project. Include the four project summaries or a reviewed portfolio link with your private submission.
- Each member's 150–250-word personal reflection or equivalent 1–2-minute spoken account covering one decision, one revision, what you can now explain, and what remains uncertain.

## Evidence checks

- One coherent user journey works in the environment described.
- Testing includes failures and permissions where relevant, with honest limitations.
- The group can explain architecture, data choices, and a consequential decision.
- Handoffs and reviewed work let another person continue; roles are meaningful.
- User and showcase feedback led to a reasoned revision or a documented choice.
- The demo, run guide, and reflection make both product and process understandable.

## Boundaries

- No payment processing, regulated advice, sensitive personal data, custom model training, native mobile release, or large multi-role platform in the core project.
- No mandatory public posting. A private demonstration, written story, or limited-access video can satisfy communication requirements.
- Do not compare effort through commits, line counts, timers, or AI-generated contribution scores. Review work and learning through evidence and conversation.
- A broken live service does not erase learning: show the labeled fallback, the failure evidence, and the next test. Do not present cached data as live.
- Recording or inviting an outside audience requires participants' agreement. The facilitator arranges an internal audience if public sharing is not appropriate.

## Presentation

Session 5 gives four teams eight minutes each, with eight minutes for transitions and shared feedback. Extra teams require a parallel showcase or a longer session; do not silently shorten everyone's participation.

## Optional extension

Only after the required journey passes: add a second tested workflow, improve accessibility, or prepare an explicitly reviewed public portfolio.

## Resources

- [A first accessibility review](https://www.w3.org/WAI/test-evaluate/easy-checks/) — Try keyboard navigation, visible focus, labels, headings, text resize, and meaningful image alternatives. These checks help find problems; they do not certify accessibility compliance.
- [Practice a branch and pull request](https://docs.github.com/en/get-started/using-github/hello-world) — Complete the Hello World exercise through a pull request. It works in the browser and does not require programming or a terminal.
- [Environment variables](https://vercel.com/docs/environment-variables) — Keep server credentials outside Git and browser code. Environment changes require a new deployment. A publishable client identifier and a server secret have different permissions.
- [Deploying to Vercel](https://vercel.com/docs/deployments) — Understand preview versus production, then test the URL on another device. Check account eligibility and current limits; the course does not require buying a plan.
