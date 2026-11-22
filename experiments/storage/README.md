# Storage-engine experiments behind Module 3

Every number the lessons call "measured" comes from here. Environment: **MySQL 8.0.46** (Ubuntu 24.04 package, InnoDB defaults except the
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
