#!/usr/bin/env python3
"""Three isolated MySQL servers. No published ports or connections to host databases.
python3 experiments/replication/mysql_replication.py OUTPUT_DIRECTORY
Requires Docker and mysql:8.4. Creates and removes only its own labeled resources.
"""
import json
from pathlib import Path
import subprocess
import sys
import time

out = Path(sys.argv[1])
out.mkdir(parents=True, exist_ok=True)
network = 'dsc-course-m5-net'
nodes = {x: 'dsc-course-m5-' + x for x in ['source', 'b', 'c']}
created = []
net_created = False

def docker(*args, input=None, check=True):
    r = subprocess.run(['docker', *args], input=input, capture_output=True, text=True, timeout=180)
    if check and r.returncode:
        raise RuntimeError('Docker operation failed: ' + r.stderr[-1000:] + r.stdout[-1000:])
    return r.stdout.strip()

def sql(node, text):
    return docker('exec', '-i', nodes[node], 'mysql', '--protocol=TCP', '-h127.0.0.1', '-uroot', '--batch', '--raw', '--skip-column-names', input=text)

def until(fn, desc, seconds=45):
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        try:
            if fn():
                return
        except RuntimeError:
            pass
        time.sleep(.2)
    raise RuntimeError('Timed out: ' + desc)

def wait_gtid(node, token):
    value = sql(node, "SELECT WAIT_FOR_EXECUTED_GTID_SET('" + token + "', 15)")
    assert value == '0', (node, value)

