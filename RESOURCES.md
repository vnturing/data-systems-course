# Data Systems Resources

Verification status: entries below were located and checked via web search on 2026-11-09 unless marked otherwise.

## Knowledge

- [Course: Distributed Systems (8 lectures + notes) by Martin Kleppmann, Cambridge](https://martin.kleppmann.com/2020/11/18/distributed-systems-and-elliptic-curves.html)
  About 7 hours of video and 87 pages of notes covering RPC, two generals, system models, fault tolerance, time and clocks, causality, broadcast, replication, quorums, consensus, Raft, two-phase commit, linearizability, eventual consistency, Spanner. Notes PDF: https://www.cl.cam.ac.uk/teaching/2122/ConcDisSys/dist-sys-notes.pdf. Use for: Modules 0, 5, 8, 9. The notes PDF itself was only seen in search snippets; fetch and read the relevant sections before citing specifics.
- [Lecture: RPCs and failures, Princeton COS 418](https://www.cs.princeton.edu/courses/archive/fall25/cos418/docs/L4-rpc-failure.pdf)
  At-least-once, at-most-once with unique IDs, server crash and durable tables, concurrent duplicates, exactly-once and external actions. Fully read. Use for: Lesson 0001, retry and dedupe design.
- [Docs: Stripe API, Idempotent requests](https://docs.stripe.com/api/idempotent_requests)
  Production reference for idempotency keys (saved responses, parameter comparison, 24h pruning, concurrency). Use for: idempotency design. Docs change; re-check before each citation.
- [Course: MIT 6.5840 Distributed Systems](https://pdos.csail.mit.edu/6.824/index.html)
  Graduate course with papers, lectures and Go labs (MapReduce, Raft, sharded KV). Labs take roughly 20 to 40 hours each by one community estimate. Use for: optional deep implementation track after Modules 8 and 9.
- [Paper: In Search of an Understandable Consensus Algorithm (Raft), Ongaro and Ousterhout, USENIX ATC 2014](https://www.usenix.org/conference/atc14/technical-sessions/presentation/ongaro)
  Primary source for Raft; extended version on arXiv 1404.4097. Use for: Module 9 Raft lessons. Page located via search; open and read before citing section numbers.
- [Paper: Dynamo: Amazon's Highly Available Key-value Store, SOSP 2007](https://www.allthingsdistributed.com/2007/10/amazons_dynamo.html)
  Primary source for leaderless replication, sloppy quorums, hinted handoff, versioning with application-level conflict resolution. PDF: https://www.allthingsdistributed.com/files/amazon-dynamo-sosp2007.pdf. Use for: Module 5.
- [Essay: The Log, by Jay Kreps (LinkedIn Engineering, 2013)](https://engineering.linkedin.com/distributed-systems/log-what-every-software-engineer-should-know-about-real-time-datas-unifying)
  Practitioner essay on the log as the unifying abstraction behind replication, data integration and stream processing. Use for: Module 11.
- [Reference: Jepsen consistency models map](https://jepsen.io/consistency/models)
  Hierarchy of consistency models, with the phenomena each allows or forbids. Use for: Module 9 and for evaluating database claims.
- [Test suite: Hermitage by Martin Kleppmann](https://github.com/ept/hermitage)
  Concrete test cases that distinguish transaction isolation levels across real databases. Background post: https://martin.kleppmann.com/2014/11/25/hermitage-testing-the-i-in-acid.html. Use for: Module 7 isolation labs.
- [Article: Automating Hermitage for MySQL and MariaDB (theconsensus.dev, May 2026)](https://theconsensus.dev/p/2026/05/02/automating-hermitage.html)
  Practitioner re-run of Hermitage showing MySQL Repeatable Read still exhibits lost update and a write-predicate anomaly. Use for: Module 7 lab and "docs vs reality" discussion. Single author; reproduce before relying on specific table cells.
- [Docs: PostgreSQL SET TRANSACTION and concurrency control chapter](https://www.postgresql.org/docs/current/transaction-iso.html)
  Authoritative description of Read Committed, Repeatable Read (snapshot) and Serializable as implemented in Postgres. Use for: Module 7. URL not yet fetched; the SET TRANSACTION man page was seen via search.

## Wisdom (Communities)

- [Papers We Love](https://paperswelove.org)
  Community reading groups and talks on seminal papers (e.g. a 2026 Tokyo session on Dynamo). Use for: reading-group format, talk recordings. Learner has not yet opted in or out.

## Seen, not yet verified (do not cite until read)

- Kleppmann, "Please stop calling databases CP or AP" (martin.kleppmann.com/2015/02/11/...): referenced by a secondary site; fetch the original before Lesson 9.2.
- Kleppmann and Riccomini, Designing Data-Intensive Applications, 2nd ed. (O'Reilly, 2026): mentioned in Cambridge Databases notes. This course is inspired by the topic space, not a copy of any chapter.

## Gaps

- Storage engines: need primary sources for LSM-trees, B-trees/WAL, column stores (LSM paper, Bigtable, a column-store paper, RocksDB/LevelDB docs).
- Time and clocks: Lamport's "Time, Clocks..." paper, Spanner/TrueTime, fencing-token write-ups.
- Transactions: Berenson et al. "A Critique of ANSI SQL Isolation Levels", Cahill SSI paper, Helland "Life beyond distributed transactions".
- Streams and batch: MapReduce, Kafka paper, Flink/Dataflow model, Debezium/outbox pattern docs.
- Practitioner post-mortems per module (real incident write-ups) to anchor "failure modes" sections.
