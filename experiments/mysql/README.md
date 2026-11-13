# MySQL experiments behind Module 2

Every number the lessons call "measured" comes from these scripts, run on **MySQL 8.0.46** (Ubuntu 24.04 package, InnoDB, default
settings) in a small sandbox. Absolute numbers will differ on your hardware and version; the shapes should not. Check them on a
scratch server, never on production.

Run order (database name `m2`, created by the first script):

1. `json_features.sql` : JSON column, promoted column index, multi-valued index, `CHECK` with `JSON_SCHEMA_VALID` (Lessons 12, 14).
2. `recursive_cte.sql` : `UNION DISTINCT` vs `UNION ALL`, the recursion limit (Lesson 15).
3. `planner_setup.sql` then `planner_run.sh` : the three-table join under five index configurations (Lesson 16). The script reports
   the optimizer's join order and `Handler_read_*` totals over six statistics refreshes, and a forced as-written order.
4. `node graph_edges.js` then `mysql --local-infile=1 ... < graph_crosscheck.sql` : the graph model cross-check (Lesson 15). Needs
   `SET GLOBAL local_infile=1`.
5. `layout_setup.sql` (needs the `nums` table from step 3) then `layout_measure.sh` : relational vs JSON-document layouts (Lessons 12, 13, 17).

Notes
- "Rows read" is the sum of `Handler_read_first/key/next/prev/rnd/rnd_next/last` after `FLUSH STATUS`. It counts storage-engine row
  and index-entry reads, not time.
- `ANALYZE TABLE` re-samples statistics. In configuration A of the planner experiment, two plans have nearly equal estimated cost
  and the optimizer alternated between them across refreshes. That variability is part of the finding.
- The planner dataset accidentally correlates `status` with region (every open order belongs to an EU customer). The optimizer assumes
  independence, so `EXPLAIN ANALYZE` shows estimated rows=3896 against actual rows=20000. Real data is correlated like this all the time.
- `verify_lesson_sql.py` extracts every `data-sql` block from the lessons and runs it against a fresh schema per lesson.
