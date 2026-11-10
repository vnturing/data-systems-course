# Data Systems Field Course

A deep, hands-on course on how data systems work and fail: storage engines, replication, partitioning, transactions, consensus, batch and stream processing. Static site, no build step.

## Run locally
```
python3 -m http.server 8000
# open http://localhost:8000
```

## Deploy on GitHub Pages
Option A (simplest): push this folder to a repo, then Settings > Pages > "Deploy from a branch" > `main` / root.
Option B (included): Settings > Pages > Source: "GitHub Actions". The workflow in `.github/workflows/pages.yml` runs the tests and deploys on every push to `main`.

All links are relative, so it works under `https://<user>.github.io/<repo>/`.

## Quality checks
```
node tools/test-sim.js      # simulator outcome matrix
python3 tools/check-quiz.py # quiz lint: equal option word counts, varied answer positions
```

## Layout
- `index.html`, `syllabus.html`: entry points
- `lessons/NNNN-slug.html`: one tightly scoped lesson each
- `reference/`: printable reference sheets
- `assets/`: shared CSS and JS (theme, quiz widget, simulators)
- `MISSION.md`, `RESOURCES.md`, `NOTES.md`, `GLOSSARY.md`, `learning-records/`: teaching workspace files

## Content policy
Original writing. Concepts are drawn from cited public sources (papers, lecture notes, vendor docs, engineering blogs). No book text is reproduced.
