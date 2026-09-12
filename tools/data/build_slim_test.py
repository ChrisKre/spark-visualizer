"""SAS-033 — unit tests for build_slim.py's download-independent transform functions, against
small synthetic in-memory DataFrames. Runs with pandas/pyarrow/scipy only, no network access:
`python tools/data/build_slim_test.py`.

Does NOT exercise the real download or the real multi-GB TLC data — see build_slim.py's module
docstring for why that's deferred to a manual, local run.
"""

from __future__ import annotations

import os
import sys
import unittest

import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_slim as bs  # noqa: E402 - needs sys.path adjusted first


def make_trips(pu_ids: list[int], seed: int = 0) -> pd.DataFrame:
    """A tiny synthetic month of trips: one row per entry in pu_ids, spread evenly across two
    pickup hours so aggregate_hourly has more than one bucket to group."""
    n = len(pu_ids)
    hours = pd.to_datetime(["2019-01-01 00:00:00"] * (n // 2) + ["2019-01-01 01:00:00"] * (n - n // 2))
    return pd.DataFrame(
        {
            "tpep_pickup_datetime": hours,
            "PULocationID": pu_ids,
            "DOLocationID": [1] * n,
            "payment_type": [1] * n,
            "passenger_count": [1] * n,
            "VendorID": [1] * n,
            "trip_distance": [2.5] * n,
            "total_amount": [15.0] * n,
        }
    )


class TestParseMonths(unittest.TestCase):
    def test_range(self):
        self.assertEqual(bs.parse_months("2019-01..2019-03"), ["2019-01", "2019-02", "2019-03"])

    def test_range_across_year_boundary(self):
        self.assertEqual(bs.parse_months("2019-11..2020-02"), ["2019-11", "2019-12", "2020-01", "2020-02"])

    def test_single_month_range(self):
        self.assertEqual(bs.parse_months("2019-01..2019-01"), ["2019-01"])

    def test_comma_list(self):
        self.assertEqual(bs.parse_months("2019-01,2019-03"), ["2019-01", "2019-03"])

    def test_rejects_end_before_start(self):
        with self.assertRaises(ValueError):
            bs.parse_months("2019-06..2019-01")


class TestAggregateHourly(unittest.TestCase):
    def test_groups_by_zone_and_hour(self):
        df = make_trips([1, 1, 2, 2, 1, 2])  # 3 in hour 0 (ids 1,1,2), 3 in hour 1 (ids 2,1,2)
        result = bs.aggregate_hourly(df)
        self.assertEqual(set(result.columns), {"PULocationID", "pickup_hour", "trip_count", "avg_trip_distance", "avg_total_amount"})
        self.assertEqual(result["trip_count"].sum(), len(df))

    def test_trip_count_matches_group_size(self):
        df = make_trips([5] * 10 + [7] * 4)
        result = bs.aggregate_hourly(df)
        zone5 = result[result["PULocationID"] == 5]["trip_count"].sum()
        zone7 = result[result["PULocationID"] == 7]["trip_count"].sum()
        self.assertEqual(zone5, 10)
        self.assertEqual(zone7, 4)


class TestStratifiedSample(unittest.TestCase):
    def test_preserves_proportions(self):
        # zone 1: 90%, zone 2: 10% of 10,000 rows.
        pu_ids = [1] * 9000 + [2] * 1000
        df = make_trips(pu_ids)
        sample = bs.stratified_sample(df, target_rows=1000, seed=42)

        self.assertEqual(len(sample), 1000)
        share_1 = (sample["PULocationID"] == 1).sum() / len(sample)
        self.assertAlmostEqual(share_1, 0.9, delta=0.02)

    def test_target_rows_exceeding_population_returns_all_rows(self):
        df = make_trips([1, 2, 3])
        sample = bs.stratified_sample(df, target_rows=1000, seed=1)
        self.assertEqual(len(sample), 3)

    def test_zero_target_returns_empty(self):
        df = make_trips([1, 2, 3])
        sample = bs.stratified_sample(df, target_rows=0, seed=1)
        self.assertEqual(len(sample), 0)

    def test_deterministic_for_same_seed(self):
        df = make_trips([1] * 500 + [2] * 500)
        a = bs.stratified_sample(df, target_rows=100, seed=7)
        b = bs.stratified_sample(df, target_rows=100, seed=7)
        pd.testing.assert_frame_equal(a.sort_values("PULocationID").reset_index(drop=True), b.sort_values("PULocationID").reset_index(drop=True))


class TestKsCheck(unittest.TestCase):
    def test_passes_for_two_draws_from_the_same_distribution(self):
        population = pd.Series(([1] * 900 + [2] * 100) * 5)
        sample = pd.Series([1] * 90 + [2] * 10)
        result = bs.ks_check(population, sample, threshold=0.05)
        self.assertTrue(result.passed)

    def test_fails_for_clearly_different_distributions(self):
        population = pd.Series([1] * 900 + [2] * 100)
        sample = pd.Series([2] * 90 + [1] * 10)  # inverted proportions
        result = bs.ks_check(population, sample, threshold=0.05)
        self.assertFalse(result.passed)
        self.assertGreater(result.statistic, 0.05)


if __name__ == "__main__":
    unittest.main()
