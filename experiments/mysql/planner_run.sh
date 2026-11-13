#!/bin/bash
M="mysql -uroot m2 -N -B"
Qopt="SELECT COUNT(*) FROM orders o JOIN customers c ON c.id=o.customer_id JOIN regions r ON r.id=c.region_id WHERE r.name='EU' AND o.status='open'"
Qaw="SELECT COUNT(*) FROM orders o STRAIGHT_JOIN customers c ON c.id=o.customer_id STRAIGHT_JOIN regions r ON r.id=c.region_id WHERE r.name='EU' AND o.status='open'"
H="SHOW SESSION STATUS WHERE Variable_name IN ('Handler_read_first','Handler_read_key','Handler_read_next','Handler_read_prev','Handler_read_rnd','Handler_read_rnd_next','Handler_read_last')"
reads(){ $M -e "FLUSH STATUS; $1; $H" | awk '$2+0>0 && $1 ~ /Handler/ {s+=$2} END{print s}'; }
cfg(){ # $1 label; rest = which indexes to keep: s=idx_status o=idx_oc c=idx_cr
  label="$1"; keep="$2"
  $M -e "ALTER TABLE orders DROP INDEX idx_status" 2>/dev/null; $M -e "ALTER TABLE orders DROP INDEX idx_oc" 2>/dev/null; $M -e "ALTER TABLE customers DROP INDEX idx_cr" 2>/dev/null
  [[ $keep == *s* ]] && $M -e "ALTER TABLE orders ADD INDEX idx_status(status)"
  [[ $keep == *o* ]] && $M -e "ALTER TABLE orders ADD INDEX idx_oc(customer_id)"
  [[ $keep == *c* ]] && $M -e "ALTER TABLE customers ADD INDEX idx_cr(region_id)"
  declare -A cnt; declare -A rd
  for i in 1 2 3 4 5 6; do
    $M -e "ANALYZE TABLE orders, customers, regions" >/dev/null
    order=$($M -e "EXPLAIN FORMAT=TREE $Qopt" | sed 's/\\n/\n/g' | grep -oE "on (o|c|r)( using|\s|$)" | sed -E 's/on (.).*/\1/' | awk '!seen[$0]++' | tr '\n' '>')
    r=$(reads "$Qopt"); cnt[$order]=$(( ${cnt[$order]:-0} + 1 )); rd[$order]=$r
  done
  aw=$(reads "$Qaw")
  out=""; for k in "${!cnt[@]}"; do out="$out ${k%>}: ${cnt[$k]}/6 runs, ${rd[$k]} reads;"; done
  echo "$label |$out | as-written o>c>r: $aw reads"
}
cfg "A all indexes" "soc"
cfg "B no idx_status" "oc"
cfg "C no idx_region(customers)" "so"
cfg "D no idx_orders.customer_id" "sc"
cfg "E primary keys only" ""
