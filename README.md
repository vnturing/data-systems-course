# Data Systems Field Course

A deep, hands-on course on how data systems work and fail: storage engines, replication, partitioning, transactions, consensus, batch and stream processing. Static site, no build step.

## Run locally
```
python3 -m http.server 8000
# open http://localhost:8000
```

## Deploy on GitHub Pages
Option A (simplest): push this folder to a repo, then Settings > Pages > "Deploy from a branch" > `main` / root.
Option B (included): Settings > Pages > Source: "GitHub Actions". The workflow in `.github/workflows/pages.yml` runs the tests and deploys on every push to `main`.

All links are relative, so it works under `https://<user>.github.io/<repo>/`.

## Quality checks
```
sh tools/check-all.sh       # runs every model test and the quiz lint
```
Individual checks: `node tools/test-sim.js`, `test-dualwrite.js`, `test-detector.js`, `test-kafka.js`, `test-retry.js`, `test-redundancy.js`, `test-latency.js`, `test-fanout.js`, `test-queue.js`, `test-slo.js`, `test-admission.js`, `test-planner.js`, `test-graph.js`, `test-layout.js`, `test-m2m.js`, `test-schema.js`, `test-log.js`, `test-wal.js`, `test-lsm.js`, `test-btree.js`, `test-ui-constants.js`, `test-storage-extra.js`, `test-encoding.js`, `test-replication.js`, `test-partitioning.js`, and `python3 tools/check-quiz.py` (equal option word counts, varied answer positions).

## Reproduce the MySQL measurements
Module 2's "measured" numbers come from `experiments/mysql/` (see its README). `python3 experiments/mysql/verify_lesson_sql.py` executes every SQL block in the lessons against a local MySQL 8; it is not part of the CI check because it needs a server.

## Reproduce the storage measurements
Module 3's "measured" numbers come from `experiments/storage/` (real InnoDB and RocksDB; see its README, including the measurement mistakes kept on purpose). `measurements.json` there is what the model tests are pinned to.

Module 3 is complete through Lesson 27. Its second-half experiments add real MySQL 8.4 index plans, Redis process-crash recovery, and Parquet/DuckDB results under `experiments/storage/results/`. Reproduction and the limits of each measurement are documented in the same README. The website and CI still need only Node and Python's standard library; Docker and analytical packages are optional experiment dependencies.

## Reproduce the encoding checks

Module 4 is complete through Lesson 32. `experiments/encoding/` contains independent real Avro/Protobuf cross-checks: 70 wire examples, 54 Avro reader/writer outcomes, intermediary round trips and text-parser cases. Its README records setup and limits; Python packages are optional reproduction dependencies, not website or CI dependencies.

## Reproduce the replication checks

Module 5 is complete through Lesson 41. `experiments/replication/` records real MySQL 8.4 receipt/apply, semi-sync, stale-promotion and divergent-writer observations. Its script uses three disposable containers on an internal network with no published ports and cleans them up. Browser models separately expose quorum assumptions, version vectors and CRDT merges. Docker is an optional reproduction dependency; website and CI checks use the committed observations and pure models.

## Reproduce the partitioning checks

Module 6 is complete through Lesson 46. `experiments/partitioning/` records real MySQL partition pruning/unique-key constraints and Redis Cluster hash slots, cross-slot rejection and MOVED/ASK migration behavior. Its scripts own disposable resources with no published ports and remove them afterward. The browser separately models placement, skew, secondary-index lag and cutover assumptions. Docker is optional for reproduction; website and CI use pure models and committed fixtures.

## Layout

- `index.html`, `syllabus.html`: entry points
- `lessons/NNNN-slug.html`: one tightly scoped lesson each
- `reference/`: printable reference sheets
- `assets/`: shared CSS and JS (theme, quiz widget, simulators)
- `MISSION.md`, `RESOURCES.md`, `NOTES.md`, `GLOSSARY.md`, `learning-records/`: teaching workspace files

## Content policy
Original writing. Concepts are drawn from cited public sources (papers, lecture notes, vendor docs, engineering blogs). No book text is reproduced.
