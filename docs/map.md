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
| 001-A | Buildings | 7–11 | 7–11 |
| 001-B | Buildings | 12–16 | 7–11 |
| 001-C | Buildings | 7–11 | 12–16 |
| 001-D | Buildings | 12–16 | 12–16 |
| 002-A | Buildings | 24–28 | 7–11 |
| 002-B | Buildings | 29–33 | 7–11 |
| 002-C | Eddy's General Store | 24–28 | 12–16 |
| 002-D | Ray's Arms | 29–33 | 12–16 |
| 003-A | Buildings | 41–45 | 7–11 |
| 003-B | Pocket park | 46–50 | 7–11 |
| 003-C | Buildings | 41–45 | 12–16 |
| 003-D | Buildings | 46–50 | 12–16 |
| 004-A | Buildings | 7–11 | 24–28 |
| 004-B | Basketball court | 12–16 | 24–28 |
| 004-C | The bar | 7–11 | 29–33 |
| 004-D | Buildings | 12–16 | 29–33 |
| 005-A | Buildings | 24–28 | 24–28 |
| 005-B | Buildings | 29–33 | 24–28 |
| 005-C | Candy store | 24–28 | 29–33 |
| 005-D | Buildings | 29–33 | 29–33 |
| 006-A | Gas & Go | 41–45 | 24–28 |
| 006-B | Parking lot | 46–50 | 24–28 |
| 006-C | Parking lot | 41–45 | 29–33 |
| 006-D | Parking lot | 46–50 | 29–33 |
| 007-A | Buildings | 7–11 | 41–45 |
| 007-B | Buildings | 12–16 | 41–45 |
| 007-C | Pocket park | 7–11 | 46–50 |
| 007-D | Buildings | 12–16 | 46–50 |
| 008-A | Central Park | 24–28 | 41–45 |
| 008-B | Central Park | 29–33 | 41–45 |
| 008-C | Central Park | 24–28 | 46–50 |
| 008-D | Central Park | 29–33 | 46–50 |
| 009-A | Buildings | 41–45 | 41–45 |
| 009-B | Buildings | 46–50 | 41–45 |
| 009-C | Buildings | 41–45 | 46–50 |
| 009-D | Buildings | 46–50 | 46–50 |
