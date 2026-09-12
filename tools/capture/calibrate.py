"""SAS-025 — fits packages/sim's 12 cost-model constants against committed fixtures and writes
`constants.generated.ts` plus a residual report. See docs/FIXTURES.md §6:

    python tools/capture/calibrate.py --fixtures packages/fixtures/data \\
        --out packages/sim/calibration/constants.generated.ts

Every fixture in `--fixtures` today is SYNTHETIC (packages/fixtures/scripts/generate-synthetic.ts
— see tools/capture/README.md's SAS-020 note: no reachable cluster in this pass). This script
still runs the real fit against them to prove the pipeline end-to-end; the provenance header it
writes says so explicitly, and the numbers are not the final calibration. Re-run this unchanged
once a real capture session replaces the fixture files.

The numeric helpers below (execution_ceiling_bytes, modeled_base_ms, fit_*, ...) are unit-tested
independently of any committed fixture in calibrate_test.py.

A few terms (GC, spill-merge, and the read/compute/shuffle-write split — see the identifiability
notes in fit_primary_constants) fall back to PLACEHOLDER_PRIOR whenever the fitted signal is
noisier than the effect it's trying to measure, rather than reporting a fitted-looking value that
isn't one. That happens routinely on this pass's small, uniformly-generated synthetic set; it is
expected to happen far less against a real, more heterogeneous capture.
"""

from __future__ import annotations

import argparse
import glob
import json
import math
import os
from datetime import datetime, timezone

import numpy as np

MIB = 1024 * 1024
RESERVED_MEMORY_MIB = 300  # mirrors packages/sim/model/memory.ts's RESERVED_MEMORY_MIB
# The placeholder's SPILL_WRITE_THROUGHPUT_MBPS:SPILL_READ_THROUGHPUT_MBPS ratio (200:250).
# invWrite:invRead = 1/200:1/250 = 5:4 — see the file header's "identifiability gap" note.
SPILL_WRITE_READ_INV_RATIO = (5, 4)

CONSTANT_NAMES = [
    "DESERIALIZE_MS_PER_TASK",
    "READ_THROUGHPUT_MBPS",
    "CPU_NS_PER_ROW",
    "SORT_NS_PER_ROW_LOG",
    "SHUFFLE_WRITE_THROUGHPUT_MBPS",
    "NETWORK_BANDWIDTH_MBPS",
    "SERIALIZATION_RATIO",
    "SPILL_WRITE_THROUGHPUT_MBPS",
    "SPILL_READ_THROUGHPUT_MBPS",
    "SPILL_MERGE_COST_MS",
    "OOM_THRESHOLD_RATIO",
    "GC_BASE_MS",
]

# The existing hand-written packages/sim/calibration/constants.generated.ts placeholder's own
# numbers. Used two ways below, never as a claim about the fitted magnitude itself: (1) to weight
# how an unidentifiable *combined* effect is apportioned between two constants (see the
# identifiability notes in fit_primary_constants), and (2) as the fallback for a constant whose
# regression signal is weaker than its noise — a fitted-looking value that isn't a real fit is
# worse than falling back to the number that already exists for "something to divide by before
# real calibration" (packages/sim/calibration/constants.generated.ts's own header).
PLACEHOLDER_PRIOR = {
    "DESERIALIZE_MS_PER_TASK": 2.0,
    "READ_THROUGHPUT_MBPS": 400.0,
    "CPU_NS_PER_ROW": 50.0,
    "SORT_NS_PER_ROW_LOG": 20.0,
    "SHUFFLE_WRITE_THROUGHPUT_MBPS": 150.0,
    "NETWORK_BANDWIDTH_MBPS": 1000.0,
    "SERIALIZATION_RATIO": 0.35,
    "SPILL_WRITE_THROUGHPUT_MBPS": 200.0,
    "SPILL_READ_THROUGHPUT_MBPS": 250.0,
    "SPILL_MERGE_COST_MS": 5.0,
    "OOM_THRESHOLD_RATIO": 1.8,
    "GC_BASE_MS": 50.0,
}

