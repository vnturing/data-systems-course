USE m2;
DROP TABLE IF EXISTS positions; DROP TABLE IF EXISTS educations; DROP TABLE IF EXISTS employees; DROP TABLE IF EXISTS companies; DROP TABLE IF EXISTS employees_doc;
CREATE TABLE companies (id INT PRIMARY KEY, name VARCHAR(40) NOT NULL) ENGINE=InnoDB;
CREATE TABLE employees (id INT PRIMARY KEY, name VARCHAR(40) NOT NULL) ENGINE=InnoDB;
CREATE TABLE positions (id INT PRIMARY KEY AUTO_INCREMENT, employee_id INT NOT NULL, company_id INT NOT NULL, title VARCHAR(30) NOT NULL, KEY idx_emp (employee_id), KEY idx_co (company_id)) ENGINE=InnoDB;
CREATE TABLE educations (id INT PRIMARY KEY AUTO_INCREMENT, employee_id INT NOT NULL, school VARCHAR(40) NOT NULL, KEY idx_emp (employee_id)) ENGINE=InnoDB;
INSERT INTO companies SELECT n, CONCAT('Company ',n) FROM nums WHERE n<=200;
INSERT INTO employees SELECT n, CONCAT('Person ',n) FROM nums WHERE n<=20000;
-- each employee has 4 positions at 4 distinct companies; 2 educations
INSERT INTO positions (employee_id, company_id, title) SELECT e.n, ((e.n*7 + k.k*13) MOD 200)+1, 'engineer' FROM nums e, (SELECT 0 k UNION SELECT 1 UNION SELECT 2 UNION SELECT 3) k WHERE e.n<=20000;
INSERT INTO educations (employee_id, school) SELECT e.n, CONCAT('School ',k.k) FROM nums e, (SELECT 0 k UNION SELECT 1) k WHERE e.n<=20000;
-- the same data as one JSON document per employee, company name embedded in each position
CREATE TABLE employees_doc (id INT PRIMARY KEY, doc JSON NOT NULL) ENGINE=InnoDB;
INSERT INTO employees_doc
SELECT e.id, JSON_OBJECT('name', e.name,
  'positions', (SELECT JSON_ARRAYAGG(JSON_OBJECT('company_id',p.company_id,'company_name',c.name,'title',p.title)) FROM positions p JOIN companies c ON c.id=p.company_id WHERE p.employee_id=e.id),
  'educations',(SELECT JSON_ARRAYAGG(JSON_OBJECT('school',s.school)) FROM educations s WHERE s.employee_id=e.id))
FROM employees e;
ALTER TABLE employees_doc ADD INDEX idx_pos_company ((CAST(doc->'$.positions[*].company_id' AS UNSIGNED ARRAY)));
ANALYZE TABLE companies, employees, positions, educations, employees_doc;
SELECT (SELECT COUNT(*) FROM employees) employees, (SELECT COUNT(*) FROM positions) positions, (SELECT COUNT(*) FROM employees_doc) docs,
       (SELECT COUNT(*) FROM positions WHERE company_id=17) positions_at_company_17;
SELECT JSON_PRETTY(doc) FROM employees_doc WHERE id=123;
