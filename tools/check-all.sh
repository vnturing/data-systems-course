#!/bin/sh
# Runs every simulator test and the quiz lint. Exit non-zero on the first failure.
set -e
cd "$(dirname "$0")/.."
for t in test-sim test-dualwrite test-detector test-kafka test-retry test-redundancy test-latency test-fanout test-queue test-slo test-admission test-planner test-graph test-layout test-m2m test-schema test-log test-wal test-lsm test-btree test-ui-constants test-storage-extra test-encoding test-replication test-partitioning; do node tools/$t.js; done
python3 tools/check-quiz.py > /dev/null && echo "quiz lint: OK"
