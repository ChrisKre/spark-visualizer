# ADR-0002 — No Spark, and no PySpark, in the browser

- **Status:** accepted
- **Date:** 2026-09-11

## Context

An obvious-sounding feature is "run real PySpark in the browser via Pyodide". It would be a
strong differentiator if it were possible.

## Decision

The client never executes Spark. Pyodide is not in the v1.0 or v1.1 dependency graph. No copy
anywhere on the site implies that Spark is running locally.

## Rationale

PySpark is a thin Py4J client to a JVM process. Spark itself is Scala on the JVM. There is no
practical WebAssembly JVM path, and no amount of Pyodide packaging changes that — importing
`pyspark` in Pyodide gets you a client with nothing to connect to.

The reputational asymmetry decides it. An architect reading the site will test that claim within
seconds. If it is false, every other number on the site becomes suspect, including the ones that
are real. The cost of the false claim exceeds any benefit the feature could deliver.

## Consequences

- Distributed behaviour is **modelled** (`packages/sim`) and **replayed** (`packages/fixtures`).
  See ADR-0003.
- Real computation in the browser is provided by DuckDB-WASM instead, which is genuinely a real
  engine over genuinely real Parquet — see ADR-0004.
- Copy discipline: the words "runs Spark in your browser" must not appear. The README states the
  constraint in its second section, deliberately early.
- Pyodide may return in v2.0+ for *editable Python syntax* in a code pane, clearly labelled as
  not executing against a cluster. That is a different feature and needs its own ADR.
