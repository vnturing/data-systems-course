# Storage-engine experiments behind Module 3

Every number the lessons call "measured" comes from here. For Lessons 18–22, the environment is **MySQL 8.0.46** (Ubuntu 24.04 package, InnoDB defaults except the
buffer pool sizes noted) and **RocksDB through the `rocksdict` 0.3.29 Python binding**, in a small sandbox. Absolute numbers will differ on your
hardware and versions; the shapes should not. Use a scratch server, never production.

`measurements.json` is the single source of truth (with observed ranges across repeated runs) that the model tests and the lessons use.
`results/` holds the raw logs. Reproduce with:

| Script | Measures | Lessons |
|---|---|---|
| `innodb_btree.sh` | B-tree height, leaf count, leaf fill, pages touched per warm point lookup, by table size (reads InnoDB page headers from the `.ibd` file via `parse_ibd.py`) | 21 |
| `innodb_write_cost.sh sequential\|random <pool MB>...` | pages written, doublewrite pages, redo bytes for 200,000 inserts at several buffer pool sizes | 21, 22 |
| `rocks_experiments.py E1b ... E7` | RocksDB write, space and read amplification, leveled vs universal, with and without bloom filters | 19, 20, 22 |

Setup notes
- Database `m3` with a numbers table `nums(n)` of at least 1,000,000 rows (see `../mysql/planner_setup.sql` for a way to build one).
- To resize the InnoDB buffer pool online down to a few MB, start the server with `innodb_buffer_pool_chunk_size=1048576` and `innodb_buffer_pool_instances=1`.
- `FLUSH TABLES t FOR EXPORT` flushes dirty pages so the `.ibd` can be read while the client session holds the lock.

Things that went wrong, and are kept here on purpose
1. **A "random" key that was not random.** The first InnoDB random-insert runs used `n * 2654435761 mod 2^32`. That is a low-discrepancy sequence: leaves fill and split in lockstep and the cache is swept cyclically. It gave 76% leaf fill and 223x write cost at an 8 MB pool. Genuinely random keys (`CONV(LEFT(MD5(n),12),16,10)`) give 66% and 141x. Never use a multiplicative scramble as a random key source.
2. **RocksDB is not deterministic.** Background compaction timing changes results by several percent with fixed seeds, and the number of sorted runs left at the end (4 vs 5) changed leveled absent-key read cost from 1.3 to 2.1. Ranges, not single values, are recorded.
3. **Absent-key probes must fall inside the key range.** Keys outside every file's range are skipped without any read, which made filters look useless in a first attempt.
4. **Compression off.** Highly compressible values made physical writes look smaller than logical ones in a first probe; the experiments use incompressible values with compression disabled.

## Lessons 23–27: indexes, recovery and analytics

Added 2026-11-22. Real implementations: MySQL **8.4.13** (official `mysql:8.4` image), Redis **7.4.12** (`redis:7.4`), DuckDB **1.4.2**, PyArrow **22.0.0**, Python 3.14. Docker ran Linux/arm64 through Colima on macOS. These are separate from the earlier InnoDB/RocksDB measurements. Image tags move; version output is preserved in the results.

| Reproduction | Recorded result | What it establishes |
|---|---|---|
| `indexes.sql` | `results/indexes-mysql84.txt` | Forced-path actual access rows and identical results; not a latency benchmark |
| `redis_persistence.py` | `results/redis-persistence.json` | SIGKILL process recovery with OS cache alive; not host/power-loss durability |
| `analytics.py OUTPUT_DIR` | `results/analytics.json` | Real compressed chunk sizes, min/max eligibility, equivalent DuckDB query results and grouping results; not physical read counters |
| MySQL grouping SQL below | `results/rollup-mysql84.txt` | MySQL roll-up syntax, totals and GROUPING metadata |

The new model test (`tools/test-storage-extra.js`) pins its index result to the raw MySQL plans, checks invariant outcomes, and checks the independent Redis/Parquet fixtures. The analytics fixtures are the source of measured byte counts; the browser uses explicitly labeled teaching formulas instead of pretending to implement a real column engine.

