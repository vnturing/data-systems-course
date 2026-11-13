DROP DATABASE IF EXISTS m2; CREATE DATABASE m2; USE m2;

-- 1. A JSON column cannot be indexed directly; index a generated column or use a multi-valued index.
CREATE TABLE profile (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  doc JSON NOT NULL,
  -- scalar path promoted to a virtual generated column and indexed
  email VARCHAR(100) GENERATED ALWAYS AS (doc->>'$.email') VIRTUAL,
  KEY idx_email (email),
  -- multi-valued index over an array of ints
  KEY idx_company_ids ((CAST(doc->'$.company_ids' AS UNSIGNED ARRAY))),
  CONSTRAINT doc_has_shape CHECK (JSON_SCHEMA_VALID(
    '{"type":"object","required":["name","email"],"properties":{"name":{"type":"string"},"email":{"type":"string"},"company_ids":{"type":"array","items":{"type":"integer"}}}}', doc))
) ENGINE=InnoDB;

INSERT INTO profile(doc) VALUES
 ('{"name":"Ada","email":"ada@example.com","company_ids":[1,2]}'),
 ('{"name":"Grace","email":"grace@example.com","company_ids":[2,3]}');

SELECT 'valid inserts ok' AS step, COUNT(*) AS n FROM profile;
-- 2. The CHECK constraint rejects a document of the wrong shape (this INSERT should fail):
INSERT INTO profile(doc) VALUES ('{"name":"Bad","email":42}');
