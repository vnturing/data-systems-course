# Partitioning evidence for Module 6

The real experiments exercise MySQL partition pruning and Redis Cluster routing. Browser models separately expose logical placement, work skew, index lag and migration obligations. No production throughput or correctness certification is claimed.

## Reproduce real observations

From the repository root:

```sh
python3 experiments/partitioning/mysql_pruning.py /tmp/dsc-m6-mysql-results
python3 experiments/partitioning/redis_cluster.py /tmp/dsc-m6-redis-results
```

Requires Docker with `mysql:8.4.13` and `redis:7.4.12`, pinned to the tested versions: **MySQL 8.4.13** and **Redis 7.4.12**, Linux/arm64 containers under Colima on macOS. Actual versions are also preserved in the committed fixtures. Scripts do not access host databases or publish ports. Each owns only the resources it successfully creates, labeled `dsc-course-experiment=m6`, and removes them in `finally`, including anonymous data volumes. MySQL has no Docker network; Redis uses a private internal bridge. A name collision fails instead of reusing a server. External termination can bypass `finally`; inspect ownership labels before removing leftovers.

### MySQL: local table partitioning

100,000 rows; four RANGE partitions on integer event_day, at boundaries 25/50/75. The primary key includes event_day. There are separate by_id and by_status indexes. JSON EXPLAIN plans and separately executed matching-row counts are recorded:

| Query | Partitions searched | Matching rows |
|---|---|---|
| day >= 50 AND day < 75 | p2 | 25,000 |
| id = 12345 | p0, p1, p2, p3 | 1 |
| status = paid | p0, p1, p2, p3 | 10,000 |
| paid plus day interval | p2 | 2,500 |

Adding UNIQUE(id) without the partitioning column is rejected with error 1503. Results are in `results/mysql-results.json`; full plans are in `*-plan.json`. These are one-server partition-pruning/access observations, not distributed network fan-out, physical-read counts or sharding throughput.

### Redis: slots and ownership change

Three Redis Cluster masters, no replicas; the script uses CLUSTER SHARDS for ownership introspection. Forty-nine CLUSTER KEYSLOT values cover ordinary keys, shared tags, empty/unclosed braces and non-ASCII text. Results independently check the browser's CRC16-XMODEM and tag selection.

- `customer:42` → 4672.
- `orders:{42}:a` and `orders:{42}:b` → 8000.
- `orders:{99}:a` → 6263.
- A cross-slot MSET is rejected with CROSSSLOT.
- A GET at a non-owner produces MOVED.
- Mark a target IMPORTING and source MIGRATING for one slot; MIGRATE one quiescent key.
- GET at the old owner produces ASK. GET at the importing target without ASKING produces MOVED back to the current owner.
- ASKING then GET on one connection returns the value. The one-time flag must be on the same connection as the redirected request.
- Complete the slot ownership update. The old owner then produces MOVED to the new owner; the value remains `value-before-move`.

`results/redis-results.json` normalizes redirection targets to scratch node labels, omitting changing IPs and node IDs. Slot values and behaviors should reproduce; labels/placement can vary with allocation. Only one quiescent key was moved. This is not a live migration under concurrent writes, an automatic rebalance, a failover or durability test, or a complete client implementation.

## Pure models and checks

`node tools/test-partitioning.js` uses the committed results and pure model; the normal `sh tools/check-all.sh` runs it. Website and CI need neither Docker nor extra packages.

- Range/hash: 10,000 equal-size numeric keys and explicitly weighted request traces. Check coverage, record/work conservation, point and interval routing.
- Hot keys: fixed 4,000 background requests plus 10,000 hot requests. Salting only splits independent append items; read caching reduces declared backend traffic; a serialized conditional update remains indivisible in the model. Physical-node collisions are retained.
- Indexes: four base partitions and a single status-term index partition per term. One base update lets tests distinguish false positives removed by revalidation from a missing posting revalidation cannot discover. Local maintenance is assumed atomic for this example, not every product.
- Rebalancing: 10,000 keys, three owners growing to four. Compare modulo, 256 fixed logical slots and stable ring tokens. Test that the ring and selected slot policy move changed keys only to the new owner; existing token positions do not change. A finite teaching hash is not cryptographic or a vendor hash. Default model counts (7,480 / 2,504 / 2,083) are not measured network movement.
- Cutover: an injected snapshot/update/delete sequence; controls assume complete ordered replay and exclusive authority when selected. They do not implement those protocols. Test stale resurrection and dual-writer outcomes independently.
- Routing: bounded GET traces for stable, importing and post-cutover ownership. CRC16/tag calculation is real-format arithmetic; endpoint discovery, retry budgets, election, stale global scans and uncertain write execution remain outside this toy.

The placement hash is FNV-1a followed by a 32-bit avalanche, for reproducible illustrative placement. It differs from the separately implemented Redis slot hash. Smaller ownership units and virtual nodes can improve flexibility but do not promise uniform traffic or split an indivisible key. Migration costs in bytes, replicas, indexes, catch-up rate, cache warming and tail latency were not measured.
