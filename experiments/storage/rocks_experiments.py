"""Real-RocksDB experiments for Module 3 (via the rocksdict Python binding: pip install rocksdict).
usage: python3 rocks_experiments.py E1b|E2b|E3|E4b|E5|E6b|E7   (see README.md; each run takes seconds to about a minute)
E1b write amp vs data size; E2b size ratio; E3 sequential keys; E4b universal; E5 space amp after overwrites; E6b read cost; E7 three-seed repeats.
Scratch databases are written under /tmp/rocks/. Results vary a few percent run to run because background compaction timing is not deterministic."""
import os, re, sys, time, json, shutil, struct, random
from rocksdict import Rdict, Options, DBCompactionStyle, BlockBasedOptions, WriteBatch, DBCompressionType, UniversalCompactOptions
KEY=8; VAL=100; REC=KEY+VAL
POOL=[os.urandom(VAL) for _ in range(1024)]            # incompressible values (compression is off anyway)
def opts(style='level', mult=10, base_mb=32, buf_mb=4, bloom=False, cache_mb=8, dyn=False):
    o=Options(); o.create_if_missing(True); o.enable_statistics(); o.set_compression_type(DBCompressionType.none())
    o.set_write_buffer_size(buf_mb<<20); o.set_max_write_buffer_number(2); o.set_target_file_size_base(4<<20)
    o.set_level_zero_file_num_compaction_trigger(4)
    o.set_max_background_jobs(4)
    bb=BlockBasedOptions(); bb.set_block_size(4096)
    from rocksdict import Cache
    bb.set_block_cache(Cache(cache_mb<<20))
    if bloom: bb.set_bloom_filter(10, False)
    o.set_block_based_table_factory(bb)
    if style=='level':
        o.set_compaction_style(DBCompactionStyle.level()); o.set_max_bytes_for_level_base(base_mb<<20)
        o.set_max_bytes_for_level_multiplier(mult); o.set_level_compaction_dynamic_level_bytes(dyn)
    else:
        o.set_compaction_style(DBCompactionStyle.universal()); u=UniversalCompactOptions(); o.set_universal_compaction_options(u)
    return o
def ticker(stats,name):
    m=re.search(re.escape(name)+r' COUNT : (\d+)',stats); return int(m.group(1)) if m else 0
def settle(db,o,quiet=3,timeout=600):
    t0=time.time(); ok=0
    while time.time()-t0<timeout:
        p=db.property_int_value("rocksdb.estimate-pending-compaction-bytes") or 0
        r=db.property_int_value("rocksdb.num-running-compactions") or 0
        f=db.property_int_value("rocksdb.num-running-flushes") or 0
        ok = ok+1 if (p==0 and r==0 and f==0) else 0
        if ok>=quiet: return
        time.sleep(1)
def layout(db):
    lv={}
    for f in db.live_files():
        lv.setdefault(f['level'],[0,0]); lv[f['level']][0]+=1; lv[f['level']][1]+=f['size']
    return {l:(c,round(s/1048576,1)) for l,(c,s) in sorted(lv.items())}
def disk_bytes(db): return sum(f['size'] for f in db.live_files())
def fill(db,keys_iter,n):
    b=WriteBatch(); i=0
    for k in keys_iter:
        b.put(k,POOL[i&1023]); i+=1
        if i%2000==0: db.write(b); b=WriteBatch()
    if len(b)>0: db.write(b)
