# tools/capture

PySpark jobs that turn a real cluster run into a committed fixture: `00_configure.py`, the
scenario runner, `10_reduce.py`. Pure Python — deliberately **not** a pnpm workspace member.

Not part of CI (`docs/TECH_STACK.md`: "Capture side... Fixture generation only, run
manually."). Scripts and the capture-environment write-up land in SAS-020/021 (E3).
