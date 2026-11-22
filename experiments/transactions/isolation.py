#!/usr/bin/env python3
"""Original two-session isolation schedules; Python standard library + Docker only.

Run: python3 experiments/transactions/isolation.py OUTPUT_DIRECTORY
Only uniquely named, private, disposable containers created here are touched.
"""
import json
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import queue
import subprocess
import sys
import threading
import time
import uuid


def docker(*args):
    p = subprocess.run(['docker', *args], capture_output=True, text=True, timeout=120)
    if p.returncode:
        raise RuntimeError(p.stderr[-2000:] + p.stdout[-2000:])
    return p.stdout.strip()


class QueryError(RuntimeError):
    def __init__(self, sql, output):
        super().__init__(sql, output)
        self.output = output


class Session:
    def __init__(self, container, engine, label, transcript):
        self.engine, self.label, self.transcript = engine, label, transcript
        self.command_count = 0
        cli = (['mysql', '--protocol=TCP', '-h127.0.0.1', '-uroot', '-NB',
                '--raw', '--unbuffered', '--force'] if engine == 'mysql' else
               ['psql', '-X', '-qAt', '-U', 'postgres', '-d', 'postgres'])
        # Merge INSIDE the container. Docker's separate stdout/stderr streams can
        # otherwise deliver an error after the stdout response marker.
        self.p = subprocess.Popen(['docker', 'exec', '-i', container,
                                   'sh', '-c', 'exec "$@" 2>&1', 'sh', *cli],
                                  stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                  stderr=subprocess.STDOUT, text=True, bufsize=1)
        self.lines = queue.Queue()
        def read():
            for line in self.p.stdout:
                self.lines.put(line.rstrip('\n'))
            self.lines.put(None)
        threading.Thread(target=read, daemon=True).start()

    def run(self, sql, error=None):
        marker = '__dsc_' + uuid.uuid4().hex
        end = "SELECT '" + marker + "';" if self.engine == 'mysql' else '\\echo ' + marker
        self.command_count += 1
        command_id = self.label + ':' + str(self.command_count)
        self.transcript.append({'event':'submit', 'command_id':command_id,
                                'session':self.label, 'sql':sql})
        self.p.stdin.write(sql + '\n' + end + '\n')
        self.p.stdin.flush()
        rows = []
        deadline = time.monotonic() + 15
        while True:
            try:
                line = self.lines.get(timeout=max(.01, deadline - time.monotonic()))
            except queue.Empty:
                raise RuntimeError(self.label + ': query deadline: ' + sql)
            if line is None:
                raise RuntimeError(self.label + ': session exited: ' + '\n'.join(rows))
            if line == marker:
                break
            rows.append(line)
        self.transcript.append({'event':'complete', 'command_id':command_id,
                                'session':self.label, 'output':rows})
        errors = [r for r in rows if r.startswith('ERROR')]
        if error:
            assert any(error in r for r in errors), (sql, error, rows, self.transcript[-12:])
        elif errors:
            raise QueryError(sql, rows)
        return rows

    def close(self):
        if self.p.poll() is None:
            try:
                self.p.stdin.close()
                self.p.wait(timeout=5)
            except (BrokenPipeError, subprocess.TimeoutExpired):
                self.p.kill()
                self.p.wait(timeout=5)
        self.p.stdout.close()


def deadlock_case(a, b, waiter):
    def request(session, sql):
        try:
            session.run(sql)
        except QueryError as exc:
            errors = [row for row in exc.output if row.startswith('ERROR')]
            if len(errors) != 1 or not errors[0].startswith('ERROR 1213 '):
                raise
            return 'deadlock'
        return 'completed'

    observer_id = a.run('SELECT CONNECTION_ID();')[0]
    with ThreadPoolExecutor(max_workers=1) as worker:
        pending = worker.submit(request, a, 'SELECT id FROM doctors WHERE id=2 FOR UPDATE;')
        try:
            deadline = time.monotonic()+5
            while time.monotonic()<deadline:
                waiting = waiter.run('SELECT COUNT(*) FROM performance_schema.data_lock_waits w JOIN performance_schema.threads t ON w.REQUESTING_THREAD_ID=t.THREAD_ID WHERE t.PROCESSLIST_ID='+observer_id+';')
                if waiting == ['1']: break
            else: raise RuntimeError('Did not observe the first deadlock edge')
            other = request(b, 'SELECT id FROM doctors WHERE id=1 FOR UPDATE;')
        finally:
            # Join and propagate worker failures before either session is reused.
            first = pending.result(timeout=15)
    assert sorted([first,other]) == ['completed','deadlock'], (first,other)
    return {'error':1213, 'victim':'A' if first=='deadlock' else 'B'}


