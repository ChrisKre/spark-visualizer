# Calibration report

> **SYNTHETIC DATA** — this report was generated against synthetic fixtures (see tools/capture/README.md's SAS-020 note), not a real Spark capture. It proves the calibration pipeline runs end-to-end; the numbers are not final.
Fitted 12 constants against 15 runs (4614 tasks), 2026-09-12.

```
  stage wall clock   MAE   0.9 %   R² 1.00
  disk bytes spilled MAE   1.3 %   R² 1.00
  jvm gc time        MAE  96.2 %   R² 0.07   <- worst; documented as a known weakness
```

**CI gate:** stage wall-clock MAE must stay ≤ 12 %. Current: 0.9 %.