### Isolated MySQL and Redis

Use disposable containers with no published ports. The SQL owns only `m3_indexes` inside the scratch MySQL. Use unique container names if these already exist; the Redis script accepts names starting with `dsc-course-m3-`.

```sh
docker run --name dsc-course-m3-mysql -e MYSQL_ALLOW_EMPTY_PASSWORD=yes -d mysql:8.4
# Wait for this scratch server to be ready; repeat the ping if needed.
docker exec dsc-course-m3-mysql mysqladmin -uroot ping
docker exec -i dsc-course-m3-mysql mysql -uroot --table < experiments/storage/indexes.sql

docker run --name dsc-course-m3-redis -d redis:7.4 redis-server --save '' --appendonly yes --appendfsync everysec
docker run --name dsc-course-m3-rdb -d redis:7.4 redis-server --save '' --appendonly no
python3 experiments/storage/redis_persistence.py dsc-course-m3-redis dsc-course-m3-rdb

# Remove only the scratch containers you created; -v removes their anonymous data volumes.
docker rm -fv dsc-course-m3-mysql dsc-course-m3-redis dsc-course-m3-rdb
```

For Lesson 27's MySQL example, before removing the scratch MySQL, execute:

```sql
USE m3_indexes;
CREATE TABLE facts(day INT NOT NULL, region VARCHAR(2) NOT NULL, amount INT NOT NULL);
INSERT INTO facts VALUES(1,'EU',100),(1,'EU',300),(2,'US',900);
SELECT day,region,SUM(amount),COUNT(*) FROM facts GROUP BY day,region WITH ROLLUP;
SELECT day,region,GROUPING(day),GROUPING(region),SUM(amount)
FROM facts GROUP BY day,region WITH ROLLUP;
```

The index experiment disables ICP to expose residual filtering, then enables it to show the difference. The date-first index scanned **92**, not the naive prediction of 100: MySQL includes status in the lower range boundary, excluding eight open entries at date 90. This does not remove the unwanted interior entries on later dates. The model implements that observed boundary for this fixed dataset; it does not predict all MySQL range construction, skip scans, optimizer choices, MVCC visibility or disk reads.

The first Redis trial incorrectly changed AOF at runtime while keeping `--appendonly yes` in the startup command. Restart re-enabled AOF and loaded its old history. The corrected script uses two containers with separate startup modes and asserts their effective configuration. AOF/everysec survived a process crash; RDB recovered its saved value and lost a later acknowledged SET. Do not infer a host-failure loss bound from those observations.

### Parquet and DuckDB

```sh
python3.14 -m venv /tmp/dsc-storage-venv
/tmp/dsc-storage-venv/bin/python -m pip install duckdb==1.4.2 pyarrow==22.0.0
/tmp/dsc-storage-venv/bin/python experiments/storage/analytics.py /tmp/dsc-analytics-output
```

The script writes about 120 MB of files under the supplied output directory, not into the repository. Repeated seeds and versions reproduce data and chunk-size counts; no timing assertions are made. Sorted and shuffled files have the same rows, but sorting changes both group eligibility and compression. The separate four-value encoding experiment holds the distribution fixed and varies order/dictionary/codec. Metadata sums omit file metadata and do **not** measure actual file-system or storage reads. Zstandard makes the tiny 104-byte sorted dictionary chunk larger (122 bytes), an observed reminder that compression is not free.

### What the browser does not establish

- Persistence: idealized instant snapshots/fsync at whole seconds; no scheduling, fork pauses, device failures, real write latency or replication.
- Workload contention: one finite deterministic FIFO trace, not a database scheduler or a production p99 prediction.
- Columns: fixed-width byte arithmetic and an intentionally simple dictionary/RLE model, not Parquet's actual hybrid encoder; batch-call counts are not CPU speedups.
- Views: ordered before/after events, exact integer amounts and one injected marker crash; no joins, concurrency, out-of-order delivery or distinct aggregation protocol.