try:
    docker('network', 'create', '--internal', '--label', 'dsc-course-experiment=m5', network)
    net_created = True
    for ident, (key, name) in enumerate(nodes.items(), 1):
        args = ['run', '-d', '--name', name, '--network', network, '--label', 'dsc-course-experiment=m5',
                '-e', 'MYSQL_ALLOW_EMPTY_PASSWORD=yes', 'mysql:8.4', '--server-id=' + str(ident),
                '--log-bin=binlog', '--relay-log=relay', '--gtid-mode=ON', '--enforce-gtid-consistency=ON',
                '--binlog-format=ROW', '--sync-binlog=1', '--innodb-flush-log-at-trx-commit=1',
                '--innodb-buffer-pool-size=67108864']
        if key != 'source':
            args += ['--read-only=ON', '--log-replica-updates=ON']
        docker(*args)
        created.append(name)
    for key in nodes:
        until(lambda key=key: sql(key, 'SELECT 1') == '1', key + ' startup', 90)
    version = sql('source', 'SELECT VERSION()')
    sql('source', "CREATE USER 'repl'@'%' IDENTIFIED BY 'course-repl-only'; GRANT REPLICATION SLAVE ON *.* TO 'repl'@'%'; CREATE DATABASE m5; CREATE TABLE m5.items(id INT PRIMARY KEY, value VARCHAR(40)); INSERT INTO m5.items VALUES(1,'initial');")
    for key in ['b', 'c']:
        sql(key, "CHANGE REPLICATION SOURCE TO SOURCE_HOST='" + nodes['source'] + "', SOURCE_USER='repl', SOURCE_PASSWORD='course-repl-only', SOURCE_AUTO_POSITION=1, GET_SOURCE_PUBLIC_KEY=1; START REPLICA;")
    token = sql('source', 'SELECT @@GLOBAL.gtid_executed')
    for key in ['b', 'c']:
        wait_gtid(key, token)
    sql('source', 'FLUSH BINARY LOGS')
    print('Three GTID replicas initialized', flush=True)
    # Receipt and execution are distinct. Leave the receiver running, stop only B's applier.
    sql('b', 'STOP REPLICA SQL_THREAD')
    sql('source', "INSERT INTO m5.items VALUES(2,'acknowledged-async')")
    token = sql('source', 'SELECT @@GLOBAL.gtid_executed')
    until(lambda: sql('b', "SELECT GTID_SUBSET('" + token + "', (SELECT RECEIVED_TRANSACTION_SET FROM performance_schema.replication_connection_status LIMIT 1))") == '1', 'B receipt')
    received = sql('b', 'SELECT RECEIVED_TRANSACTION_SET FROM performance_schema.replication_connection_status LIMIT 1')
    assert received
    stale = sql('b', 'SELECT COUNT(*) FROM m5.items WHERE id=2')
    wait_result = sql('b', "SELECT WAIT_FOR_EXECUTED_GTID_SET('" + token + "', 0.05)")
    assert stale == '0' and wait_result == '1', (stale, wait_result)
    sql('b', 'START REPLICA SQL_THREAD')
    wait_gtid('b', token)
    fresh = sql('b', 'SELECT COUNT(*) FROM m5.items WHERE id=2')
    assert fresh == '1'
    wait_gtid('c', token)
    lag = {'before_apply_count': int(stale), 'wait_while_stopped': int(wait_result),
           'after_apply_count': int(fresh), 'wait_after_apply': 0,
           'received_gtids': received, 'source_gtids': token}
    print('Received/applied distinction and GTID wait verified', flush=True)
    # A real semi-sync acknowledgement does not wait for SQL apply.
    sql('source', "INSTALL PLUGIN rpl_semi_sync_source SONAME 'semisync_source.so'; SET GLOBAL rpl_semi_sync_source_enabled=ON; SET GLOBAL rpl_semi_sync_source_timeout=1000;")
    sql('b', "INSTALL PLUGIN rpl_semi_sync_replica SONAME 'semisync_replica.so'; SET GLOBAL rpl_semi_sync_replica_enabled=ON; STOP REPLICA IO_THREAD; START REPLICA IO_THREAD;")
    until(lambda: sql('source', "SHOW GLOBAL STATUS LIKE 'Rpl_semi_sync_source_clients'").split('\t')[-1] == '1', 'semi-sync client')
    sql('b', 'STOP REPLICA SQL_THREAD')
    before_yes = int(sql('source', "SHOW GLOBAL STATUS LIKE 'Rpl_semi_sync_source_yes_tx'").split('\t')[-1])
    sql('source', "INSERT INTO m5.items VALUES(3,'acknowledged-semisync')")
    after_yes = int(sql('source', "SHOW GLOBAL STATUS LIKE 'Rpl_semi_sync_source_yes_tx'").split('\t')[-1])
    b_count = int(sql('b', 'SELECT COUNT(*) FROM m5.items WHERE id=3'))
    assert after_yes > before_yes and b_count == 0
    semisync = {'acknowledged_transactions_delta': after_yes-before_yes, 'replica_visible_rows_at_ack': b_count,
                'source_status': sql('source', "SHOW GLOBAL STATUS LIKE 'Rpl_semi_sync_source_status'").split('\t')[-1]}
    sql('b', 'START REPLICA SQL_THREAD')
    token = sql('source', 'SELECT @@GLOBAL.gtid_executed')
    wait_gtid('b', token)
    wait_gtid('c', token)
    print('Semi-sync commit while replica apply is paused verified', flush=True)
    # Freeze C before a later acknowledged write; promote it without reconciling.
    sql('c', 'STOP REPLICA')
    sql('source', 'SET GLOBAL rpl_semi_sync_source_enabled=OFF')
    sql('source', "INSERT INTO m5.items VALUES(4,'missing-on-stale-c')")
    token = sql('source', 'SELECT @@GLOBAL.gtid_executed')
    wait_gtid('b', token)
    sql('c', 'SET GLOBAL read_only=OFF; SET GLOBAL super_read_only=OFF')
    stale_c = int(sql('c', 'SELECT COUNT(*) FROM m5.items WHERE id=4'))
    copy_b = int(sql('b', 'SELECT COUNT(*) FROM m5.items WHERE id=4'))
    assert stale_c == 0 and copy_b == 1
    # Deliberately leave the old source writable: both nodes accept independent writes.
    sql('source', "INSERT INTO m5.items VALUES(5,'old-source-write')")
    sql('c', "INSERT INTO m5.items VALUES(6,'promoted-c-write')")
    split = {'source_rows': sql('source', 'SELECT id FROM m5.items ORDER BY id'),
             'promoted_c_rows': sql('c', 'SELECT id FROM m5.items ORDER BY id'),
             'acknowledged_row_on_promoted_c': stale_c, 'same_row_on_b': copy_b}
    print('Stale promotion and unfenced dual writers verified', flush=True)
    # Inspect the server's actual event inventory; this image omits mysqlbinlog.
    binfile = sql('source', 'SHOW BINARY LOG STATUS').split('\t')[0]
    events = sql('source', "SHOW BINLOG EVENTS IN '" + binfile + "'")
    assert 'Write_rows' in events and 'Table_map' in events
    (out / 'binlog-events.txt').write_text(events + '\n')
    result = {'mysql_version': version, 'topology': 'one source, two replicas; private internal Docker network; no published ports',
              'durability': {'sync_binlog': 1, 'innodb_flush_log_at_trx_commit': 1}, 'lag': lag,
              'semisync': semisync, 'stale_promotion_and_split_brain': split,
              'limits': 'Controlled stop/start and promotion, not real power loss, automated election, fencing, WAN latency or a failover product benchmark'}
    (out / 'mysql-results.json').write_text(json.dumps(result, indent=2) + '\n')
finally:
    for name in reversed(created):
        docker('rm', '-fv', name, check=False)
    if net_created:
        docker('network', 'rm', network, check=False)
