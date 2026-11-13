#!/usr/bin/env python3
"""Runs every <code class="sql" data-sql="LNNN"> block in lessons/*.html against a local MySQL (mysql CLI, root, no password by default).
Blocks sharing an id run in document order inside a fresh database. A block with data-expect-error="NNNN" must fail with that error code.
Usage: python3 experiments/mysql/verify_lesson_sql.py [--user root] [--password ...]"""
import re, glob, html, subprocess, sys, argparse
ap=argparse.ArgumentParser(); ap.add_argument('--user',default='root'); ap.add_argument('--password',default=None); a=ap.parse_args()
base=['mysql','-u',a.user]+(['-p'+a.password] if a.password else [])
def run(sql,db=None):
    cmd=base+(['-D',db] if db else [])+['--batch','--skip-column-names']
    return subprocess.run(cmd,input=sql,capture_output=True,text=True)
bad=0; total=0
for f in sorted(glob.glob('lessons/*.html')):
    t=open(f).read(); groups={}
    for m in re.finditer(r'<code class="sql" data-sql="([^"]+)"( data-expect-error="(\d+)")?>(.*?)</code>',t,re.S):
        groups.setdefault(m.group(1),[]).append((m.group(3),html.unescape(re.sub(r'<[^>]+>','',m.group(4)))))
    for gid,blocks in groups.items():
        db='verify_'+gid.lower(); run(f'DROP DATABASE IF EXISTS {db}; CREATE DATABASE {db};')
        for i,(err,sql) in enumerate(blocks,1):
            total+=1; r=run(sql,db)
            if err:
                ok = (f'ERROR {err}' in r.stderr)
                msg=f'expected error {err}'
            else:
                ok = r.returncode==0; msg='ran clean'
            print(('PASS' if ok else 'FAIL'),f'{f} [{gid}] block {i}: {msg}')
            if not ok: bad+=1; print('   ',r.stderr.strip()[:300])
        run(f'DROP DATABASE IF EXISTS {db};')
print(f'{total-bad}/{total} SQL blocks OK'); sys.exit(1 if bad else 0)
