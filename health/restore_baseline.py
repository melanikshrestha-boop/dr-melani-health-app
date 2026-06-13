#!/usr/bin/env python3
"""Restore all baseline lab data from seed_baseline.json."""

from health.db import seed_baseline, _ensure_screening, init_db

if __name__ == "__main__":
    init_db(seed=False)
    seed_baseline()
    _ensure_screening()
    print("All baseline lab data restored.")