# --- fixture loading -----------------------------------------------------------------------


def load_fixtures(fixtures_dir: str) -> list:
    fixtures = []
    for path in sorted(glob.glob(os.path.join(fixtures_dir, "*.json"))):
        with open(path, "r", encoding="utf-8") as f:
            fixtures.append(json.load(f))
    return fixtures


# --- config-derived quantities (pure arithmetic, no fitted constants) -----------------------


def execution_ceiling_bytes(run_config: dict) -> float:
    """Mirrors packages/sim/model/memory.ts's executionCeilingPerTask(config, liveStorageMiB=0)
    exactly — pure config arithmetic, not a fitted quantity."""
    cluster = run_config["cluster"]
    usable_mib = cluster["executorMemoryMiB"] - RESERVED_MEMORY_MIB
    unified_mib = usable_mib * cluster["memoryFraction"]
    ceiling_mib = max(0.0, unified_mib / cluster["coresPerExecutor"])
    return ceiling_mib * MIB


def task_role(task: dict) -> str:
    """v1.0's fixed two-stage pipeline: stage 0 is always the map stage, stage 1 the reduce
    stage — see packages/sim/plan/build.ts's file header."""
    return "map" if task["stageId"] == 0 else "reduce"


def involves_sort(fixture: dict) -> bool:
    """The reduce-stage node's kind IS `plan.final`'s root — see packages/sim/model/run.ts's
    `reduceNode = plan` comment."""
    return fixture["plan"]["final"]["kind"] in ("Sort", "SortMergeJoin")


# --- the primary fit: baseMs = finishMs - launchMs - fetchWaitMs -----------------------------
#
# Every term in docs/SIMULATOR_SPEC.md §2 Step 4's additive formula is linear in the constant it
# fits, once expressed as reciprocal-throughput features — but two pairs of terms are not
# separately identifiable from THIS dataset (documented at each site below), so the fit is staged
# rather than one flat lstsq: map tasks first (never carry a sort term), then reduce tasks against
# the residual left after subtracting the now-known map-side terms.


def _heap_pressure(task: dict, ceiling_bytes: float) -> float:
    if ceiling_bytes <= 0:
        return 1.4
    return min(task["peakExecutionMemoryBytes"] / ceiling_bytes, 1.4)


def _spill_merge_passes(task: dict, ceiling_bytes: float) -> float:
    spill_bytes = task["memorySpilledBytes"]
    if spill_bytes <= 0 or ceiling_bytes <= 0:
        return 0.0
    return float(max(1, math.ceil(spill_bytes / ceiling_bytes)))


def _through_origin_ols(features: list, targets: list) -> float:
    """Single-feature, zero-intercept least squares: coefficient = sum(x*y) / sum(x^2). Used to
    fit one term against a residual left over after subtracting every already-known term — see
    fit_primary_constants's staged design for why joint fits are avoided here."""
    feature_sq_sum = sum(f * f for f in features)
    feature_target_sum = sum(f * t for f, t in zip(features, targets))
    return feature_target_sum / feature_sq_sum if feature_sq_sum > 0 else 0.0


def _lstsq_scaled(rows: list, targets: list) -> "np.ndarray":
    """Ordinary least squares with column scaling, so a feature spanning the hundreds of
    thousands (spill) doesn't dwarf one spanning 0-2 (gc) under SVD's rcond cutoff. A numerical-
    conditioning aid — it does not, and cannot, fix genuine data collinearity (see the two
    identifiability gaps documented in fit_primary_constants)."""
    A = np.array(rows, dtype=float)
    b = np.array(targets, dtype=float)
    column_scales = np.max(np.abs(A), axis=0)
    column_scales[column_scales == 0] = 1.0
    x_scaled, *_ = np.linalg.lstsq(A / column_scales, b, rcond=None)
    return x_scaled / column_scales


