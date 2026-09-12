"""SAS-021 — turns a raw Spark event log into a reduced fixture. See docs/FIXTURES.md §3.

Split in two, deliberately:

  (a) A dependency-free "core" (everything below `# --- core ---`) implementing the four
      reduction rules verbatim, operating on plain dicts parsed via the stdlib `json` module.
      Zero third-party imports, so it is unit-testable (see test_reduce.py) without installing
      pyspark — there is no cluster to validate the pyspark half against in this pass.
  (b) A thin pyspark CLI (`if __name__ == "__main__":`) that reads a real event-log directory and
      calls the core. This half genuinely needs pyspark and a real event log; it is a documented
      sketch, not exercised here.

Reduction rules (docs/FIXTURES.md §3):
  1. Keep every task record. Never smooth it.
  2. Drop executor heartbeats, block-manager events, and anything environment-scoped except the
     config snapshot.
  3. Round byte counts to the nearest KiB and times to the nearest ms.
  4. Above ~10,000 tasks, downsample by keeping all tasks in the slowest and fastest deciles and a
     uniform sample of the middle, recording `samplingRatio` in the header.
"""

from __future__ import annotations

from typing import Any, Iterable, Optional

# --- core --------------------------------------------------------------------------------------

KIB = 1024

# Rule 2 — events dropped outright. `SparkListenerEnvironmentUpdate` is deliberately NOT in this
# set: it is the config snapshot the rule explicitly keeps (see extract_environment_snapshot).
DROPPABLE_EVENTS = {
    "SparkListenerExecutorMetricsUpdate",  # heartbeats
    "SparkListenerBlockManagerAdded",
    "SparkListenerBlockManagerRemoved",
    "SparkListenerBlockUpdated",
    "SparkListenerExecutorAdded",
    "SparkListenerExecutorRemoved",
}

DOWNSAMPLE_CAP = 10_000


def round_bytes_to_kib(n: float) -> int:
    """Rule 3 — round a byte count to the nearest KiB."""
    return round(n / KIB) * KIB


def round_ms(n: float) -> int:
    """Rule 3 — round a duration to the nearest ms."""
    return round(n)


def parse_task_end(event: dict) -> Optional[dict]:
    """Extracts one task record from a `SparkListenerTaskEnd` event, or `None` for any other
    event kind. Field names match the real Spark event-log schema (docs/FIXTURES.md §3)."""
    if event.get("Event") != "SparkListenerTaskEnd":
        return None

    info = event.get("Task Info") or {}
    metrics = event.get("Task Metrics") or {}
    if not info or not metrics:
        return None

    shuffle_read = metrics.get("Shuffle Read Metrics") or {}
    shuffle_write = metrics.get("Shuffle Write Metrics") or {}
    input_metrics = metrics.get("Input Metrics") or {}
    end_reason = str(event.get("Task End Reason", ""))

    disk_spilled = metrics.get("Disk Bytes Spilled", 0)
    status = "oom" if "OutOfMemory" in end_reason else ("spilled" if disk_spilled > 0 else "ok")

    return {
        "taskId": info.get("Task ID"),
        "stageId": event.get("Stage ID"),
        "partitionId": info.get("Index", 0),
        "launchMs": round_ms(info.get("Launch Time", 0)),
        "finishMs": round_ms(info.get("Finish Time", 0)),
        "inputBytes": round_bytes_to_kib(input_metrics.get("Bytes Read", 0)),
        "shuffleReadBytes": round_bytes_to_kib(shuffle_read.get("Remote Bytes Read", 0) + shuffle_read.get("Local Bytes Read", 0)),
        "shuffleWriteBytes": round_bytes_to_kib(shuffle_write.get("Shuffle Bytes Written", 0)),
        "fetchWaitMs": round_ms(shuffle_read.get("Fetch Wait Time", 0)),
        "gcMs": round_ms(metrics.get("JVM GC Time", 0)),
        "memorySpilledBytes": round_bytes_to_kib(metrics.get("Memory Bytes Spilled", 0)),
        "diskSpilledBytes": round_bytes_to_kib(disk_spilled),
        "peakExecutionMemoryBytes": round_bytes_to_kib(metrics.get("Peak Execution Memory", 0)),
        "status": status,
    }


