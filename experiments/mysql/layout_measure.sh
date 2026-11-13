#!/bin/bash
M="mysql -uroot m2 -N -B"
H="SHOW SESSION STATUS WHERE Variable_name IN ('Handler_read_first','Handler_read_key','Handler_read_next','Handler_read_prev','Handler_read_rnd','Handler_read_rnd_next','Handler_read_last')"
reads(){ $M -e "FLUSH STATUS; $1; $H" | awk '$2+0>0 && $1 ~ /Handler/ {s+=$2} END{print s+0}'; }
echo "--- Operation 1: load one full profile (employee 123: 4 positions with company names, 2 educations)"
a=$(reads "SELECT name FROM employees WHERE id=123")
b=$(reads "SELECT p.title,c.name FROM positions p JOIN companies c ON c.id=p.company_id WHERE p.employee_id=123")
c=$(reads "SELECT school FROM educations WHERE employee_id=123")
j=$(reads "SELECT e.name,p.title,c.name,s.school FROM employees e JOIN positions p ON p.employee_id=e.id JOIN companies c ON c.id=p.company_id LEFT JOIN educations s ON s.employee_id=e.id WHERE e.id=123")
rows=$($M -e "SELECT COUNT(*) FROM employees e JOIN positions p ON p.employee_id=e.id JOIN companies c ON c.id=p.company_id LEFT JOIN educations s ON s.employee_id=e.id WHERE e.id=123")
d=$(reads "SELECT doc FROM employees_doc WHERE id=123")
echo "relational, 3 separate queries: reads $a + $b + $c = $((a+b+c)) (3 round trips)"
echo "relational, one join query: reads $j, but returns $rows rows (positions x educations repeated)"
echo "document, primary-key fetch: reads $d (1 round trip)"
echo "--- Operation 4: all employees who ever worked at company 17 (400 positions)"
r=$(reads "SELECT e.id FROM positions p JOIN employees e ON e.id=p.employee_id WHERE p.company_id=17")
di=$(reads "SELECT id FROM employees_doc WHERE 17 MEMBER OF (doc->'\$.positions[*].company_id')")
$M -e "ALTER TABLE employees_doc DROP INDEX idx_pos_company"
ds=$(reads "SELECT id FROM employees_doc WHERE 17 MEMBER OF (doc->'\$.positions[*].company_id')")
$M -e "ALTER TABLE employees_doc ADD INDEX idx_pos_company ((CAST(doc->'\$.positions[*].company_id' AS UNSIGNED ARRAY)))"
echo "relational (index on positions.company_id): reads $r"
echo "document with multi-valued index: reads $di"
echo "document WITHOUT the index (full scan of 20,000 documents): reads $ds"
echo "--- Operation 3: rename company 17"
echo "relational: UPDATE companies SET name='Renamed' WHERE id=17 -> rows changed: $($M -e "UPDATE companies SET name='Renamed' WHERE id=17; SELECT ROW_COUNT()")"
echo "document: documents that embed the old name and must each be rewritten: $($M -e "SELECT COUNT(*) FROM employees_doc WHERE 17 MEMBER OF (doc->'\$.positions[*].company_id')")"
echo "--- stored sizes"
$M -e "SELECT 'avg document bytes (JSON)', ROUND(AVG(LENGTH(doc)),0) FROM employees_doc"
