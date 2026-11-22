#!/usr/bin/env python3
"""Failure-path checks for experiment ownership, transcript ordering and cleanup.

Uses only the standard library. No Docker process or real server is started.
"""
from contextlib import redirect_stderr
import importlib.util
import io
from pathlib import Path
import queue
import re
import runpy
import subprocess
import sys
import tempfile
import threading
import unittest
from unittest.mock import Mock, patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('isolation', ROOT/'experiments/transactions/isolation.py')
isolation = importlib.util.module_from_spec(spec)
sys.dont_write_bytecode = True
spec.loader.exec_module(isolation)


class HarnessTests(unittest.TestCase):
    def session(self, label, trace):
        session = isolation.Session.__new__(isolation.Session)
        session.engine, session.label, session.transcript = 'mysql', label, trace
        session.command_count = 0
        session.lines = queue.Queue()
        session.p = Mock()
        return session

    def test_submission_precedes_write_and_completion(self):
        trace = []
        a, b = self.session('A',trace), self.session('B',trace)
        def respond(text):
            marker = re.search(r"SELECT '(__dsc_\w+)';",text)[1]
            a.lines.put('2'); a.lines.put(marker)
        def write_a(text):
            self.assertEqual(trace,[{'event':'submit','command_id':'A:1','session':'A','sql':'wait'}])
            b.run('competing request')
            respond(text)
        def write_b(text):
            marker = re.search(r"SELECT '(__dsc_\w+)';",text)[1]
            b.lines.put('1'); b.lines.put(marker)
        a.p.stdin.write.side_effect = write_a
        b.p.stdin.write.side_effect = write_b
        self.assertEqual(a.run('wait'),['2'])
        self.assertEqual([(e['event'],e['command_id']) for e in trace],
                         [('submit','A:1'),('submit','B:1'),('complete','B:1'),('complete','A:1')])

    def test_transport_failure_leaves_a_pending_submission(self):
        trace = []
        a = self.session('A',trace)
        a.p.stdin.flush.side_effect = BrokenPipeError('connection lost')
        with self.assertRaises(BrokenPipeError): a.run('SELECT 1;')
        self.assertEqual([e['event'] for e in trace],['submit'])

    def deadlock(self, first, other):
        started, release = threading.Event(), threading.Event()
        a,b,waiter = Mock(),Mock(),Mock()
        def outcome(result):
            if isinstance(result,BaseException): raise result
            return result
        def run_a(sql):
            if sql=='SELECT CONNECTION_ID();': return ['42']
            started.set()
            if not release.wait(2): raise RuntimeError('test worker did not resume')
            return outcome(first)
        def run_b(sql):
            release.set()
            return outcome(other)
        def observe(sql):
            self.assertTrue(started.wait(2))
            return ['1']
        a.run.side_effect=run_a; b.run.side_effect=run_b; waiter.run.side_effect=observe
        return isolation.deadlock_case(a,b,waiter)

    def test_either_request_may_be_the_deadlock_victim(self):
        error=isolation.QueryError('lock',['ERROR 1213 (40001): deadlock'])
        self.assertEqual(self.deadlock(error,['1']),{'error':1213,'victim':'A'})
        self.assertEqual(self.deadlock(['2'],error),{'error':1213,'victim':'B'})

    def test_worker_transport_failure_is_propagated(self):
        failure=RuntimeError('worker connection failed')
        error=isolation.QueryError('lock',['ERROR 1213 (40001): deadlock'])
        with self.assertRaises(RuntimeError) as caught: self.deadlock(failure,error)
        self.assertIs(caught.exception,failure)

    def test_unexpected_sql_error_is_propagated(self):
        failure=isolation.QueryError('lock',['ERROR 1205 (HY000): timed out'])
        with self.assertRaises(isolation.QueryError) as caught: self.deadlock(failure,['1'])
        self.assertIs(caught.exception,failure)

    def test_both_completed_or_both_deadlocked_are_rejected(self):
        error=isolation.QueryError('lock',['ERROR 1213 (40001): deadlock'])
        for outcomes in [(['2'],['1']),(error,error)]:
            with self.subTest(outcomes=outcomes), self.assertRaises(AssertionError):
                self.deadlock(*outcomes)

    def test_cleanup_continues_after_nonzero_and_timeout(self):
        results=[subprocess.CompletedProcess([],1,'','permission denied'),
                 subprocess.TimeoutExpired('docker rm',60),
                 subprocess.CompletedProcess([],0,'','')]
        errors=io.StringIO()
        with patch.object(isolation.subprocess,'run',side_effect=results) as run, redirect_stderr(errors):
            self.assertEqual(isolation.cleanup_containers(['first','second','third']),['first','second'])
        self.assertEqual([c.args[0][-1] for c in run.call_args_list],['first','second','third'])
        self.assertIn('first: exit 1',errors.getvalue())
        self.assertIn('second: timed out',errors.getvalue())

    def test_cleanup_failure_preserves_original_experiment_error(self):
        failure=RuntimeError('original experiment error')
        with tempfile.TemporaryDirectory() as out, \
             patch.object(sys,'argv',['isolation.py',out]), \
             patch.object(isolation,'docker',return_value='created'), \
             patch.object(isolation,'mysql_cases',side_effect=failure), \
             patch.object(isolation.subprocess,'run',side_effect=subprocess.TimeoutExpired('docker rm',60)), \
             redirect_stderr(io.StringIO()), self.assertRaises(RuntimeError) as caught:
            isolation.main()
        self.assertIs(caught.exception,failure)

    def test_cleanup_failure_fails_an_otherwise_successful_experiment(self):
        with tempfile.TemporaryDirectory() as out, \
             patch.object(sys,'argv',['isolation.py',out]), \
             patch.object(isolation,'docker',return_value='created'), \
             patch.object(isolation,'mysql_cases',return_value=({'cases':{}},[])), \
             patch.object(isolation,'postgres_cases',return_value=({'cases':{}},[])), \
             patch.object(isolation.subprocess,'run',return_value=subprocess.CompletedProcess([],1,'','failure')), \
             patch('builtins.print'), self.assertRaisesRegex(RuntimeError,'Could not remove experiment containers'):
            isolation.main()

    def test_replication_owns_created_ids_before_start_and_never_failed_creates(self):
        script=ROOT/'experiments/replication/mysql_replication.py'
        for stage in ['create','start']:
            for index in range(3):
                calls=[]; created=[]
                def run(cmd,**kwargs):
                    calls.append(cmd)
                    action=cmd[1]
                    if action=='create':
                        if stage=='create' and len(created)==index:
                            return subprocess.CompletedProcess(cmd,1,'','creation failed')
                        identity='id-'+str(len(created));created.append(identity)
                        return subprocess.CompletedProcess(cmd,0,identity+'\n','')
                    if action=='start' and stage=='start' and cmd[2]=='id-'+str(index):
                        return subprocess.CompletedProcess(cmd,1,'','startup failed')
                    return subprocess.CompletedProcess(cmd,0,'ok','')
                with self.subTest(stage=stage,index=index), tempfile.TemporaryDirectory() as out, \
                     patch.object(sys,'argv',[str(script),out]), patch('subprocess.run',side_effect=run), \
                     self.assertRaisesRegex(RuntimeError,'creation failed|startup failed'):
                    runpy.run_path(str(script),run_name='__main__')
                removed=[c[-1] for c in calls if c[1]=='rm']
                self.assertEqual(removed,list(reversed(created)))
                for cmd in calls:
                    if cmd[1]=='start': self.assertIn(cmd[2],created)
                    if cmd[1]=='create':
                        self.assertNotIn('-d',cmd)
                        self.assertIn('--innodb-flush-log-at-trx-commit=1',cmd)


if __name__=='__main__': unittest.main()
