# ADR-0006 — No backend, ever

- **Status:** accepted
- **Date:** 2026-09-11

## Context

Several tempting features imply a server: a leaderboard for challenge mode, saved scenarios,
usage analytics with segmentation, on-demand Spark runs, an event-log upload endpoint.

## Decision

The deployed artefact is static files on a CDN. No API routes, no middleware, no ISR, no database,
no authentication. `output: 'export'` in `next.config.js` makes this a build-time error rather
than a discipline.

## Rationale

1. **Availability is the feature.** The primary audience gives the site thirty seconds. A static
   CDN artefact is up, instantly, forever, at zero cost. Every backend is a thing that can be
   down while a hiring manager is looking at it.
2. **Cost.** A portfolio project that bills monthly gets switched off eventually, and then the
   link in the CV is dead.
3. **Abuse surface.** Any public endpoint that triggers computation is an endpoint someone will
   abuse.
4. **Forkability.** Anyone can clone the repo and deploy it. That matters for a project whose
   audience is engineers.

## Consequences

- Challenge-mode scores are local and shareable by permalink, not a global leaderboard. The
  scenario and the result encode into the URL; bragging works by sending the link.
- Saved scenarios are URLs, not rows in a database. This is better anyway — see APP_STATE.md §3.
- Analytics are cookieless and event-only (Plausible or equivalent), enough to learn which module
  to build next and nothing more.
- **Bring your own event log** (v2.0) parses the uploaded file in a Web Worker, entirely
  client-side. Nothing is transmitted, and the UI says so plainly — which is also the more
  trustworthy design for someone dropping in a production log.
- If a feature genuinely requires a server, the answer is that the feature is out of scope. Do
  not litigate it in a PR; open an ADR superseding this one.