def extract_environment_snapshot(events: Iterable[dict]) -> Optional[dict]:
    """Rule 2's exception: `SparkListenerEnvironmentUpdate` is kept, not dropped."""
    for event in events:
        if event.get("Event") == "SparkListenerEnvironmentUpdate":
            return event.get("Spark Properties") or {}
    return None


def downsample(tasks: list, cap: int = DOWNSAMPLE_CAP) -> "tuple[list, Optional[float]]":
    """Rule 4. Below `cap`, returns every task unchanged and `samplingRatio=None` (not sampled).
    Above `cap`, keeps every task in the slowest and fastest deciles and takes a uniform sample of
    the middle, returning the achieved ratio."""
    n = len(tasks)
    if n <= cap:
        return tasks, None

    by_duration = sorted(tasks, key=lambda t: t["finishMs"] - t["launchMs"])
    decile = max(1, n // 10)
    fastest = by_duration[:decile]
    slowest = by_duration[-decile:] if decile < n else []
    middle = by_duration[decile:-decile] if decile < n else []

    middle_target = max(0, cap - len(fastest) - len(slowest))
    if middle_target >= len(middle):
        sampled_middle = middle
    else:
        step = len(middle) / middle_target
        sampled_middle = [middle[int(i * step)] for i in range(middle_target)]

    sampled = fastest + sampled_middle + slowest
    return sampled, len(sampled) / n


def reduce_task_events(raw_events: Iterable[dict]) -> dict:
    """The core entry point: raw event dicts in -> `{"tasks": [...], "samplingRatio": ...}` out."""
    tasks = []
    for event in raw_events:
        if event.get("Event") in DROPPABLE_EVENTS:
            continue
        task = parse_task_end(event)
        if task is not None:
            tasks.append(task)

    sampled_tasks, sampling_ratio = downsample(tasks)
    return {"tasks": sampled_tasks, "samplingRatio": sampling_ratio}


# --- pyspark CLI (sketch; needs a real event log — not exercised in this pass) ------------------

if __name__ == "__main__":
    import argparse
    import json
    import sys

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--events-dir", required=True, help="dbfs:/tmp/spark-events/app-... or a local path")
    parser.add_argument("--out", required=True, help="packages/fixtures/data/<id>.json")
    args = parser.parse_args()

    try:
        from pyspark.sql import SparkSession  # noqa: PLC0415 - only needed for the CLI path
    except ImportError:
        print("pyspark is required to run this CLI; see tools/capture/requirements.txt", file=sys.stderr)
        raise SystemExit(1)

    spark = SparkSession.builder.appName("10_reduce").getOrCreate()
    # Each line of a Spark event log is one JSON event; spark.read.json parses NDJSON directly.
    raw_events: list[dict] = [row.asDict(recursive=True) for row in spark.read.json(args.events_dir).collect()]

    reduced = reduce_task_events(raw_events)
    environment = extract_environment_snapshot(raw_events)

    # NOTE: this CLI does not yet reconstruct `plan`/`stages` from
    # SparkListenerSQLExecutionStart + SparkListenerDriverAccumUpdates (docs/FIXTURES.md §3) — a
    # real capture session needs that wiring added here before `--out` is a complete fixture. The
    # tested, dependency-free half (task reduction rules 1-4) is what this pass proves out.
    print(f"Reduced {len(raw_events)} events -> {len(reduced['tasks'])} tasks "
          f"(samplingRatio={reduced['samplingRatio']}). Environment keys: "
          f"{sorted(environment.keys()) if environment else 'none found'}")
    print("Plan/stage reconstruction is not implemented yet — see the note above.", file=sys.stderr)

    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(reduced, f, indent=2)
