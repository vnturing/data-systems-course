# Working notes

## Learner preferences (stated)
- Goal: design better systems at work. Starting point: solid backend dev, new to distributed systems.
- Stack: MySQL, Kafka, AWS.
- Wants depth above all; no surface tour. Balanced mix of essays and interactive labs.
- Self-paced. Prefers not to go back and forth on tasks; will ask questions when stuck. Deliver material in bulk as patches. "Do this at work" items are optional and nothing may depend on them.
- Raft implementation track: deferred.
- Deliverable is a static site deployable to GitHub Pages; continuations are delivered as git patches (`git am`).
- Content must be original and source-grounded, not a reproduction of the book.

## Open questions for the learner (non-blocking; answer only if useful)
- Resolved 2026-11-10: no preference among AWS data services. Keep labs vendor-neutral and mention AWS/MySQL/Kafka counterparts where verified.
- Interested in a reading-group community or not? Recorded as undecided in RESOURCES.md.

## Design decisions
- Static HTML/CSS/JS, no build step, relative links so it works on any Pages path.
- Progress lives in browser localStorage (wrapped in try/catch); nothing server-side.
- Quiz rules: all options in a question have equal word count; correct-answer positions vary; no shuffle. Enforced by `tools/check-quiz.py`.
- Every simulator is a pure model plus a thin DOM layer, with a node test under `tools/`. Models are labeled as illustrative where they simplify.
- Each lesson: win statement, 1-2 interactives, retrieval quiz, optional apply box, sources list with secondary sources labeled. Each module also gets a reference sheet.
- When a model contradicts a claim from a source, do not tune the model to agree. Isolate the mechanism in a different experiment and say what each one does and does not show (see Lesson 5).
- GLOSSARY.md stays empty until the learner demonstrates use of a term (per teach-skill rules).

## Build log
- 0001 timeout problem (idempotency keys)
- 0002 crash-point drill (MySQL + Kafka dual write, outbox)
- 0003 system models (failure-detector lab)
- 0004 safety and liveness (Kafka partition lab, 8-config matrix with 3 disaster scenarios)
- 0005 retries (herd lab and outage lab)
- reference/module-0-checklist.html
- 0006 faults, errors, failures (fault/error/failure drill; redundancy vs common-mode lab)
- 0007 percentiles and the tail (percentile merging, fan-out + hedging, coordinated omission labs)
- 0008 fan-out on write or read (two-objective model; found that follower count cancels in total-work terms)
- 0009 queueing and the cliff (Lindley simulator validated against M/M/1 and Pollaczek-Khinchine; Little's law)
- 0010 SLIs, SLOs, error budgets (budget/burn-rate calculator, dependency ceiling)
- 0011 operability and admission control (fluid model: unbounded FIFO collapses and stays collapsed ~45 ticks after the surge)
- reference/module-1-checklist.html

## Next up
1. Module 2 (data models and query languages): relational vs document, many-to-many, schema-on-read vs write, graph models, declarative vs imperative queries. Needs sources first: relational model and document-model papers or vendor docs (MySQL JSON, DynamoDB data modeling), property-graph/query-language references, optimizer docs.
2. Fill the RESOURCES.md Gaps (storage engines, MySQL docs) before Module 3.
3. Lessons learned this patch: when a quick probe contradicts the intended story, the model or the claim is wrong, not the probe. Three times across the last two patches (jitter, Kafka disk loss, fan-out) the fix was a better experiment, not a tuned parameter.