def cleanup_containers(created):
    failed = []
    for name in created:
        try:
            result = subprocess.run(['docker','rm','-fv',name],capture_output=True,text=True,timeout=60)
        except subprocess.TimeoutExpired:
            detail = 'timed out after 60 seconds'
        except OSError as exc:
            detail = str(exc)
        else:
            if result.returncode == 0:
                continue
            detail = 'exit '+str(result.returncode)+': '+(result.stderr+result.stdout)[-1000:].strip()
        failed.append(name)
        print('Container cleanup failed for '+name+': '+detail,file=sys.stderr)
    return failed


def mysql_cases(name):
    trace, sessions = [], []
    def connect(label):
        s = Session(name, 'mysql', label, trace)
        sessions.append(s)
        s.run('USE m7; SET SESSION innodb_lock_wait_timeout=1;')
        return s
    # Bootstrap before USE in the persistent connections.
    docker('exec', name, 'mysql', '--protocol=TCP', '-h127.0.0.1', '-uroot', '-e',
           'CREATE DATABASE m7; CREATE TABLE m7.counter(id INT PRIMARY KEY, v INT, version INT) ENGINE=InnoDB;'
           'INSERT INTO m7.counter VALUES(1,100,1);'
           'CREATE TABLE m7.doctors(id INT PRIMARY KEY, on_call INT) ENGINE=InnoDB;'
           'INSERT INTO m7.doctors VALUES(1,1),(2,1);'
           'CREATE TABLE m7.guard(id INT PRIMARY KEY) ENGINE=InnoDB; INSERT INTO m7.guard VALUES(1);'
           'CREATE TABLE m7.bookings(id INT PRIMARY KEY, room INT, KEY by_room(room)) ENGINE=InnoDB;'
           'INSERT INTO m7.bookings VALUES(1,10),(2,20);')
    try:
        a, b = connect('A'), connect('B')
        result = {'version': a.run('SELECT VERSION();')[0], 'cases': {}}
        cases = result['cases']
        result['settings'] = a.run('SELECT @@transaction_isolation,@@innodb_flush_log_at_trx_commit,@@sync_binlog,@@innodb_rollback_on_timeout;')[0]
        def reset():
            a.run('ROLLBACK;'); b.run('ROLLBACK;')
            a.run('UPDATE counter SET v=100,version=1; UPDATE doctors SET on_call=1; DELETE FROM bookings WHERE id>2;')
        def begin(s, level='REPEATABLE READ'):
            s.run('SET SESSION TRANSACTION ISOLATION LEVEL '+level+'; START TRANSACTION;')
        def value(s):
            return int(s.run('SELECT v FROM counter WHERE id=1;')[0])
        begin(a)
        a.run('UPDATE counter SET v=70; ROLLBACK;')
        cases['rollback'] = {'value': value(b)}
        for level, key, expected in [('READ UNCOMMITTED','dirty_ru',900), ('READ COMMITTED','dirty_rc',100)]:
            reset(); begin(a); begin(b, level)
            a.run('UPDATE counter SET v=900 WHERE id=1;')
            observed = value(b)
            a.run('ROLLBACK;'); b.run('ROLLBACK;')
            cases[key] = {'during_uncommitted': observed, 'after_rollback': value(b)}
            assert observed == expected
        reset(); begin(a); begin(b, 'READ COMMITTED')
        a.run('UPDATE counter SET v=900 WHERE id=1;')
        b.run('UPDATE counter SET v=200 WHERE id=1;', error='1205')
        b.run('ROLLBACK;'); a.run('ROLLBACK;')
        cases['dirty_write'] = {'blocked_update_error':1205, 'value':value(b)}
        for level, key, expected in [('READ COMMITTED','repeat_rc',110), ('REPEATABLE READ','repeat_rr',100)]:
            reset(); begin(a,level)
            first = value(a)
            b.run('UPDATE counter SET v=110 WHERE id=1;')
            second = value(a)
            cases[key] = {'reads':[first,second]}
            assert second == expected
        reset(); begin(a)
        b.run('UPDATE counter SET v=110 WHERE id=1;')
        first = value(a)
        b.run('UPDATE counter SET v=120 WHERE id=1;')
        second = value(a)
        current = int(a.run('SELECT v FROM counter WHERE id=1 FOR UPDATE;')[0])
        cases['snapshot_boundary'] = {'plain_reads':[first,second], 'locking_read':current}
        for mode, key, expected in [('blind','lost_update',110), ('increment','atomic_increment',120), ('cas','compare_and_set',110)]:
            reset(); begin(a); begin(b)
            reads = [value(a),value(b)]
            query = ('UPDATE counter SET v=110 WHERE id=1;' if mode=='blind' else
                     'UPDATE counter SET v=v+10 WHERE id=1;' if mode=='increment' else
                     'UPDATE counter SET v=110,version=version+1 WHERE id=1 AND version=1;')
            ra = a.run(query+' SELECT ROW_COUNT(); COMMIT;')
            rb = b.run(query+' SELECT ROW_COUNT(); COMMIT;')
            final = value(a)
            cases[key] = {'reads':reads,'affected':[int(ra[0]),int(rb[0])],'value':final}
            assert final == expected
        reset(); locked_reads = []
        for s in [a,b]:
            begin(s)
            v = int(s.run('SELECT v FROM counter WHERE id=1 FOR UPDATE;')[0])
            locked_reads.append(v)
            s.run('UPDATE counter SET v='+str(v+10)+' WHERE id=1; COMMIT;')
        cases['locking_increment'] = {'reads':locked_reads,'value':value(a)}
        reset(); begin(a); begin(b)
        ca = int(a.run('SELECT SUM(on_call) FROM doctors;')[0])
        cb = int(b.run('SELECT SUM(on_call) FROM doctors;')[0])
        a.run('UPDATE doctors SET on_call=0 WHERE id=1; COMMIT;')
        b.run('UPDATE doctors SET on_call=0 WHERE id=2; COMMIT;')
        cases['write_skew'] = {'counts':[ca,cb],'remaining':int(a.run('SELECT SUM(on_call) FROM doctors;')[0])}
        reset(); counts = []
        for s, doctor in [(a,1),(b,2)]:
            # RC is deliberate: the count after waiting must see the preceding commit.
            begin(s,'READ COMMITTED')
            s.run('SELECT id FROM guard WHERE id=1 FOR UPDATE;')
            count = int(s.run('SELECT SUM(on_call) FROM doctors;')[0]); counts.append(count)
            if count>1: s.run('UPDATE doctors SET on_call=0 WHERE id='+str(doctor)+';')
            s.run('COMMIT;')
        cases['guard_row'] = {'counts':counts,'remaining':int(a.run('SELECT SUM(on_call) FROM doctors;')[0])}
        for level, key in [('READ COMMITTED','phantom_rc'),('REPEATABLE READ','phantom_rr')]:
            reset(); begin(a,level)
            first = int(a.run('SELECT COUNT(*) FROM bookings WHERE room>=10 AND room<30;')[0])
            b.run('INSERT INTO bookings VALUES(3,15);')
            second = int(a.run('SELECT COUNT(*) FROM bookings WHERE room>=10 AND room<30;')[0])
            cases[key] = {'counts':[first,second]}
        reset(); begin(a)
        a.run('SELECT id FROM bookings FORCE INDEX(by_room) WHERE room>=10 AND room<30 FOR UPDATE;')
        b.run('INSERT INTO bookings VALUES(3,15);', error='1205')
        cases['range_lock'] = {'insert_error':1205}
        reset()
        for s in [a,b]: s.run('SET SESSION innodb_lock_wait_timeout=10;')
        begin(a); begin(b)
        a.run('SELECT id FROM doctors WHERE id=1 FOR UPDATE;')
        b.run('SELECT id FROM doctors WHERE id=2 FOR UPDATE;')
        # Observe a real wait before forming the cycle, not a timing-based guess.
        waiter = Session(name,'mysql','wait-observer',trace); sessions.append(waiter)
        cases['deadlock'] = deadlock_case(a, b, waiter)
        reset()
        assert cases['write_skew']['remaining']==0
        assert cases['guard_row']=={'counts':[2,1],'remaining':1}
        assert cases['snapshot_boundary']=={'plain_reads':[110,110],'locking_read':120}
        assert cases['phantom_rc']['counts']==[2,3]
        assert cases['phantom_rr']['counts']==[2,2]
        assert cases['compare_and_set']['affected']==[1,0]
        return result, trace
    finally:
        for s in sessions: s.close()