def modeled_base_ms(task: dict, fixture: dict, ceiling_bytes: float, constants: dict) -> float:
    """The single source of truth for `baseMs` given a constants dict — used both to score
    residuals (compute_residuals) and, during Stage B of the fit, to subtract Stage A's
    already-known terms before regressing the sort term against what's left."""
    role = task_role(task)
    rows = task["rows"]
    sort_applies = role == "reduce" and involves_sort(fixture) and rows > 1
    heap_pressure = _heap_pressure(task, ceiling_bytes)
    spill_merge_passes = _spill_merge_passes(task, ceiling_bytes)
    spill_mib = task["memorySpilledBytes"] / MIB

    # bytesToMs (packages/sim/model/cost.ts): (bytes/MIB/throughputMBps) * 1000 — MiB/throughput
    # is in seconds, so every reciprocal-throughput term below needs the same *1000 to land in ms.
    deserialize_ms = constants["DESERIALIZE_MS_PER_TASK"]
    read_ms = (task["inputBytes"] / MIB) * 1000 / constants["READ_THROUGHPUT_MBPS"] if role == "map" else 0.0
    compute_ms = rows * constants["CPU_NS_PER_ROW"] / 1e6
    sort_ms = (rows * math.log2(rows) * constants["SORT_NS_PER_ROW_LOG"]) / 1e6 if sort_applies else 0.0
    shuffle_write_ms = (task["shuffleWriteBytes"] / MIB) * 1000 / constants["SHUFFLE_WRITE_THROUGHPUT_MBPS"] if role == "map" else 0.0
    spill_penalty_ms = 0.0
    if task["memorySpilledBytes"] > 0:
        spill_penalty_ms = (
            spill_mib * 1000 / constants["SPILL_WRITE_THROUGHPUT_MBPS"]
            + spill_mib * 1000 / constants["SPILL_READ_THROUGHPUT_MBPS"]
            + spill_merge_passes * constants["SPILL_MERGE_COST_MS"]
        )
    gc_ms = (heap_pressure**2) * constants["GC_BASE_MS"]

    return deserialize_ms + read_ms + compute_ms + sort_ms + shuffle_write_ms + spill_penalty_ms + gc_ms


