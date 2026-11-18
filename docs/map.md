# The city map

![The city, blocks numbered and lots lettered](map.svg)

To talk about a place, use its **block number** and **lot letter**: "002-C" is block 002, lot C (Eddy's).

- **Blocks** are numbered row by row from the north-west corner:

  ```
  001  002  003
  004  005  006
  007  008  009
  ```
- **Lots** in a block (each 5×5 tiles):

  ```
  A  B
  C  D
  ```
- Between the blocks are the streets (7 tiles: sidewalk, road, sidewalk). The red dot is where you start.
- In the code the same names are used: `lot('002', 'C')`, `block('008')` in `src/street/map.ts`.

This page and the picture are generated from the game's map: after changing `src/street/map.ts`, run
`npx vite-node scripts/map-doc.ts`.

| Lot | What's there | Tiles x | Tiles y |
|---|---|---|---|
| 001-A | Buildings | 58–62 | 7–11 |
| 001-B | Buildings | 63–67 | 7–11 |
| 001-C | Buildings | 58–62 | 12–16 |
| 001-D | Buildings | 63–67 | 12–16 |
| 002-A | Buildings | 75–79 | 7–11 |
| 002-B | Buildings | 80–84 | 7–11 |
| 002-C | Buildings | 75–79 | 12–16 |
| 002-D | Buildings | 80–84 | 12–16 |
| 003-A | Buildings | 92–96 | 7–11 |
| 003-B | Park + barbecue | 97–101 | 7–11 |
| 003-C | Buildings | 92–96 | 12–16 |
| 003-D | Buildings | 97–101 | 12–16 |
| 004-A | Buildings | 58–62 | 24–28 |
| 004-B | Basketball court | 63–67 | 24–28 |
| 004-C | Buildings | 58–62 | 29–33 |
| 004-D | Buildings | 63–67 | 29–33 |
| 005-A | Buildings | 75–79 | 24–28 |
| 005-B | Hospital (ward, upstairs) | 80–84 | 24–28 |
| 005-C | Candy store | 75–79 | 29–33 |
| 005-D | Hospital (lobby) | 80–84 | 29–33 |
| 006-A | Buildings | 92–96 | 24–28 |
| 006-B | Buildings | 97–101 | 24–28 |
| 006-C | Buildings | 92–96 | 29–33 |
| 006-D | Buildings | 97–101 | 29–33 |
| 007-A | The Yard (thugs) | 58–62 | 41–45 |
| 007-B | The Yard (thugs) | 63–67 | 41–45 |
| 007-C | The Yard (thugs) | 58–62 | 46–50 |
| 007-D | The Yard (thugs) | 63–67 | 46–50 |
| 008-A | Central Park | 75–79 | 41–45 |
| 008-B | Central Park | 80–84 | 41–45 |
| 008-C | Central Park | 75–79 | 46–50 |
| 008-D | Central Park | 80–84 | 46–50 |
| 009-A | Buildings | 92–96 | 41–45 |
| 009-B | Buildings | 97–101 | 41–45 |
| 009-C | Buildings | 92–96 | 46–50 |
| 009-D | Buildings | 97–101 | 46–50 |
| 010-A | Central Park | 58–62 | 58–62 |
| 010-B | Central Park | 63–67 | 58–62 |
| 010-C | Central Park | 58–62 | 63–67 |
| 010-D | Central Park | 63–67 | 63–67 |
| 011-A | Central Park: the Plaza | 75–79 | 58–62 |
| 011-B | Central Park: the Plaza | 80–84 | 58–62 |
| 011-C | Central Park: the Plaza | 75–79 | 63–67 |
| 011-D | Central Park: the Plaza | 80–84 | 63–67 |
| 012-A | Central Park | 92–96 | 58–62 |
| 012-B | Central Park | 97–101 | 58–62 |
| 012-C | Central Park | 92–96 | 63–67 |
| 012-D | Central Park | 97–101 | 63–67 |
| 013-A | Buildings | 58–62 | 75–79 |
| 013-B | Buildings | 63–67 | 75–79 |
| 013-C | Buildings | 58–62 | 80–84 |
| 013-D | Buildings | 63–67 | 80–84 |
| 014-A | Central Park | 75–79 | 75–79 |
| 014-B | Central Park | 80–84 | 75–79 |
| 014-C | Central Park | 75–79 | 80–84 |
| 014-D | Central Park | 80–84 | 80–84 |
| 015-A | Buildings | 92–96 | 75–79 |
| 015-B | Buildings | 97–101 | 75–79 |
| 015-C | Buildings | 92–96 | 80–84 |
| 015-D | Buildings | 97–101 | 80–84 |
| 016-A | Buildings | 58–62 | 92–96 |
| 016-B | Buildings | 63–67 | 92–96 |
| 016-C | Buildings | 58–62 | 97–101 |
| 016-D | Buildings | 63–67 | 97–101 |
| 017-A | Buildings | 75–79 | 92–96 |
| 017-B | Buildings | 80–84 | 92–96 |
| 017-C | Buildings | 75–79 | 97–101 |
| 017-D | Buildings | 80–84 | 97–101 |
| 018-A | Buildings | 92–96 | 92–96 |
| 018-B | Buildings | 97–101 | 92–96 |
| 018-C | Buildings | 92–96 | 97–101 |
| 018-D | Buildings | 97–101 | 97–101 |
| F-001-A | Buildings | 109–113 | 7–11 |
| F-001-B | Buildings | 114–118 | 7–11 |
| F-001-C | Buildings | 109–113 | 12–16 |
| F-001-D | Buildings | 114–118 | 12–16 |
| F-002-A | Buildings | 126–130 | 7–11 |
| F-002-B | Buildings | 131–135 | 7–11 |
| F-002-C | Eddy's General Store | 126–130 | 12–16 |
| F-002-D | Ray's Arms | 131–135 | 12–16 |
| F-003-A | Buildings | 143–147 | 7–11 |
| F-003-B | Buildings | 148–152 | 7–11 |
| F-003-C | Buildings | 143–147 | 12–16 |
| F-003-D | Buildings | 148–152 | 12–16 |
| F-004-A | Buildings | 109–113 | 24–28 |
| F-004-B | Buildings | 114–118 | 24–28 |
| F-004-C | Buildings | 109–113 | 29–33 |
| F-004-D | Buildings | 114–118 | 29–33 |
| F-005-A | The Bank | 126–130 | 24–28 |
| F-005-B | The Bank | 131–135 | 24–28 |
| F-005-C | The Bank | 126–130 | 29–33 |
| F-005-D | The Bank | 131–135 | 29–33 |
| F-006-A | Buildings | 143–147 | 24–28 |
| F-006-B | Buildings | 148–152 | 24–28 |
| F-006-C | Buildings | 143–147 | 29–33 |
| F-006-D | Buildings | 148–152 | 29–33 |
| F-007-A | Buildings | 109–113 | 41–45 |
| F-007-B | Buildings | 114–118 | 41–45 |
| F-007-C | Buildings | 109–113 | 46–50 |
| F-007-D | Buildings | 114–118 | 46–50 |
| F-008-A | Buildings | 126–130 | 41–45 |
| F-008-B | Buildings | 131–135 | 41–45 |
| F-008-C | Buildings | 126–130 | 46–50 |
| F-008-D | Buildings | 131–135 | 46–50 |
| F-009-A | Buildings | 143–147 | 41–45 |
| F-009-B | Buildings | 148–152 | 41–45 |
| F-009-C | Buildings | 143–147 | 46–50 |
| F-009-D | Buildings | 148–152 | 46–50 |
| F-010-A | Buildings | 109–113 | 58–62 |
| F-010-B | Buildings | 114–118 | 58–62 |
| F-010-C | Buildings | 109–113 | 63–67 |
| F-010-D | Buildings | 114–118 | 63–67 |
| F-011-A | Buildings | 126–130 | 58–62 |
| F-011-B | Buildings | 131–135 | 58–62 |
| F-011-C | Buildings | 126–130 | 63–67 |
| F-011-D | Buildings | 131–135 | 63–67 |
| F-012-A | Buildings | 143–147 | 58–62 |
| F-012-B | Buildings | 148–152 | 58–62 |
| F-012-C | Buildings | 143–147 | 63–67 |
| F-012-D | Buildings | 148–152 | 63–67 |
| F-013-A | Superstore parking | 109–113 | 75–79 |
| F-013-B | Superstore yard | 114–118 | 75–79 |
| F-013-C | Superstore | 109–113 | 80–84 |
| F-013-D | Superstore | 114–118 | 80–84 |
| F-014-A | Buildings | 126–130 | 75–79 |
| F-014-B | Buildings | 131–135 | 75–79 |
| F-014-C | Buildings | 126–130 | 80–84 |
| F-014-D | Buildings | 131–135 | 80–84 |
| F-015-A | Gas & Go | 143–147 | 75–79 |
| F-015-B | Parking lot | 148–152 | 75–79 |
| F-015-C | Parking lot | 143–147 | 80–84 |
| F-015-D | Parking lot | 148–152 | 80–84 |
| F-016-A | Buildings | 109–113 | 92–96 |
| F-016-B | Buildings | 114–118 | 92–96 |
| F-016-C | Buildings | 109–113 | 97–101 |
| F-016-D | Buildings | 114–118 | 97–101 |
| F-017-A | Buildings | 126–130 | 92–96 |
| F-017-B | Buildings | 131–135 | 92–96 |
| F-017-C | Buildings | 126–130 | 97–101 |
| F-017-D | Buildings | 131–135 | 97–101 |
| F-018-A | Buildings | 143–147 | 92–96 |
| F-018-B | Buildings | 148–152 | 92–96 |
| F-018-C | Buildings | 143–147 | 97–101 |
| F-018-D | Buildings | 148–152 | 97–101 |
| I-001-A | Buildings | 7–11 | 7–11 |
| I-001-B | Buildings | 12–16 | 7–11 |
| I-001-C | Buildings | 7–11 | 12–16 |
| I-001-D | Buildings | 12–16 | 12–16 |
| I-002-A | Iron Saints MC | 24–28 | 7–11 |
| I-002-B | Iron Saints MC | 29–33 | 7–11 |
| I-002-C | Buildings | 24–28 | 12–16 |
| I-002-D | Buildings | 29–33 | 12–16 |
| I-003-A | The Factory | 41–45 | 7–11 |
| I-003-B | The Factory | 46–50 | 7–11 |
| I-003-C | The Factory | 41–45 | 12–16 |
| I-003-D | The Factory | 46–50 | 12–16 |
| I-004-A | Buildings | 7–11 | 24–28 |
| I-004-B | Buildings | 12–16 | 24–28 |
| I-004-C | Buildings | 7–11 | 29–33 |
| I-004-D | Buildings | 12–16 | 29–33 |
| I-005-A | Buildings | 24–28 | 24–28 |
| I-005-B | Buildings | 29–33 | 24–28 |
| I-005-C | Buildings | 24–28 | 29–33 |
| I-005-D | Buildings | 29–33 | 29–33 |
| I-006-A | Buildings | 41–45 | 24–28 |
| I-006-B | Buildings | 46–50 | 24–28 |
| I-006-C | Buildings | 41–45 | 29–33 |
| I-006-D | Buildings | 46–50 | 29–33 |
| I-007-A | Buildings | 7–11 | 41–45 |
| I-007-B | Buildings | 12–16 | 41–45 |
| I-007-C | Buildings | 7–11 | 46–50 |
| I-007-D | Buildings | 12–16 | 46–50 |
| I-008-A | Buildings | 24–28 | 41–45 |
| I-008-B | Buildings | 29–33 | 41–45 |
| I-008-C | Buildings | 24–28 | 46–50 |
| I-008-D | Buildings | 29–33 | 46–50 |
| I-009-A | The bar | 41–45 | 41–45 |
| I-009-B | The Yard (thugs) | 46–50 | 41–45 |
| I-009-C | The bar | 41–45 | 46–50 |
| I-009-D | The Yard (thugs) | 46–50 | 46–50 |
| I-010-A | Buildings | 7–11 | 58–62 |
| I-010-B | Buildings | 12–16 | 58–62 |
| I-010-C | Buildings | 7–11 | 63–67 |
| I-010-D | Buildings | 12–16 | 63–67 |
| I-011-A | Buildings | 24–28 | 58–62 |
| I-011-B | Buildings | 29–33 | 58–62 |
| I-011-C | Buildings | 24–28 | 63–67 |
| I-011-D | Buildings | 29–33 | 63–67 |
| I-012-A | Buildings | 41–45 | 58–62 |
| I-012-B | Buildings | 46–50 | 58–62 |
| I-012-C | Buildings | 41–45 | 63–67 |
| I-012-D | Buildings | 46–50 | 63–67 |
| I-013-A | Buildings | 7–11 | 75–79 |
| I-013-B | Buildings | 12–16 | 75–79 |
| I-013-C | Buildings | 7–11 | 80–84 |
| I-013-D | Buildings | 12–16 | 80–84 |
| I-014-A | Buildings | 24–28 | 75–79 |
| I-014-B | Buildings | 29–33 | 75–79 |
| I-014-C | Buildings | 24–28 | 80–84 |
| I-014-D | Buildings | 29–33 | 80–84 |
| I-015-A | Buildings | 41–45 | 75–79 |
| I-015-B | Buildings | 46–50 | 75–79 |
| I-015-C | Buildings | 41–45 | 80–84 |
| I-015-D | Buildings | 46–50 | 80–84 |
| I-016-A | Buildings | 7–11 | 92–96 |
| I-016-B | Buildings | 12–16 | 92–96 |
| I-016-C | Buildings | 7–11 | 97–101 |
| I-016-D | Buildings | 12–16 | 97–101 |
| I-017-A | Buildings | 24–28 | 92–96 |
| I-017-B | Buildings | 29–33 | 92–96 |
| I-017-C | Buildings | 24–28 | 97–101 |
| I-017-D | Buildings | 29–33 | 97–101 |
| I-018-A | Buildings | 41–45 | 92–96 |
| I-018-B | Buildings | 46–50 | 92–96 |
| I-018-C | Buildings | 41–45 | 97–101 |
| I-018-D | Buildings | 46–50 | 97–101 |
