"""SAS-025 — unit tests for calibrate.py's pure numeric helpers, independent of any committed
fixture. Runs with the stdlib + numpy only: `python tools/capture/calibrate_test.py`.
"""

from __future__ import annotations

import math
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import calibrate as calib  # noqa: E402 - needs sys.path adjusted first


def make_run_config(executor_memory_mib=8192, memory_fraction=0.6, cores_per_executor=4, bytes_per_row=2000):
    return {
        "cluster": {
            "executors": 8,
            "coresPerExecutor": cores_per_executor,
            "executorMemoryMiB": executor_memory_mib,
            "memoryFraction": memory_fraction,
            "storageFraction": 0.5,
        },
        "sql": {"shufflePartitions": 200, "autoBroadcastJoinThresholdMiB": 10, "adaptive": {"enabled": True}},
        "data": {"rows": 1000, "keyCardinality": 200, "zipfAlpha": 0, "nullFraction": 0, "bytesPerRow": bytes_per_row, "saltFactor": 1},
        "query": {"kind": "aggregate"},
    }


def make_task(**overrides):
    task = {
        "taskId": 0,
        "stageId": 0,
        "slot": 0,
        "partitionId": 0,
        "launchMs": 0,
        "finishMs": 10,
        "inputBytes": 0,
        "shuffleReadBytes": 0,
        "shuffleWriteBytes": 0,
        "fetchWaitMs": 0,
        "gcMs": 0,
        "memorySpilledBytes": 0,
        "diskSpilledBytes": 0,
        "peakExecutionMemoryBytes": 0,
        "status": "ok",
        "rows": 100,
    }
    task.update(overrides)
    return task


class ExecutionCeilingBytesTests(unittest.TestCase):
    def test_matches_hand_computed_value(self):
        # Mirrors packages/sim/model/memory.ts's executionCeilingPerTask exactly:
        # usableMiB = 8192-300 = 7892; unifiedMiB = 7892*0.6 = 4735.2; ceilingMiB = 4735.2/4.
        config = make_run_config(executor_memory_mib=8192, memory_fraction=0.6, cores_per_executor=4)
        expected_mib = (8192 - 300) * 0.6 / 4
        self.assertAlmostEqual(calib.execution_ceiling_bytes(config), expected_mib * calib.MIB, places=3)

    def test_zero_or_negative_usable_memory_floors_at_zero(self):
        config = make_run_config(executor_memory_mib=300, memory_fraction=0.6, cores_per_executor=4)
        self.assertEqual(calib.execution_ceiling_bytes(config), 0.0)


class HeapPressureAndSpillMergeTests(unittest.TestCase):
    def test_heap_pressure_clamped_at_1_4(self):
        # peak far exceeds ceiling -> clamps, doesn't grow unbounded.
        self.assertEqual(calib._heap_pressure(make_task(peakExecutionMemoryBytes=1000), ceiling_bytes=1), 1.4)

    def test_heap_pressure_linear_below_clamp(self):
        self.assertAlmostEqual(calib._heap_pressure(make_task(peakExecutionMemoryBytes=50), ceiling_bytes=100), 0.5)

    def test_heap_pressure_defaults_to_1_4_when_ceiling_non_positive(self):
        self.assertEqual(calib._heap_pressure(make_task(peakExecutionMemoryBytes=50), ceiling_bytes=0), 1.4)

    def test_spill_merge_passes_zero_when_not_spilling(self):
        self.assertEqual(calib._spill_merge_passes(make_task(memorySpilledBytes=0), ceiling_bytes=100), 0.0)

    def test_spill_merge_passes_ceils_the_ratio(self):
        # spillBytes=250, ceiling=100 -> 2.5 -> ceil -> 3.
        self.assertEqual(calib._spill_merge_passes(make_task(memorySpilledBytes=250), ceiling_bytes=100), 3.0)

    def test_spill_merge_passes_at_least_one_when_spilling(self):
        # spillBytes=10, ceiling=100 -> 0.1 -> ceil -> 1, not 0 (max(1, ...) in the source).
        self.assertEqual(calib._spill_merge_passes(make_task(memorySpilledBytes=10), ceiling_bytes=100), 1.0)


