"""SAS-021 — unit tests for 10_reduce.py's dependency-free core, against
testdata/sample_event_log.jsonl. Runs with the stdlib only: `python tools/capture/test_reduce.py`.
No pyspark or live cluster required — see 10_reduce.py's file header for why the core is split out.
"""

from __future__ import annotations

import json
import os
import unittest

from importlib.machinery import SourceFileLoader

# Numeric-prefixed filename ("10_reduce.py") isn't a valid Python identifier, so it can't be
# reached with a normal `import` statement — load it explicitly by path instead.
_HERE = os.path.dirname(os.path.abspath(__file__))
reduce_mod = SourceFileLoader("reduce_core", os.path.join(_HERE, "10_reduce.py")).load_module()

SAMPLE_LOG_PATH = os.path.join(_HERE, "testdata", "sample_event_log.jsonl")


def load_sample_events() -> list:
    with open(SAMPLE_LOG_PATH, "r", encoding="utf-8") as f:
        return [json.loads(line) for line in f if line.strip()]


class RoundingTests(unittest.TestCase):
    def test_round_bytes_to_kib(self):
        self.assertEqual(reduce_mod.round_bytes_to_kib(1600), 2048)
        self.assertEqual(reduce_mod.round_bytes_to_kib(1590), 2048)
        self.assertEqual(reduce_mod.round_bytes_to_kib(0), 0)
        self.assertEqual(reduce_mod.round_bytes_to_kib(700), 1024)  # rounds to nearest, not down
        self.assertEqual(reduce_mod.round_bytes_to_kib(300), 0)  # rounds to nearest, not up

    def test_round_ms(self):
        self.assertEqual(reduce_mod.round_ms(41.4), 41)
        self.assertEqual(reduce_mod.round_ms(41.6), 42)


class ReduceTaskEventsTests(unittest.TestCase):
    def setUp(self):
        self.events = load_sample_events()
        self.reduced = reduce_mod.reduce_task_events(self.events)

    def test_keeps_every_task_record_below_the_cap(self):
        # Rule 1: every SparkListenerTaskEnd in the sample becomes exactly one task, in order,
        # with no averaging/smoothing across them.
        task_ids = [t["taskId"] for t in self.reduced["tasks"]]
        self.assertEqual(task_ids, [0, 1, 2, 3])
        self.assertIsNone(self.reduced["samplingRatio"])  # below the 10,000-task cap

    def test_drops_heartbeats_and_block_manager_events(self):
        # Rule 2: the sample log has 2 block-manager events and 2 heartbeats; none of them
        # produced a task record (parse_task_end only recognizes SparkListenerTaskEnd).
        self.assertEqual(len(self.reduced["tasks"]), 4)

    def test_keeps_the_environment_config_snapshot(self):
        # Rule 2's exception: SparkListenerEnvironmentUpdate is kept, not dropped.
        env = reduce_mod.extract_environment_snapshot(self.events)
        self.assertIsNotNone(env)
        self.assertEqual(env["spark.sql.shuffle.partitions"], "200")

    def test_rounds_bytes_to_nearest_kib(self):
        task0 = next(t for t in self.reduced["tasks"] if t["taskId"] == 0)
        self.assertEqual(task0["inputBytes"], 2048)  # 1600 -> nearest KiB
        self.assertEqual(task0["shuffleWriteBytes"], 2048)

    def test_derives_status_from_spill_and_failure_reason(self):
        by_id = {t["taskId"]: t for t in self.reduced["tasks"]}
        self.assertEqual(by_id[0]["status"], "ok")
        self.assertEqual(by_id[2]["status"], "spilled")  # Disk Bytes Spilled > 0
        self.assertEqual(by_id[3]["status"], "oom")  # OutOfMemoryError failure reason


class DownsampleTests(unittest.TestCase):
    def _synthetic_tasks(self, n: int) -> list:
        # Durations 0..n-1 ms, so "fastest"/"slowest" deciles are unambiguous by construction.
        return [{"taskId": i, "launchMs": 0, "finishMs": i} for i in range(n)]

    def test_below_cap_returns_every_task_unchanged(self):
        tasks = self._synthetic_tasks(500)
        sampled, ratio = reduce_mod.downsample(tasks, cap=10_000)
        self.assertEqual(len(sampled), 500)
        self.assertIsNone(ratio)

    def test_above_cap_keeps_fastest_and_slowest_deciles_and_records_ratio(self):
        n = 12_000
        tasks = self._synthetic_tasks(n)
        sampled, ratio = reduce_mod.downsample(tasks, cap=10_000)

        self.assertLessEqual(len(sampled), 10_000)
        self.assertIsNotNone(ratio)
        self.assertAlmostEqual(ratio, len(sampled) / n, places=6)

        decile = n // 10
        sampled_ids = {t["taskId"] for t in sampled}
        # Every task in the fastest decile (ids 0..decile-1) and slowest decile
        # (ids n-decile..n-1) must survive downsampling in full.
        for task_id in range(decile):
            self.assertIn(task_id, sampled_ids)
        for task_id in range(n - decile, n):
            self.assertIn(task_id, sampled_ids)


if __name__ == "__main__":
    unittest.main()
