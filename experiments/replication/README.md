# Replication evidence for Module 5

This directory separates real server observations from finite mathematical models. Neither is a production consistency certification.

## Real MySQL experiment

```sh
python3 experiments/replication/mysql_replication.py /tmp/dsc-m5-results
```

Requires Docker and the official `mysql:8.4` image. Tested on MySQL **8.4.13**, Linux/arm64 containers under Colima on macOS. The image tag moves; the actual server version is recorded in `results/mysql-results.json`.

The script creates three named `dsc-course-m5-*` containers and an internal Docker network. It publishes no ports and connects to no host database. It owns a scratch `m5` schema and an intentionally disposable replication account. It records each successfully created container ID before starting it, then removes those containers, including their anonymous data volumes, and its own network in `finally`, even when startup fails. A resource-name collision fails instead of reusing an existing server. An externally killed Python process can bypass cleanup; inspect the `dsc-course-experiment=m5` labels before removing leftover resources.

Durability settings: `sync_binlog=1`, `innodb_flush_log_at_trx_commit=1`. All servers use GTID mode and row binlogging. Semi-sync is enabled explicitly for the relevant phase, with its acknowledgement counter checked. The log is rotated after initial scratch-account setup so the recorded event inventory contains the subsequent workload rather than account setup statements.

Observed phases:

1. Bootstrap one source and B/C replicas; wait for the initial source GTID set on each.
2. Stop only B's SQL applier. Write row 2 on the source. Verify that B's received transaction set contains the required source GTIDs while the row is absent. The GTID execution wait times out (return 1); after apply resumes it succeeds (0), and the row appears.
3. Enable semi-sync source/B plugins, verify the connected semi-sync client, then stop B's SQL applier. Write row 3. The source's successful semi-sync acknowledgement count rises by 1 while B's visible row count is still 0. Resume and catch up.
4. Stop C's replication. Write row 4 on the source and wait for B. Make stale C writable: C lacks the acknowledged row, B retains it.
5. Intentionally leave the old source writable. It accepts row 5 while C accepts row 6. Resulting ID sets diverge: source {1,2,3,4,5}; C {1,2,3,6}.
6. Use `SHOW BINLOG EVENTS` to record `Gtid`, transaction framing, `Table_map`, `Write_rows` and commit events. This is an event inventory, not a decoded row-image dump.

The official image lacks `mysqlbinlog`; an initial attempt to use that executable failed after the behavioral checks. The final script uses server-side event inspection and records what it actually establishes. A separate fixture issue was caught: batch-mode vertical status output was unsuitable for the original field parser, so receipt is verified and recorded directly from `performance_schema.replication_connection_status` instead.

GTID UUIDs and binlog positions change between runs. Compare outcomes and event types, not UUID literals or wall-clock durations. These are deliberate thread stops and manual promotions. **Not tested:** power loss, storage-device honesty, a real network partition, automated election, a fencing implementation, WAN latency, production parallel-apply visibility or a named failover product. All-applied acknowledgement ticks in the browser are a separate illustrative contract, not a MySQL mode.

## Pure model checks

Run `node tools/test-replication.js`, or the normal `sh tools/check-all.sh`. No Docker is needed for CI or the website; committed fixtures supply the independent server observations.

- Exhaustively enumerate every nonempty read/write set size for fixed N from 1 through 7 and compare intersection with R+W>N. This tests the fixed-universe theorem, not a full leaderless protocol.
- Check vector-order transitivity and joins on all 0..2 vectors for three actors, plus fork/observation/resolution examples.
- Check counter and observed-remove state merge idempotence, commutativity and associativity across bounded state families. Check independent updates, duplicate state delivery, concurrent add/remove and stale-state replay.
- Exercise acknowledgement stages, stale candidate selection, fencing assumptions, row/statement replay, session anomalies, sloppy holder substitution, partial writes and evidence-based repair.

The PN-counter uses stable actor-owned monotone components and small exact integers. The set uses unique addition tags and permanent removal metadata; it is not an optimized ORSWOT or operation-delivery implementation. Actor allocation, durable metadata, safe reclamation, arbitrary numeric range, concurrent admission constraints and eventual network delivery remain assumptions.

The quorum trace fixes one key and ordered values v0/v1. It injects the exact responders; it does not emulate Cassandra, Dynamo, modern DynamoDB, membership changes or concurrent-version resolution. Read repair can only use evidence from contacted nodes. The vector comparison and CRDT join share componentwise-max arithmetic for different purposes; joining context alone does not resolve business values.
