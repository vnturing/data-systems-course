# Encoding experiments behind Module 4

These are executable examples, not performance benchmarks. No database, broker or registry is contacted. The browser codecs are independently checked against real **Apache Avro 1.12.0** and **Python Protobuf 6.33.5**. The environment version is recorded in `results.json`.

## Reproduce

From the repository root, using an isolated environment:

```sh
python3.14 -m venv /tmp/dsc-encoding-venv
/tmp/dsc-encoding-venv/bin/python -m pip install avro==1.12.0 protobuf==6.33.5
/tmp/dsc-encoding-venv/bin/python experiments/encoding/verify.py > /tmp/dsc-encoding-results.json
```

Compare the generated file with the committed `results.json`. The Python patch version may differ; the deterministic bytes and decoded results should match. Updating a fixture requires inspecting the result, not changing the model to make an unexpected outcome disappear. `node tools/test-encoding.js` uses the committed fixtures without installing these packages, so the static website and CI still need no extra dependencies.

## What is executed

- **70 wire examples:** 35 explicit records, each with and without a currency field. Includes uint32 boundaries, explicit zero and empty string, non-ASCII names, an emoji and fixed-seed samples. JSON uses compact UTF-8. Protobuf uses dynamic descriptors with proto3 optional scalar presence so explicit zero/empty values remain present. Avro encodes bare records, not object container files. The browser's three byte arrays must exactly match each sample.
- **54 Avro writer/reader outcomes:** all nine pairs in six independently specified three-version scenarios: additive defaults, addition without a default, removal, int-to-long widening, removal of a previously added default, and a semantic unit change. Successful values and writer bytes are recorded; failures retain the real exception type. The browser schema subset is compared to these results.
- **Four Protobuf intermediary paths:** opaque forwarding, normal binary editing, field-by-field rebuilding and old-message ProtoJSON round trip. The last two lose the unfamiliar currency; normal binary editing preserves it. A separate new-message ProtoJSON input is rejected by the old schema's default parser.
- **Reused-tag interpretation:** a new string named email at old name's tag reads Zoë without a parse failure. This demonstrates why syntactic compatibility does not preserve meaning.
- **Text boundaries:** Python JSON retains an exact large integer that ordinary JavaScript JSON.parse rounds. Python's CSV reader parses three fields, including a quoted comma and CRLF; naive comma splitting produces four. Base64 of Zoë's four UTF-8 bytes is `Wm/Dqw==`.

## Important limits

`assets/sim-encoding.js` intentionally covers only singular Protobuf uint32/string fields using wire types 0 and 2, and flat named Avro records with int/long/string. It omits nested messages, maps, arrays, unions, aliases, enums, most wire types, full int64 ranges and general schema validation. Avro longs are restricted to JavaScript safe integers. The Protobuf inspector models explicit scalar presence, not all proto3 implicit-default omission behavior. Use actual libraries in applications.

The bare record sizes exclude framing, schema IDs, schema distribution, compression, CPU cost and transport. Exact byte comparisons are valid for these simple controlled records; they do not assert that arbitrary Protobuf serialization is canonical. The scripts build descriptors in memory, so `protoc` is unnecessary.

The matrix is an executable record-resolution exercise, not an implementation of Confluent or AWS registry checking. It does not prove compatibility for arbitrary schemas, configurations or application data. `unit` is application metadata deliberately ignored by Avro resolution. Every amount in the semantic exercise represents USD 12.00; defaults are only meaningful under that historical premise. The migration audit checks only the selected roles, v1 history and v1 rollback, not an actual fleet.

The fixture's Python large integer is intentionally a numeric JSON token. Loading the fixture into a JavaScript Number rounds that observation too. The test therefore checks the literal token separately instead of treating its already-rounded parsed value as evidence about Python. This is the exact boundary failure the lesson teaches.

No MySQL update protocol, Kafka retention configuration, registry availability, RPC delivery guarantee, concurrent schema rollout or production latency was measured. The lessons label those paths as design scenarios.
