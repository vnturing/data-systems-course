USE m2;
DROP TABLE IF EXISTS g_edges;
CREATE TABLE g_edges (src INT NOT NULL, dst INT NOT NULL, PRIMARY KEY (src,dst)) ENGINE=InnoDB;
LOAD DATA LOCAL INFILE '/tmp/edges.tsv' INTO TABLE g_edges FIELDS TERMINATED BY '\t' (src,dst);
SELECT COUNT(*) AS edges FROM g_edges;

-- (1) distinct nodes: UNION DISTINCT on (node, depth), capped at 8 hops; first hop at which each node appears
WITH RECURSIVE reach(node, depth) AS (
  SELECT 0, 0
  UNION DISTINCT
  SELECT e.dst, r.depth+1 FROM reach r JOIN g_edges e ON e.src = r.node WHERE r.depth < 8
), first_hop AS (SELECT node, MIN(depth) AS depth FROM reach GROUP BY node)
SELECT depth AS hop, COUNT(*) AS new_nodes FROM first_hop WHERE depth > 0 GROUP BY depth ORDER BY depth;

-- (2) naive walk enumeration: UNION ALL, capped at 8 hops; rows produced at each depth
WITH RECURSIVE walks(node, depth) AS (
  SELECT 0, 0
  UNION ALL
  SELECT e.dst, w.depth+1 FROM walks w JOIN g_edges e ON e.src = w.node WHERE w.depth < 8
)
SELECT depth AS hop, COUNT(*) AS walks FROM walks WHERE depth > 0 GROUP BY depth ORDER BY depth;
