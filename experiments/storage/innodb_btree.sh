#!/bin/bash
# B-tree height, leaf count, leaf fill and buffer-pool page requests per point lookup, for tables loaded in key order.
# Needs a local MySQL 8 (root, no password), database m3 with a numbers table `nums(n)` of at least 1,000,000 rows, and read access to the data directory.
M="mysql -uroot m3 -N -B"; DATADIR=${DATADIR:-/var/lib/mysql/m3}
for n in 1000 10000 100000 1000000; do
  $M -e "DROP TABLE IF EXISTS t$n; CREATE TABLE t$n (id INT PRIMARY KEY, pad CHAR(100) NOT NULL) ENGINE=InnoDB; INSERT INTO t$n SELECT n,'x' FROM nums WHERE n<=$n;"
  out=$(mysql -uroot m3 -e "FLUSH TABLES t$n FOR EXPORT; \! python3 $(dirname "$0")/parse_ibd.py $DATADIR/t$n.ibd" 2>/dev/null | tail -1)
  req=""
  for k in 7 123 999 4567 8888 15000 25000 33333 40000 51234; do key=$(( k % n + 1 ))
    $M -e "SELECT pad FROM t$n WHERE id=$key" >/dev/null
    b=$($M -e "SHOW GLOBAL STATUS LIKE 'Innodb_buffer_pool_read_requests'" | awk '{print $2}'); $M -e "SELECT pad FROM t$n WHERE id=$key" >/dev/null
    a=$($M -e "SHOW GLOBAL STATUS LIKE 'Innodb_buffer_pool_read_requests'" | awk '{print $2}'); req="$req $((a-b))"; done
  echo "N=$n | $out | page requests per warm point lookup (10 keys):$req"
done
