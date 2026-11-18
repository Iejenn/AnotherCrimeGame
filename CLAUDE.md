# Working on Underworld

## Versions and the changelog
- **One version per update, not per change.** Everything done on the branch between two merges is the same update:
  one version number and one changelog entry (`src/changelog.ts`). New changes before the merge are added to that
  entry (and its title adjusted if needed), not given a new version.
- A new version starts only after the previous one was merged to main.
- Commits on the branch can be as many as needed; their messages don't need version numbers.

## Ask, don't assume
- Whenever something isn't specified (a gap: a number, a rule, how a feature behaves in a case that wasn't discussed),
  stop and ask what to do at that moment, instead of picking something and mentioning it afterwards.
- Whenever a request is unclear, ask before building.
- It's fine to suggest a recommended option when asking, but the choice is the owner's.
