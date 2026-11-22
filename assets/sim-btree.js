/* A real page-based B+tree with an LRU buffer pool (Lessons 0021, 0022).
   Records are integer keys; what is measured is page traffic: page requests (every node touched), page reads (buffer-pool misses on
   existing pages) and page writes (dirty pages evicted, plus a final flush). Calibrated against InnoDB 8.0.46 measurements in
   experiments/storage/ (INT primary key + 100-byte rows: ~123 records per leaf when loaded in key order, ~1,016 children per
   internal page, 16 KB pages). A teaching model: no redo log, doublewrite, undo, latching or variable-length records. */
(function(){
  function Pool(cap){this.cap=cap;this.m=new Map();this.reads=0;this.writes=0;this.requests=0;}
  Pool.prototype.access=function(id,dirty,isNew){
    this.requests++;var m=this.m,e=m.get(id);
    if(e!==undefined){m.delete(id);m.set(id,e||dirty);return;}
    if(!isNew)this.reads++;
    m.set(id,!!dirty);
    if(m.size>this.cap){var old=m.keys().next().value,d=m.get(old);m.delete(old);if(d)this.writes++;}
  };
  Pool.prototype.flushAll=function(){var self=this;this.m.forEach(function(d,id){if(d){self.writes++;self.m.set(id,false);}});};
  function Node(id,leaf){this.id=id;this.leaf=leaf;this.keys=[];this.kids=[];}
  function BTree(cfg){
    this.c=Object.assign({Lc:132,Ic:1084,fill:15/16,poolPages:Infinity},cfg||{});
    this.nextId=1;this.pool=new Pool(this.c.poolPages);this.root=this.mk(true);this.pool.access(this.root.id,true,true);
    this.count=0;this.leaves=1;this.internals=0;this.height=1;
  }
  BTree.prototype.mk=function(leaf){return new Node(this.nextId++,leaf);};
  function lowerBound(a,k){var lo=0,hi=a.length;while(lo<hi){var m=(lo+hi)>>1;if(a[m]<k)lo=m+1;else hi=m;}return lo;}
  function childIndex(n,k){var lo=0,hi=n.keys.length;while(lo<hi){var m=(lo+hi)>>1;if(n.keys[m]<=k)lo=m+1;else hi=m;}return lo;}
  BTree.prototype.insert=function(key){
    var path=[],n=this.root;
    while(!n.leaf){this.pool.access(n.id,false,false);var i=childIndex(n,key);path.push([n,i]);n=n.kids[i];}
    this.pool.access(n.id,true,false);                                   /* the leaf is modified, so it is dirty */
    var pos=lowerBound(n.keys,key);if(n.keys[pos]===key)return false;
    var c=this.c,rightmost=path.every(function(p){return p[1]===p[0].kids.length-1;}),appendLimit=Math.floor(c.Lc*c.fill);
    if(rightmost&&pos===n.keys.length&&n.keys.length>=appendLimit){       /* key-order insert: open a fresh page instead of splitting (pages stay ~15/16 full) */
      var nl=this.mk(true);nl.keys.push(key);this.leaves++;this.count++;this.pool.access(nl.id,true,true);this.addChild(path,n,nl,key);return true;
    }
    n.keys.splice(pos,0,key);this.count++;
    if(n.keys.length>c.Lc){
      var mid=n.keys.length>>1,r=this.mk(true);r.keys=n.keys.splice(mid);this.leaves++;this.pool.access(r.id,true,true);this.addChild(path,n,r,r.keys[0]);
    }
    return true;
  };
  BTree.prototype.addChild=function(path,left,right,sep){
    var c=this.c;
    for(;;){
      if(!path.length){var nr=this.mk(false);nr.kids=[left,right];nr.keys=[sep];this.root=nr;this.internals++;this.height++;this.pool.access(nr.id,true,true);return;}
      var pe=path.pop(),parent=pe[0],i=pe[1];this.pool.access(parent.id,true,false);
      parent.kids.splice(i+1,0,right);parent.keys.splice(i,0,sep);
      if(parent.kids.length<=c.Ic)return;
      var appendLimit=Math.floor(c.Ic*c.fill),rightmostEnd=(i+1===parent.kids.length-1)&&path.every(function(p){return p[1]===p[0].kids.length-1;});
      var r2=this.mk(false),up;
      if(rightmostEnd&&parent.kids.length>appendLimit){ /* sequential growth: keep the left internal page full, start a new one with just the last child */
        r2.kids=[parent.kids.pop()];up=parent.keys.pop();
      }else{var mid=parent.kids.length>>1;r2.kids=parent.kids.splice(mid);r2.keys=parent.keys.splice(mid);up=parent.keys.pop();}
      this.internals++;this.pool.access(r2.id,true,true);left=parent;right=r2;sep=up;
    }
  };
  BTree.prototype.lookup=function(key){
    var n=this.root;while(!n.leaf){this.pool.access(n.id,false,false);n=n.kids[childIndex(n,key)];}
    this.pool.access(n.id,false,false);var p=lowerBound(n.keys,key);return n.keys[p]===key;
  };
  BTree.prototype.finish=function(){this.pool.flushAll();};
  BTree.prototype.stats=function(){
    return {height:this.height,leaves:this.leaves,internals:this.internals,records:this.count,fill:this.count/(this.leaves*this.c.Lc),
            recsPerLeaf:this.count/this.leaves,pageReads:this.pool.reads,pageWrites:this.pool.writes,pageRequests:this.pool.requests};
  };
  BTree.prototype.validate=function(){ /* structural check used by tests: sorted, separators correct, all leaves at one depth */
    var depth=-1,ok=true,prev=-Infinity,self=this;
    (function walk(n,d,lo,hi){
      if(n.leaf){if(depth<0)depth=d;else if(depth!==d)ok=false;for(var i=0;i<n.keys.length;i++){if(n.keys[i]<=prev&&prev!==-Infinity)ok=false;if(n.keys[i]<lo||n.keys[i]>=hi)ok=false;prev=n.keys[i];}return;}
      if(n.kids.length!==n.keys.length+1)ok=false;
      for(var j=0;j<n.kids.length;j++)walk(n.kids[j],d+1,j===0?lo:n.keys[j-1],j===n.keys.length?hi:n.keys[j]);
    })(this.root,0,-Infinity,Infinity);
    return ok;
  };
  function lcg(seed){var s=seed>>>0;return function(){s=(Math.imul(s,1664525)+1013904223)>>>0;return s;};}
  /* the same scrambling the InnoDB experiment used: key = (n * 2654435761) mod 2^32, a bijection that visits keys in pseudo-random order */
  function scrambled(n){return Number((BigInt(n)*2654435761n)%4294967296n);}
  function load(cfg,n,mode){
    var t=new BTree(cfg);for(var i=1;i<=n;i++)t.insert(mode==='random'?scrambled(i):i);t.finish();return t;
  }
  window.BTreeSim={BTree:BTree,Pool:Pool,load:load,scrambled:scrambled,lcg:lcg};
})();