def rand_keys(n,seed): r=random.Random(seed); return (struct.pack('>Q',r.getrandbits(62)) for _ in range(n))
def seq_keys(n): return (struct.pack('>Q',i) for i in range(n))
def run(label,o,gen,n,path):
    shutil.rmtree(path,ignore_errors=True); db=Rdict(path,o); t=time.time()
    fill(db,gen,n); db.flush(); settle(db,o)
    st=o.get_statistics(); user=n*REC
    fl=ticker(st,'rocksdb.flush.write.bytes'); cw=ticker(st,'rocksdb.compact.write.bytes'); cr=ticker(st,'rocksdb.compact.read.bytes'); wal=ticker(st,'rocksdb.wal.bytes')
    res=dict(label=label,n=n,user_mb=round(user/1048576,1),sst_wa=round((fl+cw)/user,2),total_wa=round((fl+cw+wal)/user,2),
             compact_read_mb=round(cr/1048576,1),levels=layout(db),disk_mb=round(disk_bytes(db)/1048576,1),secs=round(time.time()-t,1))
    print(json.dumps(res),flush=True); return db,o,res
if __name__=='__main__':
    exp=sys.argv[1]
    if exp=='E1':      # leveled WA vs data size (random keys)
        for n in (250000,500000,1000000,2000000):
            db,o,_=run(f'leveled T=10 random n={n}',opts(),rand_keys(n,1),n,'/tmp/rocks/e1'); db.close()
    if exp=='E2':      # size ratio
        for T in (4,10,20):
            db,o,_=run(f'leveled T={T} random n=1M',opts(mult=T),rand_keys(1000000,2),1000000,'/tmp/rocks/e2'); db.close()
    if exp=='E3':      # sequential keys
        db,o,_=run('leveled T=10 SEQUENTIAL n=1M',opts(),seq_keys(1000000),1000000,'/tmp/rocks/e3'); db.close()
    if exp=='E4':      # universal
        db,o,_=run('universal random n=1M',opts(style='universal'),rand_keys(1000000,3),1000000,'/tmp/rocks/e4'); db.close()
    if exp=='E1b':     # leveled WA vs data size with a small base so several levels exist
        for n in (250000,1000000,4000000):
            db,o,_=run(f'leveled T=10 base=8MB random n={n}',opts(base_mb=8),rand_keys(n,11),n,'/tmp/rocks/e1b'); db.close()
    if exp=='E2b':     # size ratio with a small base so the ratio actually matters
        for T in (4,6,10,16):
            db,o,_=run(f'leveled T={T} base=8MB random n=2M',opts(mult=T,base_mb=8),rand_keys(2000000,12),2000000,'/tmp/rocks/e2b'); db.close()
    if exp=='E4b':
        db,o,_=run('universal random n=2M',opts(style='universal'),rand_keys(2000000,12),2000000,'/tmp/rocks/e4b'); db.close()
    if exp=='E5':      # space amplification after repeated overwrites of the same 500k keys
        n=500000
        for label,o in (('leveled T=10 base=8MB',opts(base_mb=8)),('leveled dynamic_level_bytes',opts(base_mb=8,dyn=True)),('universal',opts(style='universal'))):
            shutil.rmtree('/tmp/rocks/e5',ignore_errors=True); db=Rdict('/tmp/rocks/e5',o)
            for p in range(5):
                keys=[struct.pack('>Q',x) for x in range(n)]; random.Random(100+p).shuffle(keys); fill(db,iter(keys),n)
            db.flush(); settle(db,o); st=o.get_statistics(); live=n*REC; written=5*n*REC
            fl=ticker(st,'rocksdb.flush.write.bytes'); cw=ticker(st,'rocksdb.compact.write.bytes')
            print(json.dumps(dict(label=label,passes=5,live_mb=round(live/1048576,1),disk_mb=round(disk_bytes(db)/1048576,1),space_amp=round(disk_bytes(db)/live,2),
                  sst_wa=round((fl+cw)/written,2),levels=layout(db))),flush=True); db.close()
    if exp=='E6':      # bloom filter effect on point reads of ABSENT keys and PRESENT keys
        n=1000000
        for style,bloom in (('level',False),('level',True),('universal',False),('universal',True)):
            shutil.rmtree('/tmp/rocks/e6',ignore_errors=True); o=opts(style=style,base_mb=8,bloom=bloom,cache_mb=8); db=Rdict('/tmp/rocks/e6',o)
            fill(db,rand_keys(n,21),n); db.flush(); settle(db,o)
            files=len(db.live_files()); lv=layout(db)
            def sst_reads():
                m=re.search(r'rocksdb\.sst\.read\.micros .*? COUNT : (\d+)',o.get_statistics()); return int(m.group(1)) if m else 0
            def tk(name): return ticker(o.get_statistics(),name)
            r=random.Random(77); absent=[struct.pack('>Q',r.getrandbits(62)|(1<<63)) for _ in range(50000)]       # never inserted (top bit set)
            present=list(rand_keys(n,21))[:50000]
            out={'style':style,'bloom':bloom,'sst_files':files,'levels':lv}
            for name,ks in (('absent',absent),('present',present)):
                b0=sst_reads(); u0=tk('rocksdb.bloom.filter.useful'); m0=tk('rocksdb.block.cache.miss')
                for k in ks: db.get(k)
                out[name]=dict(lookups=len(ks),sst_reads_per_lookup=round((sst_reads()-b0)/len(ks),3),bloom_useful_per_lookup=round((tk('rocksdb.bloom.filter.useful')-u0)/len(ks),3),
                               cache_misses_per_lookup=round((tk('rocksdb.block.cache.miss')-m0)/len(ks),3))
            print(json.dumps(out),flush=True); db.close()
    if exp=='E6b':     # reads on the overwrite dataset; stored keys are EVEN numbers, absent probes are ODD numbers inside the same range
        n=500000
        for style,bloom in (('level',False),('level',True),('universal',False),('universal',True)):
            shutil.rmtree('/tmp/rocks/e6b',ignore_errors=True); o=opts(style=style,base_mb=8,bloom=bloom,cache_mb=8); db=Rdict('/tmp/rocks/e6b',o)
            for p in range(5):
                keys=[struct.pack('>Q',2*x) for x in range(n)]; random.Random(300+p).shuffle(keys); fill(db,iter(keys),n)
            db.flush(); settle(db,o)
            lv=layout(db); runs=sum(1 for l,(c,_) in lv.items() if l!=0)+lv.get(0,(0,0))[0]
            def sst_reads():
                m=re.search(r'rocksdb\.sst\.read\.micros .*? COUNT : (\d+)',o.get_statistics()); return int(m.group(1)) if m else 0
            def tk(name): return ticker(o.get_statistics(),name)
            r=random.Random(9); pres=[struct.pack('>Q',2*r.randrange(n)) for _ in range(50000)]; absn=[struct.pack('>Q',2*r.randrange(n)+1) for _ in range(50000)]
            out={'style':style,'bloom':bloom,'sorted_runs':runs,'levels':lv}
            for name,ks in (('absent_in_range',absn),('present',pres)):
                b0=sst_reads(); u0=tk('rocksdb.bloom.filter.useful')
                for k in ks: db.get(k)
                out[name]=dict(sst_reads_per_lookup=round((sst_reads()-b0)/len(ks),3),bloom_skips_per_lookup=round((tk('rocksdb.bloom.filter.useful')-u0)/len(ks),3))
            print(json.dumps(out),flush=True); db.close()
    if exp=='E7':      # repeatability: WA across 3 seeds for the headline configurations (n=2M random keys, base=8MB)
        import statistics as S
        for label,mk in (('leveled T=10',lambda: opts(base_mb=8)),('leveled T=4',lambda: opts(mult=4,base_mb=8)),('universal',lambda: opts(style='universal'))):
            was=[]
            for seed in (31,32,33):
                db,o,res=run(f'{label} seed={seed}',mk(),rand_keys(2000000,seed),2000000,'/tmp/rocks/e7'); db.close(); was.append(res['sst_wa'])
            print('SUMMARY',json.dumps(dict(label=label,sst_wa=was,mean=round(S.mean(was),2),min=min(was),max=max(was))),flush=True)
