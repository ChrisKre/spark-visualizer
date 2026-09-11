# Glossary

Spark vocabulary as this project uses it. Defined once, so module copy can stay short.

**Adaptive Query Execution (AQE)** — Spark 3.x re-optimisation that happens *during* execution,
using statistics from stages that have already materialised. Three rules matter here: coalescing
shuffle partitions, switching join strategy, and splitting skewed partitions.

**Broadcast hash join (BHJ)** — the driver collects the small side and ships a copy to every
executor, so no shuffle of the large side is needed. Costs `size × executors` on the network plus
driver heap.

**Coalesce** — reduces partition count by merging partitions *locally*, without a shuffle. Cannot
increase the count, and will not fix skew.

**CPU-seconds** — total executor compute across all tasks. Deliberately shown next to wall clock,
because the gap between them is what skew means.

**Exchange** — the physical plan node representing a shuffle. Stage boundaries are exchanges.

**Executor** — a JVM process on a worker node running tasks in `cores` parallel slots.

**Event log** — the line-delimited JSON `SparkListener` stream Spark writes when
`spark.eventLog.enabled=true`. The Spark UI is a renderer over it, which is why capturing it is
enough for this project.

**GC time** — JVM garbage collection time inside a task. Above roughly 10 % of run time, the
heap is wrong, not the query.

**Liquid Clustering** — Delta's incremental clustering, which avoids committing to partition
columns up front and re-clusters without a full rewrite. Current default recommendation over
Z-ordering for new tables.

**Narrow transformation** — each output partition depends on exactly one input partition
(`filter`, `select`, `withColumn`). Chains inside one stage, no data movement.

**Partition** — a slice of a dataset processed by one task. Not the same thing as a *table
partition* (a directory in storage) — this project uses "shuffle partition" and "table partition"
explicitly to avoid the collision.

**Partition pruning** — skipping table partitions (directories) entirely based on a predicate,
before any file is opened.

**Reserved memory** — a hard-coded 300 MiB carved out of every executor heap before any Spark
memory arithmetic begins. Not configurable.

**Salting** — appending a random suffix to a skewed join key to split its rows across several
partitions, with the other side of the join replicated to match. Trades a little CPU for a much
better distribution.

**Shuffle** — redistributing rows across partitions by key, written to disk by map tasks and
fetched over the network by reduce tasks. `M` map tasks × `R` reducers means `M × R` fetches.

**Shuffled hash join (SHJ)** — both sides shuffled, then a hash table built per partition. No
sort, but needs the build side to fit in execution memory.

**Sort-merge join (SMJ)** — both sides shuffled and sorted, then merged. The strategy that always
works, and usually the one the others are being compared against.

**Spill** — when a task's execution memory is exhausted, its buffers are serialised to local disk
and merged back later. Non-zero spill means re-reading what you already computed.

**Stage** — a set of tasks with no shuffle between them. A stage ends when its **slowest** task
ends — the single most important sentence in this glossary.

**Storage fraction** — `spark.memory.storageFraction`, the share of the unified pool that cached
blocks are *protected* down to. Execution may evict storage above this floor; storage may never
evict execution.

**Straggler ratio** — `max(task duration) / median(task duration)`. The skew diagnostic. Above
about 5, there is a problem.

**Unified memory** — `spark.memory.fraction` × usable heap, shared between execution (shuffles,
joins, sorts, aggregations) and storage (cached blocks).

**Wide transformation** — output partitions depend on many input partitions (`groupBy`, `join`,
`orderBy`, `repartition`). Forces an exchange and therefore a new stage.

**Z-ordering** — Delta's multi-dimensional clustering, interleaving values of several columns so
that min/max file statistics can skip files for predicates on any of them.
