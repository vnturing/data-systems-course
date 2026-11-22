#!/usr/bin/env python3
"""Three Redis Cluster masters, no replicas or published ports. Quiescent key migration.
python3 redis_cluster.py OUTPUT_DIRECTORY
"""
import json
from pathlib import Path
import subprocess
import sys
import time

out=Path(sys.argv[1]);out.mkdir(parents=True,exist_ok=True)
network='dsc-course-m6-net'; names=['dsc-course-m6-redis-'+x for x in 'abc']
created=[];net_created=False
def docker(*args,input=None):
    p=subprocess.run(['docker',*args],input=input,capture_output=True,text=True,timeout=120)
    if p.returncode:raise RuntimeError(p.stderr[-1500:]+p.stdout[-1500:])
    return p.stdout.strip()
def cli(name,*args,host=None,as_json=False,input=None):
    return docker('exec','-i',name,'redis-cli','-h',host or '127.0.0.1','--json' if as_json else '--raw',*map(str,args),input=input)
def until(fn,description,seconds=45):
    deadline=time.monotonic()+seconds
    while time.monotonic()<deadline:
        try:
            if fn():return
        except RuntimeError:pass
        time.sleep(.2)
    raise RuntimeError(description+' timed out')
def obj(x):return x if isinstance(x,dict) else dict(zip(x[::2],x[1::2]))
try:
    docker('network','create','--internal','--label','dsc-course-experiment=m6',network);net_created=True
    for name in names:
        docker('run','-d','--name',name,'--network',network,'--label','dsc-course-experiment=m6','redis:7.4.12',
               'redis-server','--cluster-enabled','yes','--cluster-config-file','nodes.conf',
               '--cluster-node-timeout','5000','--appendonly','no','--save','')
        created.append(name)
    for name in names:until(lambda name=name:cli(name,'PING')=='PONG',name+' startup')
    ips={name:docker('inspect','--format','{{(index .NetworkSettings.Networks "'+network+'").IPAddress}}',name) for name in names}
    docker('exec',names[0],'redis-cli','--cluster','create',*[ip+':6379' for ip in ips.values()],'--cluster-replicas','0','--cluster-yes')
    until(lambda:all('cluster_state:ok' in cli(name,'CLUSTER','INFO') for name in names),'cluster healthy')
    raw=json.loads(cli(names[0],'CLUSTER','SHARDS',as_json=True));ranges=[]
    for item in raw:
        shard=obj(item);master=next(obj(n) for n in shard['nodes'] if obj(n)['role']=='master')
        ip=master.get('ip') or master['endpoint'];name=next(n for n in names if ips[n]==ip)
        for i in range(0,len(shard['slots']),2):ranges.append((shard['slots'][i],shard['slots'][i+1],name))
    def owner(slot):return next(n for lo,hi,n in ranges if lo<=slot<=hi)
    keys=['customer:42','orders:{42}:a','orders:{42}:b','orders:{99}:a','{}:tail','a{}{later}','{open','東京','🙂']+[f'key:{i}' for i in range(40)]
    slots={k:int(cli(names[0],'CLUSTER','KEYSLOT',k)) for k in keys}
    assert slots['orders:{42}:a']==slots['orders:{42}:b']
    key='customer:42';slot=slots[key];source=owner(slot);target=next(n for n in names if n!=source)
    assert cli(source,'SET',key,'value-before-move')=='OK'
    moved=cli(target,'GET',key)
    assert moved.startswith('MOVED '+str(slot)+' '),moved
    cross=cli(owner(slots['orders:{42}:a']),'MSET','orders:{42}:a','1','orders:{99}:a','2')
    assert cross.startswith('CROSSSLOT'),cross
    source_id=cli(source,'CLUSTER','MYID');target_id=cli(target,'CLUSTER','MYID')
    cli(target,'CLUSTER','SETSLOT',slot,'IMPORTING',source_id)
    cli(source,'CLUSTER','SETSLOT',slot,'MIGRATING',target_id)
    assert cli(source,'MIGRATE',ips[target],6379,key,0,5000)=='OK'
    ask=cli(source,'GET',key);assert ask.startswith('ASK '+str(slot)+' '),ask
    without=cli(target,'GET',key);assert without.startswith('MOVED '+str(slot)+' '),without
    with_asking=cli(target,input='ASKING\nGET '+key+'\n')
    assert with_asking.splitlines()==['OK','value-before-move'],with_asking
    for name in [target]+[n for n in names if n!=target]:cli(name,'CLUSTER','SETSLOT',slot,'NODE',target_id)
    after=cli(source,'GET',key);assert after.startswith('MOVED '+str(slot)+' '),after
    value=cli(target,'GET',key);assert value=='value-before-move'
    version=next(x.split(':',1)[1] for x in cli(names[0],'INFO','server').splitlines() if x.startswith('redis_version:'))
    def redirection(text):
        parts=text.split();return {'kind':parts[0],'slot':int(parts[1]),'target':next(n.rsplit('-',1)[1].upper() for n,ip in ips.items() if parts[2]==ip+':6379')}
    result={'redis_version':version,'topology':'three masters; internal network; no replicas or published ports',
            'key_slots':slots,'moved_wrong_node':redirection(moved),'ask_during_move':redirection(ask),
            'target_without_asking':redirection(without),'asking_then_get':with_asking.splitlines(),
            'moved_after_cutover':redirection(after),'value_after_cutover':value,'crossslot_error':cross,
            'limits':'One quiescent key/slot move. No failover, concurrent migration writes, durability, WAN latency or full client implementation tested.'}
    (out/'redis-results.json').write_text(json.dumps(result,indent=2,ensure_ascii=False)+'\n')
    print('Redis slots, hash tags, CROSSSLOT, MOVED and ASK/ASKING migration verified',flush=True)
finally:
    for name in reversed(created):subprocess.run(['docker','rm','-fv',name],capture_output=True,timeout=60)
    if net_created:subprocess.run(['docker','network','rm',network],capture_output=True,timeout=60)
