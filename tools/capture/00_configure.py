"""SAS-021 — capture-session Spark configuration. See docs/FIXTURES.md §2.

Sets up event logging so a capture session's raw event log contains everything 10_reduce.py
needs: task metrics, the physical plan and its accumulators, and every AQE plan-change event.

Not runnable standalone — import `configure(spark)` from a scenario runner (m1_skew.py,
m2_aqe.py) after creating a SparkSession, before running any query.
"""

from __future__ import annotations


def configure(spark) -> None:  # noqa: ANN001 - pyspark.sql.SparkSession, not installed in CI
    """Enables event logging and AQE plan-change logging on `spark`."""
    spark.conf.set("spark.eventLog.enabled", "true")
    spark.conf.set("spark.eventLog.dir", "dbfs:/tmp/spark-events")
    # Logs each AQE plan change to the driver log — see docs/FIXTURES.md §3's note on
    # SparkListenerSQLAdaptiveExecutionUpdate as the alternative, event-based source.
    spark.conf.set("spark.sql.adaptive.logLevel", "INFO")