def fit_primary_constants(fixtures: list) -> dict:
    map_entries: list = []
    reduce_entries: list = []
    for fixture in fixtures:
        ceiling_bytes = execution_ceiling_bytes(fixture["runConfig"])
        bytes_per_row = fixture["runConfig"]["data"]["bytesPerRow"]
        for task in fixture["tasks"]:
            entry = (task, fixture, ceiling_bytes, bytes_per_row)
            (map_entries if task_role(task) == "map" else reduce_entries).append(entry)

    # --- Stage A1: map tasks that did NOT spill (the vast majority) -------------------------
    # Identifiability gap #1: for a map task, inputBytes AND shuffleWriteBytes are both EXACTLY
    # `rows * bytesPerRow` (cost.ts: a map task writes its whole input as shuffle output), so
    # READ_THROUGHPUT_MBPS, CPU_NS_PER_ROW and SHUFFLE_WRITE_THROUGHPUT_MBPS cannot be separated
    # from a dataset where bytesPerRow doesn't vary across fixtures — true of every fixture
    # committed today, and plausibly true of a real capture built from one dataset/schema too.
    # Fit their COMBINED effect on one "rows" feature, then apportion it three ways below.
    #
    # Every remaining term (spill, spillMerge, gc) is fit in its own staged pass against a
    # residual, rather than jointly: only a handful of tasks ever spill (the largest, most
    # skewed partitions) and spillBytes/spillMergePasses are themselves highly correlated within
    # that small subset (>0.999 observed against this fixture set); heapPressure^2 is also
    # correlated enough with "rows" (~0.88) that a joint fit lets a few extreme-skew outlier
    # tasks (whose duration is dominated by read+shuffleWrite, not gc) push GC_BASE_MS to a
    # nonsensical negative value. Staging avoids all of this the same way Stage B (sort, below)
    # does: fit the dominant term first, then fit each smaller term against what's left over.
    A_map, b_map = [], []
    for task, _fixture, _ceiling_bytes, _bytes_per_row in map_entries:
        if task["memorySpilledBytes"] > 0:
            continue
        A_map.append([1.0, task["rows"] / 1e6])
        b_map.append(task["finishMs"] - task["launchMs"] - task["fetchWaitMs"])

    x_map = _lstsq_scaled(A_map, b_map)
    deserialize_ms_per_task = float(x_map[0])
    # ms per (rows/1e6): CPU_NS_PER_ROW + the read term + the shuffle-write term, combined.
    combined_map_rows_coeff = float(x_map[1])

    gc_features, gc_residuals = [], []
    for task, _fixture, ceiling_bytes, _bytes_per_row in map_entries:
        if task["memorySpilledBytes"] > 0:
            continue
        known_ms = deserialize_ms_per_task + combined_map_rows_coeff * task["rows"] / 1e6
        gc_features.append(_heap_pressure(task, ceiling_bytes) ** 2)
        gc_residuals.append((task["finishMs"] - task["launchMs"] - task["fetchWaitMs"]) - known_ms)
    raw_gc_base_ms = _through_origin_ols(gc_features, gc_residuals)
    # A negative fit means the noise in this fixture set's jitter swamped GC's (small, relative
    # to read/shuffle-write) contribution to map-task duration — a real fitted-looking value that
    # isn't a real fit is worse than the documented placeholder prior. See PLACEHOLDER_PRIOR.
    gc_base_ms = raw_gc_base_ms if raw_gc_base_ms > 0 else PLACEHOLDER_PRIOR["GC_BASE_MS"]

    # --- Stage A2: the map tasks that spilled but did NOT oom, against Stage A1's terms ------
    # A genuinely failed ('oom') task is an extreme, discontinuous outlier by the model's own
    # design (SIMULATOR_SPEC.md §2 Step 4: "the UI shows the failure rather than a plausible-
    # looking number") — a handful of them dominate an ordinary-least-squares duration fit via
    # their sheer magnitude without carrying reliable information about the *typical* spill
    # penalty. Excluded from every duration regression below; still included in
    # fit_oom_threshold_ratio (which needs exactly the oom/non-oom labels) and in
    # compute_residuals' reported MAE (which should honestly reflect all tasks, fit or not).
    spilling_map_tasks = [
        (task, ceiling_bytes)
        for task, _fixture, ceiling_bytes, _bytes_per_row in map_entries
        if task["memorySpilledBytes"] > 0 and task["status"] != "oom"
    ]

    if spilling_map_tasks:
        spill_mib_ms = [(task["memorySpilledBytes"] / MIB) * 1000 for task, _ceiling in spilling_map_tasks]
        residual_after_known = [
            (task["finishMs"] - task["launchMs"] - task["fetchWaitMs"])
            - (deserialize_ms_per_task + combined_map_rows_coeff * task["rows"] / 1e6 + gc_base_ms * _heap_pressure(task, ceiling) ** 2)
            for task, ceiling in spilling_map_tasks
        ]
        inv_spill_combined = max(1e-9, _through_origin_ols(spill_mib_ms, residual_after_known))

        merge_passes = [_spill_merge_passes(task, ceiling) for task, ceiling in spilling_map_tasks]
        residual_after_spill = [r - inv_spill_combined * s for r, s in zip(residual_after_known, spill_mib_ms)]
        raw_spill_merge_cost_ms = _through_origin_ols(merge_passes, residual_after_spill)
        spill_merge_cost_ms = raw_spill_merge_cost_ms if raw_spill_merge_cost_ms > 0 else PLACEHOLDER_PRIOR["SPILL_MERGE_COST_MS"]
    else:
        # No spilling task in this fixture set to fit against — fall back to the placeholder's
        # own values rather than claiming a fit that never happened.
        inv_spill_combined = (1.0 / PLACEHOLDER_PRIOR["SPILL_WRITE_THROUGHPUT_MBPS"]) + (1.0 / PLACEHOLDER_PRIOR["SPILL_READ_THROUGHPUT_MBPS"])
        spill_merge_cost_ms = PLACEHOLDER_PRIOR["SPILL_MERGE_COST_MS"]

    avg_bytes_per_row = float(np.mean([bpr for *_, bpr in map_entries])) if map_entries else 128.0

    def prior_component(throughput_mbps: float) -> float:
        """The placeholder's own ms-per-(rows/1e6) contribution for a reciprocal-throughput
        term — used only to weight how the combined coefficient above is split, per the gap
        documented above. Mirrors bytesToMs's *1000 (MiB/throughput is in seconds, not ms) —
        see packages/sim/model/cost.ts."""
        return 1e9 * avg_bytes_per_row / (MIB * throughput_mbps)

    read_prior = prior_component(PLACEHOLDER_PRIOR["READ_THROUGHPUT_MBPS"])
    shuffle_write_prior = prior_component(PLACEHOLDER_PRIOR["SHUFFLE_WRITE_THROUGHPUT_MBPS"])
    compute_prior = PLACEHOLDER_PRIOR["CPU_NS_PER_ROW"]
    prior_total = read_prior + shuffle_write_prior + compute_prior

    cpu_ns_per_row = combined_map_rows_coeff * (compute_prior / prior_total)
    fitted_read_component = combined_map_rows_coeff * (read_prior / prior_total)
    fitted_shuffle_write_component = combined_map_rows_coeff * (shuffle_write_prior / prior_total)

    def safe_reciprocal(v: float) -> float:
        return 1.0 / v if abs(v) > 1e-9 else float("inf")

    def component_to_throughput(component: float) -> float:
        return 1e9 * avg_bytes_per_row / (MIB * component) if abs(component) > 1e-9 else float("inf")

    read_throughput_mbps = component_to_throughput(fitted_read_component)
    shuffle_write_throughput_mbps = component_to_throughput(fitted_shuffle_write_component)

    # --- Stage B: reduce tasks, regressed against the residual left after Stage A's terms ----
    # Identifiability gap #2: within a single fixture, "rows" (the compute feature) and
    # "rows*log2(rows)" (the sort feature) vary too little relative to each other to separate
    # CPU_NS_PER_ROW from SORT_NS_PER_ROW_LOG in a joint fit (reduce tasks with a Sort node
    # always carry both terms at once). Stage A already pinned CPU_NS_PER_ROW from map tasks
    # (which never sort), so this stage only has one unknown left to find.
    sort_feature_sq_sum = 0.0
    sort_feature_residual_sum = 0.0
    known_constants_so_far = {
        "DESERIALIZE_MS_PER_TASK": deserialize_ms_per_task,
        "READ_THROUGHPUT_MBPS": read_throughput_mbps,
        "CPU_NS_PER_ROW": cpu_ns_per_row,
        "SORT_NS_PER_ROW_LOG": 0.0,  # not yet known — this stage is solving for it
        "SHUFFLE_WRITE_THROUGHPUT_MBPS": shuffle_write_throughput_mbps,
        "SPILL_WRITE_THROUGHPUT_MBPS": safe_reciprocal(inv_spill_combined * SPILL_WRITE_READ_INV_RATIO[0] / sum(SPILL_WRITE_READ_INV_RATIO)),
        "SPILL_READ_THROUGHPUT_MBPS": safe_reciprocal(inv_spill_combined * SPILL_WRITE_READ_INV_RATIO[1] / sum(SPILL_WRITE_READ_INV_RATIO)),
        "SPILL_MERGE_COST_MS": spill_merge_cost_ms,
        "GC_BASE_MS": gc_base_ms,
    }
    for task, fixture, ceiling_bytes, _bytes_per_row in reduce_entries:
        rows = task["rows"]
        if rows <= 1 or not involves_sort(fixture) or task["status"] == "oom":
            continue
        sort_feature = (rows * math.log2(rows)) / 1e6
        known_base_ms = modeled_base_ms(task, fixture, ceiling_bytes, known_constants_so_far)
        residual = (task["finishMs"] - task["launchMs"] - task["fetchWaitMs"]) - known_base_ms
        sort_feature_sq_sum += sort_feature**2
        sort_feature_residual_sum += sort_feature * residual

    raw_sort_ns_per_row_log = sort_feature_residual_sum / sort_feature_sq_sum if sort_feature_sq_sum > 0 else 0.0
    sort_ns_per_row_log = raw_sort_ns_per_row_log if raw_sort_ns_per_row_log > 0 else PLACEHOLDER_PRIOR["SORT_NS_PER_ROW_LOG"]

    write_share, read_share_spill = SPILL_WRITE_READ_INV_RATIO
    inv_write = inv_spill_combined * write_share / (write_share + read_share_spill)
    inv_read = inv_spill_combined * read_share_spill / (write_share + read_share_spill)

    return {
        "DESERIALIZE_MS_PER_TASK": deserialize_ms_per_task,
        "READ_THROUGHPUT_MBPS": read_throughput_mbps,
        "CPU_NS_PER_ROW": cpu_ns_per_row,
        "SORT_NS_PER_ROW_LOG": sort_ns_per_row_log,
        "SHUFFLE_WRITE_THROUGHPUT_MBPS": shuffle_write_throughput_mbps,
        "SPILL_WRITE_THROUGHPUT_MBPS": safe_reciprocal(inv_write),
        "SPILL_READ_THROUGHPUT_MBPS": safe_reciprocal(inv_read),
        "SPILL_MERGE_COST_MS": spill_merge_cost_ms,
        "GC_BASE_MS": gc_base_ms,
    }


