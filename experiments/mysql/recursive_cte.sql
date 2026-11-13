USE m2;
DROP TABLE IF EXISTS follows;
CREATE TABLE follows (src INT NOT NULL, dst INT NOT NULL, PRIMARY KEY (src,dst), KEY (dst)) ENGINE=InnoDB;
-- a small graph WITH A CYCLE: 1->2->3->1, plus 3->4, 4->5, 2->5
INSERT INTO follows VALUES (1,2),(2,3),(3,1),(3,4),(4,5),(2,5);

-- (a) UNION DISTINCT: terminates on cycles, returns each reachable node once (with the shortest depth found)
WITH RECURSIVE reach(node, depth) AS (
  SELECT 1, 0
  UNION DISTINCT
  SELECT f.dst, r.depth+1 FROM reach r JOIN follows f ON f.src = r.node WHERE r.depth < 10
)
SELECT node, MIN(depth) AS hops FROM reach GROUP BY node ORDER BY node;
-- (b) UNION ALL on the same cyclic graph, capped only by depth: counts WALKS, not nodes
WITH RECURSIVE walks(node, depth) AS (
  SELECT 1, 0
  UNION ALL
  SELECT f.dst, w.depth+1 FROM walks w JOIN follows f ON f.src = w.node WHERE w.depth < 10
)
SELECT COUNT(*) AS rows_produced_by_walk_enumeration, COUNT(DISTINCT node) AS distinct_nodes FROM walks;
-- (c) UNION ALL with no depth cap on a cycle: hits the recursion limit
SET SESSION cte_max_recursion_depth = 50;
WITH RECURSIVE walks(node) AS (
  SELECT 1 UNION ALL SELECT f.dst FROM walks w JOIN follows f ON f.src = w.node
) SELECT COUNT(*) FROM walks;
-- UNION DISTINCT WITHOUT a depth column and WITHOUT any cap, on the cyclic graph: does it terminate?
WITH RECURSIVE reach(node) AS (
  SELECT 1
  UNION DISTINCT
  SELECT f.dst FROM reach r JOIN follows f ON f.src = r.node
)
SELECT node FROM reach ORDER BY node;
-- UNION DISTINCT WITH a depth column and NO cap: rows differ by depth, so dedup cannot stop the cycle
SET SESSION cte_max_recursion_depth = 50;
WITH RECURSIVE reach(node, depth) AS (
  SELECT 1, 0
  UNION DISTINCT
  SELECT f.dst, r.depth+1 FROM reach r JOIN follows f ON f.src = r.node
)
SELECT COUNT(*) FROM reach;