def postgres_cases(name):
    trace, sessions = [], []
    try:
        for label in ['A','B']:
            s = Session(name,'postgres',label,trace); sessions.append(s)
            s.run('\\set VERBOSITY verbose\nSET statement_timeout=5000;')
        a,b = sessions
        result = {'version':a.run('SHOW server_version;')[0], 'cases':{}}
        a.run('CREATE TABLE doctors(id INT PRIMARY KEY,on_call INT); INSERT INTO doctors VALUES(1,1),(2,1);')
        a.run('CREATE TABLE counter(id INT PRIMARY KEY,v INT); INSERT INTO counter VALUES(1,100);')
        for s in sessions: s.run('BEGIN ISOLATION LEVEL REPEATABLE READ;')
        reads = [int(s.run('SELECT v FROM counter WHERE id=1;')[0]) for s in sessions]
        a.run('UPDATE counter SET v=110 WHERE id=1; COMMIT;')
        b.run('UPDATE counter SET v=110 WHERE id=1;',error='40001')
        b.run('ROLLBACK;')
        result['cases']['stale_replacement_rr'] = {'reads':reads,'update_error':'40001','value':int(a.run('SELECT v FROM counter WHERE id=1;')[0])}
        for level,key in [('REPEATABLE READ','write_skew_rr'),('SERIALIZABLE','write_skew_ssi')]:
            a.run('UPDATE doctors SET on_call=1;')
            for s in sessions:
                s.run('BEGIN ISOLATION LEVEL '+level+';')
                assert s.run('SHOW transaction_isolation;') == [level.lower()]
            counts = [int(s.run('SELECT SUM(on_call) FROM doctors;')[0]) for s in sessions]
            a.run('UPDATE doctors SET on_call=0 WHERE id=1;')
            b.run('UPDATE doctors SET on_call=0 WHERE id=2;')
            a.run('COMMIT;')
            b.run('COMMIT;',error='40001' if level=='SERIALIZABLE' else None)
            remaining = int(a.run('SELECT SUM(on_call) FROM doctors;')[0])
            result['cases'][key] = {'counts':counts,'remaining':remaining,'commit_error':'40001' if level=='SERIALIZABLE' else None}
            assert remaining == (1 if level=='SERIALIZABLE' else 0)
        return result, trace
    finally:
        for s in sessions: s.close()