# --- separate regressions --------------------------------------------------------------------


def fit_network_bandwidth(fixtures: list) -> float:
    """fetchWaitMs = shuffleReadBytes_MiB * 1000 / NETWORK_BANDWIDTH_MBPS, assuming
    concurrentFetches=1 — a documented averaging approximation (contention effects aren't
    reconstructible post-hoc without replaying the scheduler)."""
    feature_sum_sq = 0.0
    feature_target_sum = 0.0
    for fixture in fixtures:
        for task in fixture["tasks"]:
            if task["shuffleReadBytes"] <= 0:
                continue
            feature = (task["shuffleReadBytes"] / MIB) * 1000
            feature_sum_sq += feature * feature
            feature_target_sum += feature * task["fetchWaitMs"]

    if feature_sum_sq <= 0:
        return float("inf")
    inv_network = feature_target_sum / feature_sum_sq
    return 1.0 / inv_network if abs(inv_network) > 1e-9 else float("inf")


def fit_serialization_ratio(fixtures: list) -> float:
    """diskSpilledBytes = memorySpilledBytes * SERIALIZATION_RATIO — through-origin OLS."""
    mem_sum_sq = 0.0
    mem_disk_sum = 0.0
    for fixture in fixtures:
        for task in fixture["tasks"]:
            mem = task["memorySpilledBytes"]
            if mem <= 0:
                continue
            mem_sum_sq += mem * mem
            mem_disk_sum += mem * task["diskSpilledBytes"]

    return mem_disk_sum / mem_sum_sq if mem_sum_sq > 0 else PLACEHOLDER_PRIOR["SERIALIZATION_RATIO"]


