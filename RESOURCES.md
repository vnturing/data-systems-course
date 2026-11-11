# Data Systems Resources

Verification status: entries below were located and checked via web search on 2026-11-09 (first batch) and 2026-11-10 (second batch) unless marked otherwise. "Secondary" means a blog, vendor page or notes that restate a primary source; verify against the primary before relying on specifics.

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

### Added 2026-11-10 (Lessons 2 to 5)

- [Blog: Reliable Microservices Data Exchange With the Outbox Pattern, Debezium](https://debezium.io/blog/2019/02/19/reliable-microservices-data-exchange-with-the-outbox-pattern/)
  Primary source for the outbox pattern and the Outbox Event Router. Fully read via search snippets; fetch before quoting details. Use for: Lesson 2, Module 11.
- [Doc: Kafka message delivery guarantees, Confluent](https://docs.confluent.io/kafka/design/delivery-semantics.html)
  Producer retries, idempotent producer (0.11.0.0), transactional delivery, Streams exactly-once. Use for: Lessons 2, 4; Module 11.
- [Blog: Transactions in Apache Kafka, Confluent](https://www.confluent.io/blog/transactions-apache-kafka/)
  What transactions guarantee: atomic read-process-write cycles and zombie fencing. Use for: Lesson 2, Module 11.
- [Article: Amazon Builders' Library, Timeouts, retries, and backoff with jitter (Marc Brooker)](https://aws.amazon.com/builders-library/timeouts-retries-and-backoff-with-jitter)
  Primary. Timeouts by percentile (false-timeout rate), selfish retries, backoff, jitter, side effects, layered retries. Read via search snippets only; fetch the full article before citing section-level detail (token buckets, circuit breakers). Use for: Lesson 5.
- [Blog: Exponential Backoff And Jitter, AWS Architecture Blog (Marc Brooker)](https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/)
  Primary. Full, equal and decorrelated jitter; simulation of optimistic concurrency control; SDK support note. Use for: Lesson 5.
- [Docs: Amazon SQS FIFO key terms](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/FIFO-key-terms.html) and [Exactly-once processing in SQS](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/FIFO-queues-exactly-once-processing.html)
  5-minute deduplication interval; dedupe id tracked after delete. Use for: Lesson 5, Module 11. Standard-queue at-least-once semantics were only confirmed via a secondary source; fetch the AWS standard-queue page.
- [Lecture: RPCs and failures, Princeton COS 418] (see above) also backs Lessons 2 and 5.
- [Slides: Models of Distributed Systems, University of Toronto ECE419](https://www.eecg.toronto.edu/~ashvin/courses/ece419/current/lectures/03-models.pdf)
  Derived from Kleppmann and Harris's notes. System model axes, failure detectors (perfect vs eventually perfect). Use for: Lesson 3, Module 8.
- [Slides: Basic distributed abstractions, ULiege INFO8002 (Louppe)](https://glouppe.github.io/info8002-large-scale-data-systems/pdf/lec2.pdf)
  Process, link and timing abstractions. Use for: Lesson 3.
- [Explainer: Defining Safety and Liveness (Will Schultz)](https://will62794.github.io/formal-methods/2020/08/01/safety-and-liveness.html)
  Educator write-up of Alpern and Schneider 1985 with the finite-prefix characterization. Companion: [Northeastern slides](https://khoury.northeastern.edu/~stavros/10-safety-liveness.pdf). Original paper: Alpern and Schneider, "Defining Liveness", IPL 21(4), 1985, doi 10.1016/0020-0190(85)90056-0 (not fetched). Use for: Lesson 4, Module 9.
- Secondary, used with labels in lessons: RisingWave on Debezium at-least-once ([link](https://risingwave.com/blog/cdc-exactly-once-semantics-debezium-risingwave)); The Main Thread on a Quarkus outbox ([link](https://www.the-main-thread.com/p/quarkus-checkout-outbox)); ActiveWizards on Kafka EOS ([link](https://activewizards.com/blog/kafka-exactly-once-semantics-guide/)); Manning liveBook Kafka concept pages; Conduktor Kafka docs on min.insync.replicas and unclean election; AxonOps broker config; NextPoint review of the Builders' Library article; Lumigo summary of the same.

### Added 2026-11-10 (Module 1, Lessons 6 to 11)

- [Paper: Basic Concepts and Taxonomy of Dependable and Secure Computing, Avizienis, Laprie, Randell, Landwehr, IEEE TDSC 2004](https://drum.lib.umd.edu/handle/1903/6459)
  Primary. Fault/error/failure definitions and the four means. Verified via the abstract and open copies plus two sets of course slides (University of Pisa, MTU); the full text was not read end to end. Edinburgh copy: https://www.inf.ed.ac.uk/teaching/courses/seoc/2006_2007/resources/BasicConcepts.pdf. Use for: Lesson 6. The "failure of a component is a fault for the system using it" framing is my reading of the chain model; confirm in the paper's discussion of propagation.
- [Paper: On Designing and Deploying Internet-Scale Services, James Hamilton, LISA '07](https://www.usenix.org/conference/lisa-07/designing-and-deploying-internet-scale-services)
  Primary. PDF: https://pages.cs.wisc.edu/~remzi/Classes/739/Papers/hamilton07.pdf. Read via search excerpts and two summaries, not cover to cover. Only the section title "Graceful Degradation and Admission Control" was verified for that topic. Use for: Lessons 6 and 11, Module 12 operability material.
- [Paper: The Tail at Scale, Dean and Barroso, CACM 2013](https://research.google/pubs/pub40801/)
  Primary. All figures used in Lesson 7 (63%, 2,000-server example, hedged requests ~5% extra load, tied requests 16%/40%, canary requests, micro-partitions) were verified in Adrian Colyer's summary, which I fetched in full: https://blog.acolyer.org/2015/01/15/the-tail-at-scale/. Use for: Lesson 7.
- [Post: Coordinated Omission, Gil Tene, mechanical-sympathy list, 2013](https://groups.google.com/g/mechanical-sympathy/c/icNZJejUHfE)
  Primary. The ~535 missing observations example and "a measurement methodology problem in load testers". Talk: "How NOT to Measure Latency" (CO part starts ~33:50 per Tene). Use for: Lesson 7.
- [Book chapter: Google SRE book, ch. 4 Service Level Objectives](https://sre.google/sre-book/service-level-objectives)
  Primary. SLI/SLO/SLA definitions, few indicators, proxies verified directly. Statements about percentiles/distributions, error-budget release policy and "100x more" were verified only through secondary quotations (ClickHouse, Coding Blocks). Chapter 3 "Embracing Risk" not fetched. Use for: Lesson 10.
- [Blog: Building good SLOs, CRE life lessons, Google Cloud, 2017](https://cloud.google.com/blog/products/gcp/building-good-slos-cre-life-lessons/)
  Primary-adjacent. Two-threshold latency SLO table; slow requests counted as downtime. Use for: Lesson 10.
- [Talk: Timelines at Scale, Raffi Krikorian, QCon SF 2012](https://www.infoq.com/presentations/Twitter-Timeline-Scalability)
  Primary, **not watched**. Lesson 8 cites it only through secondary retellings (High Scalability, learning-software-engineering.github.io, dev.to articles), which disagree on write rates (about 5K to 12K/s) and hybrid thresholds (10K to 1M followers). No Twitter number is used as a model input. Watch the talk before making any factual claim about Twitter's design.
- [Article: M/M/1 queue, Wikipedia](https://en.wikipedia.org/wiki/M/M/1_queue)
  Secondary. Formulas for mean response. The p99 = ln(100)/(1-rho) result for FCFS and the Pollaczek-Khinchine M/G/1 formula are standard; this course verifies them numerically in `tools/test-queue.js` (they are not quoted from Wikipedia).
- Secondary, used with labels: ClickHouse "Percentiles vs averages" and "SLO, SLI, SLA"; Zuplo on load-test workload models; Kiril Latish on Little's law; DZone and Third Bit queueing articles (further reading only); Murat Demirbas and Adrian Colyer summaries of Hamilton.

## Wisdom (Communities)

- [Papers We Love](https://paperswelove.org)
  Community reading groups and talks on seminal papers (e.g. a 2026 Tokyo session on Dynamo). Use for: reading-group format, talk recordings. Learner has not yet opted in or out.

## Seen, not yet verified (do not cite until read)

- Official Apache Kafka documentation for `unclean.leader.election.enable`, `min.insync.replicas` and `acks`. Lesson 4 relies on secondary sources and a Cloudera page for an older Kafka that lists a different default (true). Fetch kafka.apache.org docs for the current version and replace those citations.
- Debezium MySQL connector documentation and Outbox Event Router docs: confirm MySQL support and delivery semantics directly (Lesson 2 cites secondary sources for MySQL support).
- Datadog, "Kafka at Datadog": mentioned by Conduktor as a practitioner view on unclean election; not read.
- Kleppmann, "Please stop calling databases CP or AP" (martin.kleppmann.com/2015/02/11/...): referenced by a secondary site; fetch the original before Lesson 9.2.
- Kleppmann and Riccomini, Designing Data-Intensive Applications, 2nd ed. (O'Reilly, 2026): mentioned in Cambridge Databases notes. This course is inspired by the topic space, not a copy of any chapter.

## Gaps

- MySQL-specific: replication and semi-sync docs, InnoDB isolation levels and MVCC, Group Replication, binlog/GTID, Debezium MySQL connector. (Learner runs MySQL.)
- AWS-specific: RDS and Aurora failover behavior, MSK defaults and configuration, DynamoDB consistency and transactions, SQS standard queue docs, SDK retry modes and defaults per language.
- Module 1 follow-ups: read the SRE book ch. 3 and the SRE Workbook's SLO and alerting chapters directly (multi-window burn-rate alerting); watch the Krikorian talk; read Hamilton's admission-control section; find a primary queueing text (e.g. a Kleinrock or Harchol-Balter chapter) to replace the Wikipedia citation; AWS CloudWatch percentile statistics and aggregation behavior (not verified).
- Storage engines: need primary sources for LSM-trees, B-trees/WAL, column stores (LSM paper, Bigtable, a column-store paper, RocksDB/LevelDB docs).
- Time and clocks: Lamport's "Time, Clocks..." paper, Spanner/TrueTime, fencing-token write-ups.
- Transactions: Berenson et al. "A Critique of ANSI SQL Isolation Levels", Cahill SSI paper, Helland "Life beyond distributed transactions".
- Streams and batch: MapReduce, Kafka paper, Flink/Dataflow model, Debezium/outbox pattern docs.
- Practitioner post-mortems per module (real incident write-ups) to anchor "failure modes" sections.