class ThroughOriginOlsTests(unittest.TestCase):
    def test_recovers_an_exact_linear_relationship(self):
        features = [1.0, 2.0, 3.0, 4.0]
        targets = [3.0, 6.0, 9.0, 12.0]  # y = 3x exactly
        self.assertAlmostEqual(calib._through_origin_ols(features, targets), 3.0, places=9)

    def test_returns_zero_for_an_empty_or_all_zero_feature_set(self):
        self.assertEqual(calib._through_origin_ols([], []), 0.0)
        self.assertEqual(calib._through_origin_ols([0.0, 0.0], [5.0, -5.0]), 0.0)

    def test_least_squares_minimizes_noisy_residuals(self):
        # y = 2x + small symmetric noise; through-origin OLS should recover ~2.0.
        features = [1.0, 2.0, 3.0, 4.0, 5.0]
        targets = [2.1, 3.9, 6.2, 7.8, 10.1]
        self.assertAlmostEqual(calib._through_origin_ols(features, targets), 2.0, delta=0.1)


class ModeledBaseMsTests(unittest.TestCase):
    """A direct regression test against the additive formula itself — this is exactly the class
    of bug (a missing unit-conversion factor) that a real fixture-driven test caught during
    development; asserting the formula against hand-computed numbers here catches it for free."""

    def test_matches_hand_computed_value_for_a_simple_map_task(self):
        config = make_run_config(bytes_per_row=1000)
        constants = {
            "DESERIALIZE_MS_PER_TASK": 2.0,
            "READ_THROUGHPUT_MBPS": 400.0,
            "CPU_NS_PER_ROW": 50.0,
            "SORT_NS_PER_ROW_LOG": 20.0,
            "SHUFFLE_WRITE_THROUGHPUT_MBPS": 150.0,
            "SPILL_WRITE_THROUGHPUT_MBPS": 200.0,
            "SPILL_READ_THROUGHPUT_MBPS": 250.0,
            "SPILL_MERGE_COST_MS": 5.0,
            "GC_BASE_MS": 50.0,
        }
        one_mib_bytes = calib.MIB
        task = make_task(stageId=0, rows=1000, inputBytes=one_mib_bytes, shuffleWriteBytes=one_mib_bytes)
        fixture = {"plan": {"final": {"kind": "SortMergeJoin"}}, "runConfig": config}

        expected = (
            2.0  # deserialize
            + (1.0 / 400.0) * 1000  # readMs: 1 MiB / 400 MBps, in ms
            + (1000 * 50.0) / 1e6  # computeMs
            + (1.0 / 150.0) * 1000  # shuffleWriteMs: 1 MiB / 150 MBps, in ms
            # no sort term (map role never sorts), no spill (peak=0), gc at heapPressure=0
        )
        self.assertAlmostEqual(calib.modeled_base_ms(task, fixture, ceiling_bytes=1e12, constants=constants), expected, places=6)

    def test_reduce_task_never_gets_a_read_or_shuffle_write_term(self):
        config = make_run_config()
        constants = {
            "DESERIALIZE_MS_PER_TASK": 0.0,
            "READ_THROUGHPUT_MBPS": 1.0,  # would dominate if wrongly applied
            "CPU_NS_PER_ROW": 0.0,
            "SORT_NS_PER_ROW_LOG": 0.0,
            "SHUFFLE_WRITE_THROUGHPUT_MBPS": 1.0,  # would dominate if wrongly applied
            "SPILL_WRITE_THROUGHPUT_MBPS": 200.0,
            "SPILL_READ_THROUGHPUT_MBPS": 250.0,
            "SPILL_MERGE_COST_MS": 5.0,
            "GC_BASE_MS": 0.0,
        }
        task = make_task(stageId=1, rows=10, inputBytes=calib.MIB, shuffleWriteBytes=calib.MIB)
        fixture = {"plan": {"final": {"kind": "Project"}}, "runConfig": config}  # no sort node
        self.assertEqual(calib.modeled_base_ms(task, fixture, ceiling_bytes=1e12, constants=constants), 0.0)


