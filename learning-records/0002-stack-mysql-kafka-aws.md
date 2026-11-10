# Stack disclosed: MySQL, Kafka, AWS at work

Learner states they run MySQL, Kafka and AWS at work. This is operational exposure; depth of understanding of the mechanisms underneath each was not assessed and should not be assumed.

## Implications
- Prefer MySQL, Kafka and AWS (SQS, SDK retry behavior, RDS/Aurora, MSK, DynamoDB) as concrete examples where the mechanism has a real counterpart.
- Do not assume knowledge of ISR, isolation anomalies in MySQL's default level, or binlog/CDC internals; teach them from first principles.
- Gaps to fill with verified sources before the matching modules: MySQL replication, semi-sync and Group Replication docs; InnoDB isolation and MVCC docs; RDS/Aurora failover docs; MSK configuration defaults; DynamoDB consistency docs.

## Preferences recorded in the same message
- Hold off on a Raft implementation track.
- Self-paced; no back-and-forth tasks. "Do this at work" sections are optional.