def main():
    out = Path(sys.argv[1]); out.mkdir(parents=True,exist_ok=True)
    created = []
    try:
        for engine,image,env,extra,probe,run in [
            ('mysql','mysql:8.4','MYSQL_ALLOW_EMPTY_PASSWORD=yes',['--innodb-buffer-pool-size=67108864'],
             ['mysql','--protocol=TCP','-h127.0.0.1','-uroot','-NBe','SELECT 1'],mysql_cases),
            ('postgres','postgres:18-alpine','POSTGRES_HOST_AUTH_METHOD=trust',[],
             ['pg_isready','-h','127.0.0.1','-U','postgres'],postgres_cases)]:
            name = 'dsc-m7-'+engine+'-'+uuid.uuid4().hex[:10]
            docker('run','-d','--name',name,'--network','none','--label','dsc-course-experiment=m7','-e',env,image,*extra)
            created.append(name)
            for _ in range(300):
                try: docker('exec',name,*probe); break
                except RuntimeError: time.sleep(.2)
            else: raise RuntimeError(engine+' startup deadline')
            result,trace = run(name)
            result['image_id'] = docker('inspect','--format','{{.Image}}',name)
            (out/(engine+'-results.json')).write_text(json.dumps(result,indent=2)+'\n')
            (out/(engine+'-transcript.json')).write_text(json.dumps(trace,indent=2)+'\n')
            print(engine+': '+str(len(result['cases']))+' schedules verified',flush=True)
    finally:
        experiment_failed = sys.exc_info()[0] is not None
        failed = cleanup_containers(created)
        if failed and not experiment_failed:
            raise RuntimeError('Could not remove experiment containers: '+', '.join(failed))


if __name__=='__main__': main()
