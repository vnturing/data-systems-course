# Transaction isolation experiments (Module 7)

Original, controlled two-session schedules inspired by Hermitage's small-history method. These are independent server observations, not outputs of the browser models, and not the full Hermitage suite. No existing user database is accessed.

## Reproduce

Requirements: Python 3 standard library and Docker with the `mysql:8.4` and `postgres:18-alpine` images available (Docker can fetch missing images).

```sh
# From the repository root:
python3 experiments/transactions/isolation.py /tmp/dsc-transactions-run
```

The script creates uniquely named, labeled containers with `--network none`, no published ports and no host mounts. Clients execute inside the containers. Empty/trust authentication is confined to these disposable instances. Finally it removes only the containers it created and their anonymous volumes, including on an ordinary failure or interrupt. A force-killed Python process or Docker outage can prevent cleanup: inspect resources with the `dsc-course-experiment=m7` label before removing any leftovers.

The supplied output directory receives `mysql-results.json`, `postgres-results.json` and the corresponding `*-transcript.json` files. Committed observations in `results/` were obtained using MySQL 8.4.13 and PostgreSQL 18.7 on Linux/arm64; image IDs and server versions are recorded. Tags can advance. Compare your results with these fixtures instead of silently replacing them. No third-party Python driver is required.

## What runs

MySQL (17 schedules):

- Explicit rollback restores a changed counter.
- Read uncommitted sees a pending 900 that rolls back; read committed sees committed 100.
- A conflicting uncommitted write blocks until error 1205 under the deliberate one-second timeout.
- Read committed rereads 100→110; ordinary repeatable read rereads 100→100.
- START TRANSACTION precedes a commit; first consistent read includes it (110), a later plain read stays 110, while FOR UPDATE reads current 120.
- Two stale replacements commit final 110, even under repeatable read. The second replacement changes zero rows because its assigned value is already present; SQL execution and commit still succeed.
- Atomic increments produce 120; compare-and-set accepts one attempt with affected counts [1,0]; locking before reading produces reads [100,110] and final 120.
- Two-doctor write skew leaves zero on call. A shared guard followed by fresh read-committed validation leaves one. The corrected schedule runs A then B; it validates the ordered decisions, not a throughput claim or audit of every writer.
- A committed insertion changes a read-committed predicate count 2→3; the old repeatable-read view stays 2→2.
- An indexed repeatable-read locking range blocks a matching insertion until error 1205.
- A real opposite-order lock cycle triggers error 1213. The harness observes the first waiting edge before creating the second; victim choice may vary.

PostgreSQL (3 schedules):

- Repeatable read rejects a same-row stale replacement with SQLSTATE 40001; final value is 110 after the first accepted write. No retry is performed in this observation.
- Repeatable read allows the two-doctor disjoint-write skew (zero remain).
- Serializable rejects one of those decisions with SQLSTATE 40001; one doctor remains. The committed transcript records where the failure occurred in this run, without promising the same victim/error statement for every schedule variant.

## Harness details and mistakes preserved

Each A/B client is persistent. Every query ends with a unique response marker, so the next step waits for an actual response. Expected SQL errors are recorded and asserted. MySQL force mode keeps its client alive after an expected error. A queue gives each query a bounded response deadline; server-side statement/lock timeouts keep intentional waits finite.

Client stderr is redirected into stdout **inside** the container before Docker transports the output. Merging only at the host was an incorrect first implementation: Docker's separate stream delivery could expose the success marker before the error, making an SSI commit look successful. A separate transaction-ID/predicate-lock probe exposed the harness bug. The final observations use the corrected stream ordering. PostgreSQL readiness checks TCP to avoid mistaking its temporary initialization server for the final instance.

MySQL settings record the initial level, commit flush=1, sync_binlog=1 and innodb_rollback_on_timeout=0. A 1205 error does not imply whole-transaction rollback; the lab explicitly rolls back. A detected deadlock rolls back the victim transaction. The short lock timeout is a test bound, not an operational recommendation or measured latency. The separate deadlock schedule increases that timeout to ten seconds and allows five seconds to observe its first wait edge, so slower machines do not need to beat the one-second blocking-test deadline.

## Limits

These schedules distinguish specific behavior; their success is not a proof of isolation for every SQL history. A counterexample can refute a broad claim, but a finite passing suite cannot establish every engine guarantee. There is no performance comparison, process/host/power crash, replication, network failure, failover, cross-partition transaction or application-side effect test. The browser's commit-event visibility model omits InnoDB's active-transaction read-view bookkeeping and physical undo/index details. Its SSI model is a two-transaction witness, not PostgreSQL's detector or abort prediction algorithm.

`node tools/test-transactions.js` checks the committed observations and their embedded lesson copy, then separately verifies pure model invariants, version visibility and independently enumerated interleavings. Docker is not part of website runtime or CI.

Primary background: [MySQL 8.4 isolation](https://dev.mysql.com/doc/refman/8.4/en/innodb-transaction-isolation-levels.html), [PostgreSQL 18 isolation](https://www.postgresql.org/docs/18/transaction-iso.html), [Hermitage](https://github.com/ept/hermitage), [SSI implementation paper](https://vldb.org/pvldb/vol5/p1850_danrkports_vldb2012.pdf).
