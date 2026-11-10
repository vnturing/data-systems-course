# Mission: Data-intensive systems design

## Why
Make better design decisions about the data systems they build and run at work (storage, replication, partitioning, transactions, streams) by understanding the mechanisms and failure modes underneath the tools, rather than treating databases and queues as black boxes.

## Success looks like
- Review a design doc and name, with a concrete argument, what happens when a node dies, a message is duplicated, or a replica lags at each step.
- Choose between storage engines, replication setups, and isolation levels for a real feature and defend the trade-off.
- Read a database's documentation or a Jepsen report and tell what guarantees it really provides.
- Find and fix at least one real correctness risk (e.g. an unsafe retry) in a system they own, as an outcome of the course.

## Constraints
- Starts as a solid backend developer, new to distributed systems (see learning record 0001).
- Works with MySQL, Kafka and AWS (see learning record 0002). Examples and labs should use these where a mechanism has a real counterpart.
- Self-paced: the learner prefers to work through material independently and will ask when something is unclear. Deliver lessons in bulk; do not gate content on reports back.
- Wants depth above all: mechanisms, failure modes, and trade-offs, not an overview.
- Format: a static site deployable to GitHub Pages; balanced mix of long-form explanation and interactive labs.
- Content must be original, built from public sources (papers, lecture notes, docs, engineering write-ups), not a reproduction of any book.

## Out of scope
- A hands-on Raft implementation track (MIT 6.5840-style): deferred by the learner on 2026-11-10. Revisit after Modules 8 and 9 if they ask.