def fit_oom_threshold_ratio(fixtures: list) -> float:
    """Grid-searches the ratio of (ceiling + diskSpilled) / ceiling that best separates
    status='oom' from status='spilled'/'ok' — not a regression, a threshold search."""
    ratios_and_labels = []
    for fixture in fixtures:
        ceiling_bytes = execution_ceiling_bytes(fixture["runConfig"])
        if ceiling_bytes <= 0:
            continue
        for task in fixture["tasks"]:
            if task["memorySpilledBytes"] <= 0:
                continue
            post_spill_peak = ceiling_bytes + task["diskSpilledBytes"]
            ratios_and_labels.append((post_spill_peak / ceiling_bytes, task["status"] == "oom"))

    if not ratios_and_labels:
        return PLACEHOLDER_PRIOR["OOM_THRESHOLD_RATIO"]  # no spilling tasks to fit against

    best_ratio = PLACEHOLDER_PRIOR["OOM_THRESHOLD_RATIO"]
    best_correct = -1
    for candidate in np.arange(1.0, 3.01, 0.02):
        correct = sum(1 for ratio, is_oom in ratios_and_labels if (ratio > candidate) == is_oom)
        if correct > best_correct:
            best_correct = correct
            best_ratio = float(candidate)
    return best_ratio


# --- residual report --------------------------------------------------------------------------


