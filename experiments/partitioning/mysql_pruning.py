#!/usr/bin/env python3
"""Local table partition pruning, not distributed sharding. Own disposable container only.
python3 mysql_pruning.py OUTPUT_DIRECTORY
"""
import json
from pathlib import Path
import subprocess
import sys
import time

out = Path(sys.argv[1]); out.mkdir(parents=True, exist_ok=True)
name = 'dsc-course-m6-mysql'
created = False
def docker(*args, input=None):
    p = subprocess.run(['docker', *args], input=input, capture_output=True, text=True, timeout=120)
    if p.returncode: raise RuntimeError(p.stderr[-1000:] + p.stdout[-1000:])
    return p.stdout.strip()
def sql(s):
    return docker('exec', '-i', name, 'mysql', '--protocol=TCP', '-h127.0.0.1', '-uroot', '--batch', '--raw', '--skip-column-names', input=s)
try:
    docker('run','-d','--name',name,'--network','none','--label','dsc-course-experiment=m6','-e','MYSQL_ALLOW_EMPTY_PASSWORD=yes','mysql:8.4','--innodb-buffer-pool-size=67108864')
    created = True
    for _ in range(300):
        try:
            if sql('SELECT 1') == '1': break
        except RuntimeError: pass
        time.sleep(.2)
    else: raise RuntimeError('MySQL startup timed out')
    setup = '''CREATE DATABASE m6;
CREATE TABLE m6.events(id INT NOT NULL,event_day INT NOT NULL,status VARCHAR(4) NOT NULL,
 amount INT NOT NULL,PRIMARY KEY(event_day,id),KEY by_id(id),KEY by_status(status))
PARTITION BY RANGE(event_day)(PARTITION p0 VALUES LESS THAN(25),PARTITION p1 VALUES LESS THAN(50),
 PARTITION p2 VALUES LESS THAN(75),PARTITION p3 VALUES LESS THAN MAXVALUE);
INSERT INTO m6.events
WITH d AS(SELECT 0 n UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4
 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9),
nums AS(SELECT a.n+10*b.n+100*c.n+1000*e.n+10000*f.n n FROM d a,d b,d c,d e,d f)
SELECT n,FLOOR(n/1000),IF(n%10=0,'paid','open'),100+n%997 FROM nums;
ANALYZE TABLE m6.events;'''
    sql(setup)
    queries = {'day_range': 'SELECT COUNT(*) FROM m6.events WHERE event_day>=50 AND event_day<75',
               'id_lookup': 'SELECT COUNT(*) FROM m6.events WHERE id=12345',
               'status_only': "SELECT COUNT(*) FROM m6.events WHERE status='paid'",
               'status_and_day': "SELECT COUNT(*) FROM m6.events WHERE status='paid' AND event_day>=50 AND event_day<75"}
    result = {'mysql_version':sql('SELECT VERSION()'),'rows':100000,'partitions':4,'queries':{}}
    for key, query in queries.items():
        plan = json.loads(sql('EXPLAIN FORMAT=JSON '+query))
        table = plan['query_block']['table']
        count = int(sql(query))
        result['queries'][key] = {'partitions':table['partitions'],'count':count,'access_type':table['access_type']}
        (out/(key+'-plan.json')).write_text(json.dumps(plan,indent=2)+'\n')
    try:
        sql('ALTER TABLE m6.events ADD UNIQUE KEY unique_id(id)')
        raise AssertionError('Expected unique partition-key constraint')
    except RuntimeError as e:
        assert '1503' in str(e),str(e)
        result['unique_id_without_partition_key_error'] = 1503
    assert result['queries']['day_range']['partitions']==['p2']
    assert len(result['queries']['id_lookup']['partitions'])==4
    assert result['queries']['day_range']['count']==25000
    assert result['queries']['status_and_day']['count']==2500
    (out/'mysql-results.json').write_text(json.dumps(result,indent=2)+'\n')
    print('MySQL pruning, secondary-index fan-out and unique-key constraint verified',flush=True)
finally:
    if created: subprocess.run(['docker','rm','-fv',name],capture_output=True,timeout=60)
