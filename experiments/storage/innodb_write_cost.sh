#!/bin/bash
# usage: innodb_write_cost.sh <sequential|random> <buffer-pool-MB> [<buffer-pool-MB> ...]
# Inserts 200,000 rows (BIGINT key + CHAR(100)) and reports leaf fill, pages written, doublewrite pages and redo bytes.
# "random" keys are the first 12 hex digits of MD5(n) as an integer (genuinely random order). Do NOT use a multiplicative scramble
# such as n*2654435761 mod 2^32: it is a low-discrepancy sequence that splits leaves in lockstep and sweeps the cache cyclically.
# Resizing the pool online needs innodb_buffer_pool_chunk_size small enough (we ran with chunk=1MB, instances=1).
M="mysql -uroot m3 -N -B"; DATADIR=${DATADIR:-/var/lib/mysql/m3}; mode=$1; shift
if [ "$mode" = sequential ]; then KEY="n"; else KEY="CAST(CONV(LEFT(MD5(n),12),16,10) AS UNSIGNED)"; fi
st(){ $M -e "SHOW GLOBAL STATUS WHERE Variable_name IN ('Innodb_pages_written','Innodb_dblwr_pages_written','Innodb_os_log_written')" | sort | awk '{printf "%s ",$2}'; }
for mb in "$@"; do
  $M -e "SET GLOBAL innodb_buffer_pool_size=$((mb*1048576))"
  for i in $(seq 1 40); do s=$($M -e "SHOW STATUS LIKE 'Innodb_buffer_pool_resize_status'" | awk '{print $2}'); [ -z "$s" ] || echo "$s" | grep -qi "complete" && break; sleep 1; done
  $M -e "DROP TABLE IF EXISTS w; CREATE TABLE w (id BIGINT UNSIGNED PRIMARY KEY, pad CHAR(100) NOT NULL) ENGINE=InnoDB;"
  b=($(st)); $M -e "INSERT INTO w SELECT $KEY, 'x' FROM nums WHERE n<=200000"
  out=$(mysql -uroot m3 -e "FLUSH TABLES w FOR EXPORT; \! python3 $(dirname "$0")/parse_ibd.py $DATADIR/w.ibd" 2>/dev/null | tail -1)
  a=($(st)); dpw=$((a[0]-b[0])); osl=$((a[1]-b[1])); pw=$((a[2]-b[2])); total=$((pw*16384+dpw*16384+osl))
  echo "$mode pool=${mb}MB | $out | pages_written=$pw dblwr_pages=$dpw redo_bytes=$osl physical_over_logical=$(python3 -c "print(round($total/(200000*108),1))")"
done
