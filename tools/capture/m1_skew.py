"""SAS-021/023 — M1 (skew) scenario runner. Not exercised in this pass — see
tools/capture/README.md's SAS-020 note: this environment has no reachable Spark cluster. Written
and reviewable now; runnable as-is once the real-cluster follow-up starts.

Generates data inline (spark.range + F.rand/F.when) rather than importing tools/generator:
SAS-021's declared dependency SAS-030 (E4's PySpark generator) doesn't exist yet. Swap this for
tools.generator.skew once E4 lands.

Runs the 8-run M1 grid from docs/FIXTURES.md §5. Each `run()` call configures Spark for one
scenario and executes a shuffling join; 00_configure.py's event logging captures everything
10_reduce.py needs to turn the resulting log into a committed fixture.
"""

from __future__ import annotations

import importlib
import os

from pyspark.sql import SparkSession, functions as F

# "00_configure" isn't a valid Python identifier, so a normal `import` statement can't reach it —
# importlib.import_module works from a string and has no such restriction. Requires this script's
# own directory on sys.path, which Python adds automatically for the script it runs.
configure = importlib.import_module("00_configure").configure

ROWS = 2_000_000
KEY_CARDINALITY = 200
OTHER_ROWS = 2_000_000
SHUFFLE_PARTITIONS = 200
EVENT_LOG_DIR = os.environ.get("SPARK_EVENT_LOG_DIR", "dbfs:/tmp/spark-events")


def zipf_key_expr(cardinality: int, alpha: float):
    """Approximate Zipf(alpha) key generator, for capture-session realism only. A documented
    approximation (not exact inverse-transform sampling) — packages/sim/skew/zipf.ts's
    binary-search-over-cdf is the simulator's own, exact model and what calibrate.py compares
    measured data against."""
    if alpha <= 0:
        return (F.rand() * cardinality).cast("int") + 1
    return F.least(F.lit(float(cardinality)), F.pow(F.lit(float(cardinality)), F.pow(F.rand(), alpha)).cast("int") + 1)


def build_fact_df(spark: SparkSession, alpha: float, salt_factor: int, null_fraction: float):
    df = spark.range(ROWS).withColumn("key", zipf_key_expr(KEY_CARDINALITY, alpha).cast("string"))
    if null_fraction > 0:
        df = df.withColumn("key", F.when(F.rand() < null_fraction, F.lit(None)).otherwise(F.col("key")))
    if salt_factor > 1:
        # Mirrors packages/sim/skew/hash.ts's saltKey: key -> key_<rowIndex % saltFactor>.
        df = df.withColumn("key", F.concat_ws("_", F.col("key"), (F.col("id") % salt_factor).cast("string")))
    return df.withColumn("payload", F.expr("repeat('x', 2000)"))  # ~2000 bytes/row, matches m1Data


def run(name: str, alpha: float, salt: int, null_fraction: float = 0.0) -> None:
    spark = SparkSession.builder.appName(f"m1_skew_{name}").getOrCreate()
    spark.conf.set("spark.eventLog.dir", EVENT_LOG_DIR)
    configure(spark)
    spark.conf.set("spark.sql.shuffle.partitions", str(SHUFFLE_PARTITIONS))
    spark.conf.set("spark.sql.adaptive.enabled", "false")  # M1 isolates skew/salting from AQE

    fact = build_fact_df(spark, alpha, salt, null_fraction)
    other = spark.range(OTHER_ROWS).withColumnRenamed("id", "key").withColumn("key", F.col("key").cast("string"))

    result = fact.join(other, "key", "inner")
    result.write.mode("overwrite").format("noop").save()  # force execution; discard the output

    spark.stop()


if __name__ == "__main__":
    # docs/FIXTURES.md §5 — the 8-run M1 grid.
    run("m1_a00_s1", alpha=0.0, salt=1)
    run("m1_a08_s1", alpha=0.8, salt=1)
    run("m1_a12_s1", alpha=1.2, salt=1)
    run("m1_a16_s1", alpha=1.6, salt=1)  # hero "before"
    run("m1_a16_s4", alpha=1.6, salt=4)
    run("m1_a16_s8", alpha=1.6, salt=8)  # hero "after"
    run("m1_a16_null3", alpha=1.6, salt=1, null_fraction=0.03)  # the trap
    run("m1_a20_s8", alpha=2.0, salt=8)