class SerializationRatioAndOomThresholdTests(unittest.TestCase):
    def test_fit_serialization_ratio_recovers_a_known_ratio(self):
        fixtures = [
            {
                "runConfig": make_run_config(),
                "tasks": [
                    make_task(memorySpilledBytes=1000, diskSpilledBytes=350),
                    make_task(memorySpilledBytes=2000, diskSpilledBytes=700),
                ],
            }
        ]
        self.assertAlmostEqual(calib.fit_serialization_ratio(fixtures), 0.35, places=6)

    def test_fit_serialization_ratio_falls_back_when_nothing_spilled(self):
        fixtures = [{"runConfig": make_run_config(), "tasks": [make_task(memorySpilledBytes=0)]}]
        self.assertEqual(calib.fit_serialization_ratio(fixtures), calib.PLACEHOLDER_PRIOR["SERIALIZATION_RATIO"])

    def test_fit_oom_threshold_ratio_separates_labels_cleanly(self):
        config = make_run_config()
        ceiling = calib.execution_ceiling_bytes(config)
        # Below 1.5x ceiling -> 'spilled'; above -> 'oom'. The fitted threshold should land
        # between the two clusters.
        fixtures = [
            {
                "runConfig": config,
                "tasks": [
                    make_task(memorySpilledBytes=1, diskSpilledBytes=int(0.2 * ceiling), status="spilled"),
                    make_task(memorySpilledBytes=1, diskSpilledBytes=int(0.3 * ceiling), status="spilled"),
                    make_task(memorySpilledBytes=1, diskSpilledBytes=int(2.0 * ceiling), status="oom"),
                    make_task(memorySpilledBytes=1, diskSpilledBytes=int(2.5 * ceiling), status="oom"),
                ],
            }
        ]
        ratio = calib.fit_oom_threshold_ratio(fixtures)
        self.assertGreater(ratio, 1.3)
        self.assertLess(ratio, 3.0)

    def test_fit_oom_threshold_ratio_falls_back_when_nothing_spilled(self):
        fixtures = [{"runConfig": make_run_config(), "tasks": [make_task(memorySpilledBytes=0)]}]
        self.assertEqual(calib.fit_oom_threshold_ratio(fixtures), calib.PLACEHOLDER_PRIOR["OOM_THRESHOLD_RATIO"])


class RenderingTests(unittest.TestCase):
    def test_render_constants_file_includes_every_constant_and_the_generated_header(self):
        constants = {name: 1.0 for name in calib.CONSTANT_NAMES}
        residuals = {
            "n_fixtures": 1,
            "n_tasks": 1,
            "stage_wall_clock": {"mae": 0.05, "r2": 0.9},
            "disk_bytes_spilled": {"mae": 0.05, "r2": 0.9},
            "jvm_gc_time": {"mae": 0.05, "r2": 0.9},
        }
        rendered = calib.render_constants_file(constants, residuals, synthetic=True)
        self.assertTrue(rendered.startswith("// GENERATED by tools/capture/calibrate.py"))
        for name in calib.CONSTANT_NAMES:
            self.assertIn(f"export const {name} =", rendered)
        self.assertIn("SYNTHETIC", rendered)

    def test_render_report_flags_synthetic_data(self):
        residuals = {
            "n_fixtures": 1,
            "n_tasks": 1,
            "stage_wall_clock": {"mae": 0.05, "r2": 0.9},
            "disk_bytes_spilled": {"mae": 0.05, "r2": 0.9},
            "jvm_gc_time": {"mae": 0.05, "r2": 0.9},
        }
        report = calib.render_report(residuals, synthetic=True)
        self.assertIn("SYNTHETIC", report)
        self.assertIn("CI gate", report)


if __name__ == "__main__":
    unittest.main()
