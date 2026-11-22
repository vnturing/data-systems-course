# Working notes

## Learner preferences (stated)
- Goal: design better systems at work. Starting point: solid backend dev, new to distributed systems.
- Stack: MySQL, Kafka, AWS.
- Wants depth above all; no surface tour. Balanced mix of essays and interactive labs.
- Self-paced. Prefers not to go back and forth on tasks; will ask questions when stuck. Deliver material in bulk as patches. "Do this at work" items are optional and nothing may depend on them.
- Raft implementation track: deferred.
- Deliverable is a static site deployable to GitHub Pages; continuations are delivered as git patches (`git am`).
- Content must be original and source-grounded, not a reproduction of the book.

## Open questions for the learner (non-blocking; answer only if useful)
- Resolved 2026-11-10: no preference among AWS data services. Keep labs vendor-neutral and mention AWS/MySQL/Kafka counterparts where verified.
- Interested in a reading-group community or not? Recorded as undecided in RESOURCES.md.

## Design decisions
- Static HTML/CSS/JS, no build step, relative links so it works on any Pages path.
- Progress lives in browser localStorage (wrapped in try/catch); nothing server-side.
- Quiz rules: all options in a question have equal word count; correct-answer positions vary; no shuffle. Enforced by `tools/check-quiz.py`.
- Every simulator is a pure model plus a thin DOM layer, with a node test under `tools/`. Models are labeled as illustrative where they simplify.
- Each lesson: win statement, 1-2 interactives, retrieval quiz, optional apply box, sources list with secondary sources labeled. Each module also gets a reference sheet.
- When a model contradicts a claim from a source, do not tune the model to agree. Isolate the mechanism in a different experiment and say what each one does and does not show (see Lesson 5).
- GLOSSARY.md stays empty until the learner demonstrates use of a term (per teach-skill rules).

## Build log
- 0001 timeout problem (idempotency keys)
- 0002 crash-point drill (MySQL + Kafka dual write, outbox)
- 0003 system models (failure-detector lab)
- 0004 safety and liveness (Kafka partition lab, 8-config matrix with 3 disaster scenarios)
- 0005 retries (herd lab and outage lab)
- reference/module-0-checklist.html
- 0006 faults, errors, failures (fault/error/failure drill; redundancy vs common-mode lab)
- 0007 percentiles and the tail (percentile merging, fan-out + hedging, coordinated omission labs)
- 0008 fan-out on write or read (two-objective model; found that follower count cancels in total-work terms)
- 0009 queueing and the cliff (Lindley simulator validated against M/M/1 and Pollaczek-Khinchine; Little's law)
- 0010 SLIs, SLOs, error budgets (budget/burn-rate calculator, dependency ceiling)
- 0011 operability and admission control (fluid model: unbounded FIFO collapses and stays collapsed ~45 ticks after the surge)
- reference/module-1-checklist.html
- 0012 relational or document (layout lab calibrated on real MySQL: 13 reads vs 1, 1 row vs 400 docs, 401 vs 20,003 reads)
- 0013 many-to-many (articles/tags lab, drift sequence)
- 0014 schema on read or write (three readers lab; JSON_SCHEMA_VALID verified, error 3819)
- 0015 graph models (traversal model cross-checked exactly against MySQL recursive CTEs; UNION DISTINCT + counter gotcha, error 3636)
- 0016 declarative vs imperative (toy planner calibrated against five MySQL configurations; 42x spread; near-tie plan flipping; estimate 3,896 vs actual 20,000)
- 0017 lab: model one workload three ways (workbook over the layout model)
- reference/module-2-checklist.html; experiments/mysql/ (reproduction scripts + verify_lesson_sql.py)
- 0018 append-only log + hash index (real bytes + CRC; 1,400 randomized crash/corruption trials)
- 0019 LSM-tree (mini LSM calibrated against real RocksDB: WA within ~8% at larger sizes)
- 0020 compaction and the three amplifications (leveled vs size-tiered; bloom filters; peak space amp)
- 0021 B-trees, pages and the WAL (real InnoDB: height, fill, 141x..5.4x pool curve; split crash drill with/without WAL and doublewrite)
- 0022 B-tree vs LSM (same workload, three engines; explicit list of what was not measured)
- reference/module-3-checklist.html; experiments/storage/ (measurements.json is the single source of truth for model tests)

## Measurement lessons from Module 3 (apply to every future module)
- A scrambled sequence (n*2654435761 mod 2^32) is NOT a random key source; it silently distorted the first B-tree numbers (76% fill / 223x became 66% / 141x). A model that shares the flaw will agree with a flawed experiment, so agreement is weak evidence.
- Real engines are non-deterministic: record ranges across repeated runs, not single values (RocksDB WA moved 4.98 vs 5.34; leveled absent-key reads 1.3 vs 2.1 depending on 4 vs 5 sorted runs).
- Absent-key probes must fall inside the key range; compression must be off to measure bytes; the model must be pinned to a committed measurements file so tests catch drift.
- Say plainly what the model does NOT cover (here: latency, range scans, concurrency, tuning) and what differs between engines being compared.

## Environment note
A real MySQL 8.0.46 was installed in the build sandbox (`apt-get install mysql-server`, started with `service mysql start`). It does not survive between tool calls: always start it in the same command as the work. Using it turned several "verified from documentation" claims into "reproduced" ones and caught two wrong predictions of my own (plan choice; UNION DISTINCT behavior). Module 3 also used real RocksDB through `pip install rocksdict` and read InnoDB page headers straight from the .ibd file. Background processes do not survive between tool calls, so start MySQL in the same command as the experiment.

## Next up
1. Module 3, second half (Lessons 23 to 27): secondary/covering/composite indexes with EXPLAIN on the real MySQL; in-memory databases and durability (Redis persistence modes, real fsync behavior); OLTP vs OLAP; column storage, compression, vectorized execution (can be measured with Parquet/DuckDB if pip-installable and with MySQL for the row-store side); materialized views and data cubes. Sources first (see RESOURCES.md Gaps).
2. Then Module 4 (encoding and evolution).
3. Lessons learned this patch: when a quick probe contradicts the intended story, the model or the claim is wrong, not the probe. Three times across the last two patches (jitter, Kafka disk loss, fan-out) the fix was a better experiment, not a tuned parameter.
