#!/usr/bin/env python3
"""Demonstrate PROCESS crashes with the host/OS still alive, not power loss.
Uses only the named disposable Docker container; no ports, credentials or host Redis.
Usage: python redis_persistence.py AOF_CONTAINER RDB_CONTAINER > results/redis-persistence.json
"""
import json
import subprocess
import sys
import time

container, rdb_container = sys.argv[1:]
if not all(c.startswith('dsc-course-m3-') for c in [container, rdb_container]):
    raise SystemExit('Use a disposable dsc-course-m3-* container')

def docker(*args):
    return subprocess.check_output(['docker', *args], text=True).strip()

def cli(*args):
    return docker('exec', container, 'redis-cli', '--raw', *args)

def restart():
    docker('kill', '--signal=KILL', container)
    docker('start', container)
    for _ in range(100):
        try:
            if cli('PING') == 'PONG':
                return
        except subprocess.CalledProcessError:
            pass
        time.sleep(.05)
    raise RuntimeError('Redis did not restart')

version = next(line for line in cli('INFO', 'server').splitlines() if line.startswith('redis_version:'))
assert cli('CONFIG', 'GET', 'appendonly').splitlines()[-1] == 'yes'
assert cli('CONFIG', 'GET', 'appendfsync').splitlines()[-1] == 'everysec'
assert cli('SET', 'durability-probe', 'acknowledged') == 'OK'
# Redis writes the AOF before sending the reply; fsync may still be pending.
restart()
aof = cli('GET', 'durability-probe')
assert aof == 'acknowledged'
container = rdb_container
assert cli('CONFIG', 'GET', 'appendonly').splitlines()[-1] == 'no'
cli('SET', 'durability-probe', 'snapshot-value')
assert cli('SAVE') == 'OK'
cli('SET', 'durability-probe', 'newer-acknowledged-value')
restart()
snapshot = cli('GET', 'durability-probe')
assert snapshot == 'snapshot-value'
print(json.dumps({'version': version, 'crash': 'SIGKILL Redis process; host and OS cache alive',
    'aof_everysec_after_restart': aof, 'rdb_after_restart': snapshot,
    'not_tested': 'Power loss, host kernel crash, storage firmware, replication or loss-window upper bounds'}, indent=2))
