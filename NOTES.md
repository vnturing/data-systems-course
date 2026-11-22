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
- 0023 secondary/covering/composite indexes (real MySQL 8.4.13: 1,000 vs 92 vs 20 access rows; covering vs ICP)
- 0024 in-memory databases and durability (crash-scope drill, real Redis 7.4.12 AOF and RDB process restarts)
- 0025 OLTP vs OLAP (finite FIFO contention lab, warehouse freshness, fact grain)
- 0026 columns, compression and vectors (real PyArrow 22.0.0/Parquet and DuckDB 1.4.2; sorted 1 of 20 eligible row groups vs shuffled 20)
- 0027 materialized views and cubes (before/after deltas, duplicate delivery and atomic marker crash; real DuckDB and MySQL roll-ups)
- Module 3 complete: lessons 18–27; checklist, home and syllabus updated. New measurements are in experiments/storage/results/ and are checked by tools/test-storage-extra.js.
- 0028 JSON/XML/CSV boundary contracts (actual browser JSON parsing, UTF-8/Base64 explorer, independent Python JSON/CSV results)
- 0029 schema-based binary formats (real Protobuf/Avro bytes; 70 independent library samples, explicit scalar presence)
- 0030 compatibility and rolling upgrades (role-deployment lab, retained history and rollback)
- 0031 database/service/broker dataflow (new→old updater→new; real binary preservation vs rebuilding/JSON loss)
- 0032 three-version migration workbook (nine pairs, removed-default replay trap, cents/dollars semantic assertions)
- Module 4 complete: lessons 28–32; reference/module-4-checklist.html, navigation, sources and experiments/encoding/ added. tools/test-encoding.js checks 70 wire fixtures, 54 Avro outcomes, intermediary round trips and migration invariants. Full checks and browser QA passed at 320px and 390px.
- 0033 single-leader replication (acknowledgement-stage drill; real MySQL 8.4.13 semi-sync while apply is stopped)
- 0034 failover/fencing (candidate history vs write authority; real stale promotion and unfenced divergence)
- 0035 replication log formats (statement/row drift model; actual binlog event inventory)
- 0036 lag anomalies (session reads, dependent histories and actual GTID wait/visibility)
- 0037 multi-leader conflicts (whole-record vs field/sibling policy, clock skew, stock admission counterexample)
- 0038 leaderless quorums (exact fixed-universe set enumeration and protocol assumptions)
- 0039 version vectors/siblings (context comparison, resolver join, deletion resurrection)
- 0040 CRDTs (PN-counter and observed-remove set; bounded algebraic laws)
- 0041 quorum failure lab (sloppy holders, partial failed writes, evidence-based repair/handoff)
- Module 5 complete: lessons 33–41; reference/module-5-checklist.html, navigation, source record, experiments/replication/ and test-replication.js. Full model/quiz checks pass; 21,343 quorum set pairs are enumerated. Browser controls, saved quiz progress, themes, labels, print and no-JS fallbacks passed; all nine pages fit 320px and 390px viewports.
- 0042 range/hash partitioning (routing locality vs weighted load; real MySQL pruning across four local partitions)
- 0043 skew/hot keys (fixed total work, independent-item salt buckets, read caching, indivisible conditional updates)
- 0044 local/global indexes (index and base fan-out; revalidation removes stale candidates but misses absent postings; real unique-key error 1503)
- 0045 rebalancing/consistent hashing (modulo vs fixed slots vs stable tokens; independent copy/catch-up/authority drill)
- 0046 routing/discovery (49 exact Redis slots; real CROSSSLOT, MOVED, ASK/ASKING and completed cutover)
- Module 6 complete: lessons 42–46; reference/module-6-checklist.html, navigation, sources, experiments/partitioning/ and test-partitioning.js. Full checks and five-lesson browser QA passed at 320px/390px, including controls, quiz progress, themes, labels, print and no-JS fallbacks.

## Measurement lessons from Module 3 (apply to every future module)
- A scrambled sequence (n*2654435761 mod 2^32) is NOT a random key source; it silently distorted the first B-tree numbers (76% fill / 223x became 66% / 141x). A model that shares the flaw will agree with a flawed experiment, so agreement is weak evidence.
- Real engines are non-deterministic: record ranges across repeated runs, not single values (RocksDB WA moved 4.98 vs 5.34; leveled absent-key reads 1.3 vs 2.1 depending on 4 vs 5 sorted runs).
- Absent-key probes must fall inside the key range; compression must be off to measure bytes; the model must be pinned to a committed measurements file so tests catch drift.
- Say plainly what the model does NOT cover (here: latency, range scans, concurrency, tuning) and what differs between engines being compared.

## Environment note
A real MySQL 8.0.46 was installed in the build sandbox (`apt-get install mysql-server`, started with `service mysql start`). It does not survive between tool calls: always start it in the same command as the work. Using it turned several "verified from documentation" claims into "reproduced" ones and caught two wrong predictions of my own (plan choice; UNION DISTINCT behavior). Module 3 also used real RocksDB through `pip install rocksdict` and read InnoDB page headers straight from the .ibd file. Background processes do not survive between tool calls, so start MySQL in the same command as the experiment.

