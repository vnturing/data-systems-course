# Working notes

## Learner preferences (stated)
- Goal: design better systems at work. Starting point: solid backend dev, new to distributed systems.
- Wants depth above all; no surface tour. Balanced mix of essays and interactive labs.
- Deliverable is a static site deployable to GitHub Pages.
- Content must be original and source-grounded, not a reproduction of the book.

## Open questions for the learner
- Which stack do you run at work (Postgres/MySQL, Kafka, DynamoDB/Cassandra, cloud vendor)? Lets labs use your tools.
- Anything explicitly out of scope (e.g. ML infra, a particular vendor)? MISSION.md "Out of scope" is empty.
- Interested in a community (reading group) or not? Recorded as undecided in RESOURCES.md.
- Optional implementation track (MIT 6.5840-style Raft lab) or keep to simulators?

## Design decisions
- Static HTML/CSS/JS, no build step, relative links so it works on any Pages path.
- Progress lives in browser localStorage (wrapped in try/catch); nothing server-side.
- Quiz rules: all options in a question have equal word count; correct-answer positions vary; no shuffle. Enforced by `tools/check-quiz.py`.
- Simulator logic is pure functions, tested by `tools/test-sim.js`.
- Each lesson: win statement, 1-2 interactives, retrieval quiz, "do this at work", sources list. Each module also gets a reference sheet.
- GLOSSARY.md stays empty until the learner demonstrates use of a term (per teach-skill rules).

## Next up
1. Lesson 0002: Partial failure and the "what if this dies right here?" drill (use learner's own findings from the 0001 work-task).
2. Lesson 0003: System models.
3. Fill the Gaps in RESOURCES.md before building Module 3 (storage engines).
