#!/usr/bin/env python3
"""Real Parquet sizes/row-group metadata and DuckDB results. No latency benchmark.
Usage: python analytics.py /tmp/dsc-analytics-output > results/analytics.json
Requires duckdb==1.4.2 and pyarrow==22.0.0. Creates files only in OUTPUT_DIR.
"""
import hashlib
import json
from pathlib import Path
import random
import sys

import duckdb
import pyarrow as pa
import pyarrow.parquet as pq

out = Path(sys.argv[1])
out.mkdir(parents=True, exist_ok=True)
n = 200_000
day = [i // 2000 for i in range(n)]
amount = [100 + i % 997 for i in range(n)]
columns = {'id': pa.array(range(n), type=pa.int64()), 'day': pa.array(day, type=pa.int32()),
           'region': pa.array([i % 10 for i in range(n)], type=pa.int32()),
           'amount': pa.array(amount, type=pa.int64())}
for j in range(8):
    columns[f'payload{j}'] = pa.array([hashlib.sha256(f'{i}:{j}'.encode()).hexdigest() for i in range(n)])
table = pa.table(columns)
order = list(range(n))
random.Random(42).shuffle(order)
shuffled = table.take(pa.array(order))
con = duckdb.connect()
con.execute('SET threads=1')
result = {'environment': {'duckdb': duckdb.__version__, 'pyarrow': pa.__version__, 'rows': n,
                          'row_group_size': 10_000, 'seed': 42}, 'layouts': {}, 'encoding': {}}
for label, data in [('sorted', table), ('shuffled', shuffled)]:
    path = out / f'{label}.parquet'
    pq.write_table(data, path, compression='zstd', use_dictionary=True, row_group_size=10_000)
    meta = pq.ParquetFile(path).metadata
    all_bytes = projected = eligible = kept = 0
    for g in range(meta.num_row_groups):
        rg = meta.row_group(g)
        all_bytes += sum(rg.column(c).total_compressed_size for c in range(rg.num_columns))
        needed = rg.column(1).total_compressed_size + rg.column(3).total_compressed_size
        projected += needed
        stats = rg.column(1).statistics
        if stats.max >= 95:
            kept += 1
            eligible += needed
    answer = con.execute('SELECT COUNT(*), SUM(amount) FROM read_parquet(?) WHERE day>=95', [str(path)]).fetchone()
    plan = con.execute('EXPLAIN SELECT SUM(amount) FROM read_parquet(?) WHERE day>=95', [str(path)]).fetchone()[1]
    result['layouts'][label] = {'file_bytes': path.stat().st_size, 'all_column_chunk_bytes': all_bytes,
        'projected_chunk_bytes': projected, 'eligible_projected_chunk_bytes': eligible,
        'row_groups': meta.num_row_groups, 'eligible_row_groups': kept, 'count': answer[0], 'sum': answer[1]}
    (out / f'{label}-plan.txt').write_text(plan + '\n')
for layout, values in [('sorted', [i // 50_000 for i in range(n)]),
                       ('shuffled', [i % 4 for i in order])]:
    t = pa.table({'status': pa.array(values, type=pa.int32())})
    result['encoding'][layout] = {}
    for label, dictionary, compression in [('plain', False, 'NONE'), ('dictionary', True, 'NONE'), ('dictionary_zstd', True, 'zstd')]:
        path = out / f'{layout}-{label}.parquet'
        pq.write_table(t, path, use_dictionary=dictionary, compression=compression, row_group_size=n)
        result['encoding'][layout][label] = pq.ParquetFile(path).metadata.row_group(0).column(0).total_compressed_size
facts = pa.table({'day': [1,1,2], 'region': ['EU','EU','US'], 'amount': [100,300,900]})
con.register('facts', facts)
result['rollup'] = [list(r) for r in con.execute('SELECT day, region, SUM(amount), COUNT(*) FROM facts GROUP BY ROLLUP(day, region) ORDER BY day NULLS LAST, region NULLS LAST').fetchall()]
result['cube_rows'] = con.execute('SELECT COUNT(*) FROM (SELECT day,region,SUM(amount) FROM facts GROUP BY CUBE(day,region))').fetchone()[0]
assert result['layouts']['sorted']['sum'] == result['layouts']['shuffled']['sum']
assert result['layouts']['sorted']['count'] == 10_000
print(json.dumps(result, indent=2))