## Next up
1. Module 7 (transactions), Lessons 47–55. Modules 4–6 were completed after Module 3 at the learner's request on 2026-11-22. Do not infer learner mastery from delivery; do not require another assessment before building the next outlined module.
2. Lessons learned: when a quick probe contradicts the intended story, the model or the claim is wrong, not the probe. MySQL's range boundary used the column after the range (92 entries, not 100); Redis restart settings differed from runtime settings; tiny compressed chunks grew with codec overhead. Preserve those observations.
3. New experiment environment: macOS host, Linux/arm64 Docker containers, isolated Python 3.14 venv. The older sandbox notes above describe historical experiments, not requirements for the current machine. Temporary containers have no published ports and are removed after verification. Do not connect experiments to the learner's existing servers.

## Measurement lessons from Module 3, second half
- Report access-node output rows with ICP state attached. ICP can hide rejected entries from that node's output count.
- A SIGKILL test leaves OS cache alive. It cannot establish host/power-loss durability or a worst-case loss window.
- Parquet column-chunk metadata provides encoded sizes and group eligibility, not actual device read counts. Sorted and shuffled layouts also compress differently.
- Batch dispatch counts do not measure CPU instructions, SIMD usage or latency.
- Keep all teaching models explicitly limited; real engine results live in committed fixtures, with reproduction scripts.

## Measurement lessons from Module 4
- Loading a Python exact-integer observation from a JSON fixture into JavaScript Number can round the evidence itself. The new test checks the literal 9007199254740993 token separately.
- Proto3 optional presence was chosen deliberately for the byte examples: explicit zero and empty string are serialized. Do not imply the same omission behavior for implicit-presence scalars.
- Binary Protobuf normal editing preserves our unknown currency; reconstructing known fields or converting the old message through JSON drops it. New-message ProtoJSON is rejected by the old schema by default.
- Avro int→long resolution is directional even for small values. The removed-default v1→v2→v3 example passes adjacent backward checks but fails reading v1 with v3.
- The unit metadata is deliberately ignored by the Avro decoder; semantic assertions establish the sample amount separately from parse success.
- All migration audits are declared-workload exercises, not registry policy implementations or deployed-fleet guarantees. No MySQL/Kafka integration or latency was measured in Module 4.

## Measurement lessons from Module 5
- Independent real MySQL 8.4.13 source/B/C experiment: private internal Docker network, no published ports, source binlog and InnoDB commit flush both 1. Containers and volumes removed in finally.
- Semi-sync receipt is not SQL apply: successful acknowledgement counter +1 while B's applier is stopped and its matching row count is 0.
- Read eligibility: record received GTIDs directly from performance_schema; the initial batch-mode vertical-status parser did not produce usable named fields. Execution wait returns 1 while stopped, 0 after apply, with matching row visibility changing 0→1.
- The official image lacks mysqlbinlog. Use SHOW BINLOG EVENTS and call the output an event inventory, not decoded row values. Rotate after scratch-account setup before capturing the workload inventory.
- Stale promotion loses a row from the current authority while B retains it; missing from authority is not destroyed on all disks. Old source and promoted C deliberately accepted divergent writes without fencing.
- Quorum enumeration establishes set intersection only for fixed membership. Partial writes, substitute holders, version ordering and concurrent admission require additional arguments.
- Causal comparison and state joins are bounded pure models. Actor allocation, durable metadata, eventual delivery and safe reclamation are assumptions. CRDT merge convergence does not enforce inventory admission.

## Measurement lessons from Module 6
- MySQL 8.4.13 partition pruning is a single-server observation, not distributed sharding. An indexed ID probe searched all four day partitions; the day range pruned to p2. Plans list partitions; matching-row counts do not measure physical reads.
- UNIQUE(id) without the RANGE partition column failed with 1503. Adding the column to the unique key changes the identity guarantee to a pair.
- Redis 7.4.12 cluster: 49 CLUSTER KEYSLOT examples independently match the browser's CRC16/tag implementation; special empty/unclosed tags and Unicode are included.
- A quiescent one-key move verified ASK during import, MOVED at the target without ASKING, successful ASKING+GET on one connection, then MOVED to the new owner after cutover. No concurrent migration or failover was tested.
- Rebalancing counts are pure equal-size-key model results, not bytes or network timings. Stable ring tokens/fixed slots changed ownership only to the added node; modulo also moved keys between old nodes.
- Independent-item salting trades write concentration for logical read fan-out. Repeated reads and serialized admission have different mitigation contracts.
- Local/global index placement is modeled independently of cloud internals. Revalidation cannot recover a posting absent from the candidate list. Capture/replay and fencing switches represent assumptions, not implemented migration protocols.
