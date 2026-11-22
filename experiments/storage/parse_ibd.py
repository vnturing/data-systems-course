#!/usr/bin/env python3
"""Read InnoDB index-page headers from a file-per-table .ibd and summarize each index's B-tree."""
import sys, struct, collections
PAGE=16384
def parse(path):
    d=open(path,'rb').read(); n=len(d)//PAGE; idx=collections.defaultdict(lambda: collections.defaultdict(list))
    for p in range(n):
        pg=d[p*PAGE:(p+1)*PAGE]
        ptype=struct.unpack('>H',pg[24:26])[0]
        if ptype!=17855: continue                      # FIL_PAGE_INDEX
        n_dir,heap_top,n_heap,free,garbage=struct.unpack('>HHHHH',pg[38:48])
        n_recs=struct.unpack('>H',pg[54:56])[0]; level=struct.unpack('>H',pg[64:66])[0]; index_id=struct.unpack('>Q',pg[66:74])[0]
        used=heap_top-120-garbage
        usable=PAGE-120-8-2*n_dir
        idx[index_id][level].append((n_recs,used,usable))
    return n,idx
if __name__=='__main__':
    n,idx=parse(sys.argv[1]); print(f"file pages: {n}")
    for iid,levels in sorted(idx.items(), key=lambda kv:-sum(len(v) for v in kv[1].values())):
        h=max(levels)+1; leaf=levels[0]
        fill=sum(u for _,u,_ in leaf)/sum(c for _,_,c in leaf)
        print(f"index {iid}: height={h} levels={{{', '.join(f'L{l}:{len(v)} pages' for l,v in sorted(levels.items()))}}} leaf_recs_avg={sum(r for r,_,_ in leaf)/len(leaf):.0f} leaf_fill={fill*100:.0f}%")
        break
