# GPU-13 §4 — chip-atlas occupancy & build cadence

_Generated 2026-08-02T15:03:01.025Z · ALL-TYPES scene · cal 3.3 ms._

Measurement 2 — atlas occupancy (rows consumed / atlas edge). A merged
node+label atlas needs the two middle columns to fit in ONE atlas at the
ADR 0038 §6 clamp.

| N | node chip atlas | label chip atlas |
|---|---|---|
| 250 | 630 / 8192 (7.7%), 255 slots | 226 / 4096 (5.5%), 65 slots |
| 500 | 1190 / 8192 (14.5%), 505 slots | 454 / 4096 (11.1%), 125 slots |
| 750 | 1750 / 8192 (21.4%), 755 slots | 682 / 4096 (16.7%), 188 slots |
| 1000 | 2310 / 8192 (28.2%), 1005 slots | 834 / 4096 (20.4%), 250 slots |
| 1250 | 2950 / 8192 (36%), 1255 slots | 1062 / 4096 (25.9%), 313 slots |
| 1500 | 150 / 8192 (1.8%), 5 slots | 1290 / 4096 (31.5%), 375 slots |
| 2000 | 150 / 8192 (1.8%), 5 slots | 1746 / 4096 (42.6%), 500 slots |
| 5000 | 150 / 8192 (1.8%), 5 slots | 4028 / 4096 (98.3%), 1122 slots **FULL** |

Measurement 3 — `data-build-count` delta across a 10-step pan. Zero on every
layer means the scene-change trigger is the only thing that rebuilds, so a
merged single-pass build inherits the same cadence (ADR 0038 §5).

| N | nodes | labels | connectors | rectangles |
|---|---|---|---|---|
| 250 | 0 | 0 | 0 | 0 |
| 500 | 0 | 0 | 0 | 0 |
| 750 | 0 | 0 | 0 | 0 |
| 1000 | 0 | 0 | 0 | 0 |
| 1250 | 0 | 0 | 0 | 0 |
| 1500 | 0 | 0 | 0 | 0 |
| 2000 | 0 | 0 | 0 | 0 |
| 5000 | 0 | 0 | 0 | 0 |
