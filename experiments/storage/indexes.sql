-- Run only on the disposable container described in README.md. Own schema only.
CREATE DATABASE IF NOT EXISTS m3_indexes;
USE m3_indexes;
DROP TABLE IF EXISTS orders;
CREATE TABLE orders (
 id BIGINT PRIMARY KEY, tenant_id INT NOT NULL, status VARCHAR(8) NOT NULL,
 created_at INT NOT NULL, amount BIGINT NOT NULL, payload VARCHAR(200) NOT NULL,
 KEY tenant_only (tenant_id),
 KEY good_order (tenant_id,status,created_at),
 KEY range_first (tenant_id,created_at,status),
 KEY covering (tenant_id,status,created_at,amount)
) ENGINE=InnoDB;
INSERT INTO orders
WITH digits AS (SELECT 0 n UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4
 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9),
nums AS (SELECT a.n+10*b.n+100*c.n+1000*d.n+10000*e.n n FROM digits a,digits b,digits c,digits d,digits e)
SELECT n+1,FLOOR(n/1000),IF(FLOOR(n/100)%5=0,'paid','open'),n%100,100+n%997,REPEAT('x',200) FROM nums;
ANALYZE TABLE orders;
SELECT VERSION() version,COUNT(*) rows_loaded FROM orders;
SELECT 'tenant 42',COUNT(*) FROM orders WHERE tenant_id=42;
SELECT 'tenant + status',COUNT(*) FROM orders WHERE tenant_id=42 AND status='paid';
SELECT 'tenant + date',COUNT(*) FROM orders WHERE tenant_id=42 AND created_at>=90;
SELECT 'all predicates',COUNT(*),SUM(amount) FROM orders WHERE tenant_id=42 AND status='paid' AND created_at>=90;
-- Disable ICP to make post-range filtering visible as separate plan nodes.
-- The lesson also explains what changes when ICP is enabled.
SET SESSION optimizer_switch='index_condition_pushdown=off';
EXPLAIN ANALYZE SELECT SUM(amount) FROM orders FORCE INDEX(tenant_only)
 WHERE tenant_id=42 AND status='paid' AND created_at>=90;
EXPLAIN ANALYZE SELECT SUM(amount) FROM orders FORCE INDEX(range_first)
 WHERE tenant_id=42 AND status='paid' AND created_at>=90;
EXPLAIN ANALYZE SELECT SUM(amount) FROM orders FORCE INDEX(good_order)
 WHERE tenant_id=42 AND status='paid' AND created_at>=90;
EXPLAIN ANALYZE SELECT SUM(amount) FROM orders FORCE INDEX(covering)
 WHERE tenant_id=42 AND status='paid' AND created_at>=90;
EXPLAIN SELECT SUM(amount) FROM orders FORCE INDEX(covering)
 WHERE tenant_id=42 AND status='paid' AND created_at>=90;
SET SESSION optimizer_switch='index_condition_pushdown=on';
EXPLAIN ANALYZE SELECT SUM(amount) FROM orders FORCE INDEX(range_first)
 WHERE tenant_id=42 AND status='paid' AND created_at>=90;