def _mae_r2(measured: list, modeled: list) -> "tuple[float, float]":
    measured_arr = np.array(measured, dtype=float)
    modeled_arr = np.array(modeled, dtype=float)
    nonzero = measured_arr != 0
    mae = float(np.mean(np.abs((modeled_arr[nonzero] - measured_arr[nonzero]) / measured_arr[nonzero]))) if nonzero.any() else 0.0

    ss_res = float(np.sum((measured_arr - modeled_arr) ** 2))
    ss_tot = float(np.sum((measured_arr - np.mean(measured_arr)) ** 2))
    r2 = 1 - ss_res / ss_tot if ss_tot > 0 else 1.0
    return mae, r2


def compute_residuals(fixtures: list, constants: dict) -> dict:
    stage_measured: list = []
    stage_modeled: list = []
    disk_measured: list = []
    disk_modeled: list = []
    gc_measured: list = []
    gc_modeled: list = []
    n_tasks = 0

    for fixture in fixtures:
        ceiling_bytes = execution_ceiling_bytes(fixture["runConfig"])
        modeled_finish_by_task: dict = {}

        for task in fixture["tasks"]:
            n_tasks += 1
            base_ms = modeled_base_ms(task, fixture, ceiling_bytes, constants)
            modeled_finish_by_task[task["taskId"]] = task["launchMs"] + base_ms + task["fetchWaitMs"]

            if task["memorySpilledBytes"] > 0:
                disk_measured.append(task["diskSpilledBytes"])
                disk_modeled.append(task["memorySpilledBytes"] * constants["SERIALIZATION_RATIO"])

            heap_pressure = _heap_pressure(task, ceiling_bytes)
            gc_measured.append(task["gcMs"])
            gc_modeled.append((heap_pressure**2) * constants["GC_BASE_MS"])

        for stage in fixture["stages"]:
            task_finishes = [modeled_finish_by_task[t] for t in stage["taskIds"] if t in modeled_finish_by_task]
            if not task_finishes:
                continue
            modeled_wall_clock = max(task_finishes) - stage["launchMs"]
            measured_wall_clock = stage["finishMs"] - stage["launchMs"]
            stage_measured.append(measured_wall_clock)
            stage_modeled.append(modeled_wall_clock)

    stage_mae, stage_r2 = _mae_r2(stage_measured, stage_modeled)
    disk_mae, disk_r2 = _mae_r2(disk_measured, disk_modeled) if disk_measured else (0.0, 1.0)
    gc_mae, gc_r2 = _mae_r2(gc_measured, gc_modeled)

    return {
        "n_fixtures": len(fixtures),
        "n_tasks": n_tasks,
        "stage_wall_clock": {"mae": stage_mae, "r2": stage_r2},
        "disk_bytes_spilled": {"mae": disk_mae, "r2": disk_r2},
        "jvm_gc_time": {"mae": gc_mae, "r2": gc_r2},
    }


# --- output rendering ---------------------------------------------------------------------------


def render_constants_file(constants: dict, residuals: dict, synthetic: bool) -> str:
    provenance = (
        f"// Fitted against {residuals['n_fixtures']} SYNTHETIC runs (packages/sim simulate() + injected\n"
        f"// jitter) — NOT real Spark captures. Real calibration happens after the SAS-020/023/024\n"
        f"// real-cluster follow-up.\n"
        if synthetic
        else f"// Fitted against {residuals['n_fixtures']} runs.\n"
    )
    lines = [
        "// GENERATED by tools/capture/calibrate.py — do not edit by hand.",
        provenance.rstrip("\n"),
        f"// Residual: mean absolute error {residuals['stage_wall_clock']['mae'] * 100:.1f} % on stage wall clock "
        f"(n={residuals['n_tasks']}, R² {residuals['stage_wall_clock']['r2']:.2f}).",
        "",
    ]
    for name in CONSTANT_NAMES:
        value = constants[name]
        lines.append(f"export const {name} = {value:.6g};")
    lines.append("")
    return "\n".join(lines)


