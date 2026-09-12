"""SAS-021/024 — M2 (AQE) scenario runner. Not exercised in this pass — see m1_skew.py's file
header note on why (no reachable cluster) and on the numeric-prefixed `00_configure` import.

Runs the 7-run M2 grid (docs/modules/m2-aqe.md §9). The simulator's `est` knob (a planner
size-estimate-error multiplier, see docs/modules/m2-aqe.md §3) has no direct Spark config
equivalent. Capture approximates a "bad estimate" scenario by disabling the broadcast threshold
at plan time (`spark.sql.autoBroadcastJoinThreshold = -1`), which forces SortMergeJoin regardless
of the join's true size — then AQE's dynamicJoinSelection discovers the true size at runtime and
switches to BroadcastHashJoin, the same behaviour the simulator's `estimateErrorFactor` produces.
"""

from __future__ import annotations

import importlib
import os

from pyspark.sql import SparkSession, functions as F

configure = importlib.import_module("00_configure").configure

KEY_CARDINALITY = 200
EVENT_LOG_DIR = os.environ.get("SPARK_EVENT_LOG_DIR", "dbfs:/tmp/spark-events")


def key_expr(alpha: float):
    if alpha <= 0:
        return (F.rand() * KEY_CARDINALITY).cast("int") + 1
    return F.least(F.lit(float(KEY_CARDINALITY)), F.pow(F.lit(float(KEY_CARDINALITY)), F.pow(F.rand(), alpha)).cast("int") + 1)


def build_fact_df(spark: SparkSession, alpha: float, rows: int):
    df = spark.range(rows).withColumn("key", key_expr(alpha).cast("string"))
    return df.withColumn("payload", F.expr("repeat('x', 2000)"))


def run(
    name: str,
    *,
    alpha: float = 0.0,
    aqe: bool = True,
    advisory_mib: int = 64,
    skew_factor: int = 5,
    skew_threshold_mib: int = 256,
    bad_estimate: bool = False,
    other_rows: int = 2_000_000,
    fact_rows: int = 2_000_000,
) -> None:
    spark = SparkSession.builder.appName(f"m2_aqe_{name}").getOrCreate()
    spark.conf.set("spark.eventLog.dir", EVENT_LOG_DIR)
    configure(spark)
    spark.conf.set("spark.sql.shuffle.partitions", "200")
    spark.conf.set("spark.sql.adaptive.enabled", str(aqe).lower())
    spark.conf.set("spark.sql.adaptive.advisoryPartitionSizeInBytes", f"{advisory_mib}m")
    spark.conf.set("spark.sql.adaptive.skewJoin.skewedPartitionFactor", str(skew_factor))
    spark.conf.set("spark.sql.adaptive.skewJoin.skewedPartitionThresholdInBytes", f"{skew_threshold_mib}m")
    if bad_estimate:
        spark.conf.set("spark.sql.autoBroadcastJoinThreshold", "-1")

    fact = build_fact_df(spark, alpha, fact_rows)
    other = spark.range(other_rows).withColumnRenamed("id", "key").withColumn("key", F.col("key").cast("string"))

    result = fact.join(other, "key", "inner")
    result.write.mode("overwrite").format("noop").save()

    spark.stop()


if __name__ == "__main__":
    # docs/modules/m2-aqe.md §9 — the 7-run M2 grid. Mirrors
    # packages/fixtures/scripts/generate-synthetic.ts's M2_GRID config choices.
    run("m2_off", aqe=False, bad_estimate=True, other_rows=1000)
    run("m2_coalesce_only", fact_rows=50_000, advisory_mib=64)
    run("m2_skew_split", alpha=2.2, skew_threshold_mib=1, skew_factor=2, fact_rows=20_000_000)
    run("m2_join_switch", bad_estimate=True, other_rows=1000)
    run("m2_all", alpha=2.2, bad_estimate=True, other_rows=1000, skew_threshold_mib=1, skew_factor=2)
    run("m2_adv8", fact_rows=50_000, advisory_mib=8)
    run("m2_adv256", fact_rows=50_000, advisory_mib=256)
