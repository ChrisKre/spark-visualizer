// PLACEHOLDER — hand-written, not generated. SAS-025 (E3) replaces this file by running
// `tools/capture/calibrate.py` against real fixtures; until then these numbers exist only so the
// additive cost model (docs/SIMULATOR_SPEC.md §2 Step 4) has something to divide by. Do not
// treat them as calibrated, and never hand-edit this file once SAS-025 lands — see
// docs/CONTRIBUTING.md.

export const DESERIALIZE_MS_PER_TASK = 2;
export const READ_THROUGHPUT_MBPS = 400;
export const CPU_NS_PER_ROW = 50;
export const SORT_NS_PER_ROW_LOG = 20;
export const SHUFFLE_WRITE_THROUGHPUT_MBPS = 150;
export const NETWORK_BANDWIDTH_MBPS = 1000;

// Spill & GC (SAS-018) — also PLACEHOLDER until SAS-025.
export const SERIALIZATION_RATIO = 0.35;
export const SPILL_WRITE_THROUGHPUT_MBPS = 200;
export const SPILL_READ_THROUGHPUT_MBPS = 250;
export const SPILL_MERGE_COST_MS = 5;
export const OOM_THRESHOLD_RATIO = 1.8;
export const GC_BASE_MS = 50;
