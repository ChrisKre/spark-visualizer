# ADR-0004 — DuckDB-WASM, lazy-loaded, deferred to v1.1

- **Status:** accepted
- **Date:** 2026-09-11

## Context

DuckDB-WASM can execute real SQL over real Parquet in the browser, including remote Parquet via
HTTP range requests. It is the only way to make the analytics pane genuinely honest rather than
a rendering of pre-computed results.

It also weighs roughly 3 MB of JS plus a ~35 MB wasm bundle.

## Decision

Adopt it, but:

1. **Not in v1.0.** The MVP ships two modules and a 60-second story. A query pane is not on the
   critical path to that.
2. **Never in the initial bundle.** It loads behind an explicit user action via
   `await import('@duckdb/duckdb-wasm')`, with its own progress indicator.
3. **Its own provenance badge**, `EXECUTED`, distinct from `MEASURED` and `MODELED`.

## Rationale

The 30-second visitor — the primary audience — will never run a query. Making them pay 38 MB for
a feature they will not use taxes exactly the person the project is trying to reach.

Deferring it also sequences the work sensibly: v1.0 proves the visualisation thesis, v1.1 makes
the compute real. If v1.0 lands badly, the 38 MB was never spent.

## Consequences

- The M6 Delta module depends on this and therefore cannot ship before v1.1 infrastructure exists.
- A fallback is required: on browsers where DuckDB fails to initialise, the query pane shows a
  static pre-computed result table, labelled as such.
- The fat Parquet dataset needs a bucket with CORS, `Accept-Ranges: bytes` and a long
  `Cache-Control`. That is an infrastructure ticket, not an app ticket.
- The bytes-transferred counter is the feature's actual payload — a real measurement of column
  pruning. Build the counter, not just the query box.
