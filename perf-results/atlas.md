# GPU-13 §4 — chip-atlas occupancy & build cadence

_Generated 2026-08-02T19:37:00.015Z · ALL-TYPES scene · cal 3.1 ms._

Measurement 2 — occupancy of the ONE merged atlas (rows consumed / atlas
edge), with the pages and draw calls it needed. §8 records that the merged
chip set does NOT fit the 4096 high-DPR clamp at large N, so pages > 1 (and
draw calls > 1) is the designed degradation, not a failure.

| N | merged chip atlas |
|---|---|
| 1000 | 2766 / 8192 (33.8%), 1257 slots, 1 page(s), 1 draw call(s) |
| 2000 | 986 / 8192 (12%), 507 slots, 1 page(s), 1 draw call(s) |
| 5000 | 2354 / 8192 (28.7%), 1257 slots, 1 page(s), 1 draw call(s) |

Measurement 3 — `data-build-count` delta across a 10-step pan. Zero means
the scene-change trigger is the only thing that rebuilds (ADR 0038 §5).

| N | merged canvas |
|---|---|
| 1000 | 0 |
| 2000 | 0 |
| 5000 | 0 |
