# Working on Underworld

## Versions and the changelog
- **One version per update, not per change.** Everything done on the branch between two merges is the same update:
  one version number and one changelog entry (`src/changelog.ts`). New changes before the merge are added to that
  entry (and its title adjusted if needed), not given a new version.
- A new version starts only after the previous one was merged to main.
- Commits on the branch can be as many as needed; their messages don't need version numbers.