def render_report(residuals: dict, synthetic: bool) -> str:
    header = (
        "> **SYNTHETIC DATA** — this report was generated against synthetic fixtures "
        "(see tools/capture/README.md's SAS-020 note), not a real Spark capture. It proves the "
        "calibration pipeline runs end-to-end; the numbers are not final.\n\n"
        if synthetic
        else ""
    )
    sw = residuals["stage_wall_clock"]
    disk = residuals["disk_bytes_spilled"]
    gc = residuals["jvm_gc_time"]
    lines = [
        "# Calibration report",
        "",
        header.rstrip("\n"),
        f"Fitted {len(CONSTANT_NAMES)} constants against {residuals['n_fixtures']} runs "
        f"({residuals['n_tasks']} tasks), {datetime.now(timezone.utc).date().isoformat()}.",
        "",
        "```",
        f"  stage wall clock   MAE {sw['mae'] * 100:5.1f} %   R² {sw['r2']:.2f}",
        f"  disk bytes spilled MAE {disk['mae'] * 100:5.1f} %   R² {disk['r2']:.2f}",
        f"  jvm gc time        MAE {gc['mae'] * 100:5.1f} %   R² {gc['r2']:.2f}   <- worst; documented as a known weakness",
        "```",
        "",
        f"**CI gate:** stage wall-clock MAE must stay ≤ 12 %. Current: {sw['mae'] * 100:.1f} %.",
        "",
    ]
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--fixtures", required=True, help="packages/fixtures/data")
    parser.add_argument("--out", required=True, help="packages/sim/calibration/constants.generated.ts")
    parser.add_argument(
        "--report", default=os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "docs", "calibration-report.md")
    )
    args = parser.parse_args()

    fixtures = load_fixtures(args.fixtures)
    if not fixtures:
        raise SystemExit(f"No fixture JSON found under {args.fixtures}")

    synthetic = all(f.get("synthetic") is True for f in fixtures)

    primary = fit_primary_constants(fixtures)
    constants = {
        **primary,
        "NETWORK_BANDWIDTH_MBPS": fit_network_bandwidth(fixtures),
        "SERIALIZATION_RATIO": fit_serialization_ratio(fixtures),
        "OOM_THRESHOLD_RATIO": fit_oom_threshold_ratio(fixtures),
    }
    residuals = compute_residuals(fixtures, constants)

    with open(args.out, "w", encoding="utf-8") as f:
        f.write(render_constants_file(constants, residuals, synthetic))

    report = render_report(residuals, synthetic)
    with open(args.report, "w", encoding="utf-8") as f:
        f.write(report)

    print(f"Fitted {len(CONSTANT_NAMES)} constants against {residuals['n_fixtures']} runs ({residuals['n_tasks']} tasks).")
    print(
        f"  stage wall clock   MAE {residuals['stage_wall_clock']['mae'] * 100:5.1f} %   "
        f"R² {residuals['stage_wall_clock']['r2']:.2f}"
    )
    print(
        f"  disk bytes spilled MAE {residuals['disk_bytes_spilled']['mae'] * 100:5.1f} %   "
        f"R² {residuals['disk_bytes_spilled']['r2']:.2f}"
    )
    print(
        f"  jvm gc time        MAE {residuals['jvm_gc_time']['mae'] * 100:5.1f} %   "
        f"R² {residuals['jvm_gc_time']['r2']:.2f}   <- worst; documented as a known weakness"
    )
    if residuals["stage_wall_clock"]["mae"] > 0.12:
        print("\nWARNING: stage wall-clock MAE exceeds the 12% CI gate (docs/FIXTURES.md §6).")


if __name__ == "__main__":
    main()
