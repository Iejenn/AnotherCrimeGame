// The basketball game on the court (Raid Gym Bags, docs/design.md §4): two players dribble, pass,
// shoot at the hoops and chase rebounds, so the court looks alive while you go through their bags.
// Purely visual: it doesn't affect the crime's odds.
import * as THREE from 'three';
import type { Rect } from './map';

export const BALL_COLOR = 0xe0782a;

type Phase = 'dribble' | 'pass' | 'shoot' | 'rebound';

interface Baller {
  pos: THREE.Vector3;
  target: THREE.Vector3;
  facing: number;
  jump: number;
}

const SPEED = 1.8; // tiles per second
/** v0.60: how close the two players get (their bodies touch below this): they keep apart and slide round each other,
 *  instead of walking into each other (which made them jitter, arms flailing). */
const MIN_GAP = 0.85;
/** How far in front of the ball holder the defender stands (between him and the hoop). */
const GUARD_GAP = 1.1;

export class Hoops {
  private ball: THREE.Mesh;
  private players: Baller[];
  private holder = 0;
  private phase: Phase = 'dribble';
  private phaseStart = 0;
  private phaseLen = 2;
  private from = new THREE.Vector3();
  private to = new THREE.Vector3();
  private last = -1;
  private min: THREE.Vector3;
  private max: THREE.Vector3;
  /** Rim centres: [west, east]. */
  private rims: THREE.Vector3[];

  constructor(scene: THREE.Scene, court: Rect) {
    // The playing area is the court minus the bench row along the north side.
    this.min = new THREE.Vector3(court.x0 + 0.55, 0, court.y0 + 1.5);
    this.max = new THREE.Vector3(court.x1 + 1 - 0.55, 0, court.y1 + 1 - 0.45);
    const cz = (court.y0 + 1 + court.y1 + 1) / 2;
    this.rims = [new THREE.Vector3(court.x0 + 0.45, 1.1, cz), new THREE.Vector3(court.x1 + 1 - 0.45, 1.1, cz)];
    this.players = [0, 1].map((i) => {
      const p = new THREE.Vector3(i ? this.max.x - 1 : this.min.x + 1, 0, cz);
      return { pos: p, target: p.clone(), facing: 0, jump: 0 };
    });
    this.ball = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), new THREE.MeshLambertMaterial({ color: BALL_COLOR }));
    this.ball.castShadow = true;
    scene.add(this.ball);
  }

  private randomSpot() {
    return new THREE.Vector3(this.min.x + Math.random() * (this.max.x - this.min.x), 0, this.min.z + Math.random() * (this.max.z - this.min.z));
  }

  private hand(i: number) {
    const p = this.players[i];
    return new THREE.Vector3(p.pos.x + Math.sin(p.facing) * 0.22, 0.75 + p.jump, p.pos.z + Math.cos(p.facing) * 0.22);
  }

  private setPhase(phase: Phase, t: number, len: number) {
    this.phase = phase;
    this.phaseStart = t;
    this.phaseLen = len;
  }

  private arc(u: number, height: number) {
    const p = this.from.clone().lerp(this.to, u);
    p.y += height * 4 * u * (1 - u);
    return p;
  }

  update(t: number) {
    const dt = this.last < 0 ? 0 : Math.min(0.05, t - this.last);
    this.last = t;
    const el = t - this.phaseStart;
    const u = Math.min(1, el / this.phaseLen);
    const h = this.holder;
    const o = 1 - h;
    // The holder attacks the hoop on the other player's side; holder 0 → east, 1 → west.
    const attack = this.rims[h === 0 ? 1 : 0];

    for (const p of this.players) p.jump = 0;
    if (this.phase === 'dribble') {
      const me = this.players[h];
      if (me.pos.distanceTo(me.target) < 0.05) me.target = this.randomSpot();
      // The defender stays between the holder and the hoop, a body length in front of him (v0.60: it used to aim
      // part-way to the hoop, right on top of the holder when he was close to it), inside the court.
      const toHoop = new THREE.Vector3(attack.x - me.pos.x, 0, attack.z - me.pos.z);
      const def = me.pos.clone().add(toHoop.normalize().multiplyScalar(GUARD_GAP));
      def.x = Math.min(this.max.x, Math.max(this.min.x, def.x));
      def.z = Math.min(this.max.z, Math.max(this.min.z, def.z));
      this.players[o].target.copy(def);
      const hp = this.hand(h);
      this.ball.position.set(hp.x, 0.12 + Math.abs(Math.sin(el * 9)) * 0.55, hp.z);
      if (u >= 1) {
        if (Math.random() < 0.6) {
          this.from.copy(this.hand(h)).setY(1.05);
          this.to.copy(attack);
          me.target.copy(me.pos);
          this.setPhase('shoot', t, 0.9);
        } else {
          this.from.copy(this.hand(h));
          this.to.copy(this.hand(o));
          this.setPhase('pass', t, 0.55);
        }
      }
    } else if (this.phase === 'shoot') {
      const me = this.players[h];
      me.target.copy(me.pos);
      me.facing = Math.atan2(attack.x - me.pos.x, attack.z - me.pos.z);
      if (el < 0.5) me.jump = Math.sin((el / 0.5) * Math.PI) * 0.22;
      this.ball.position.copy(this.arc(u, 0.9));
      if (u >= 1) {
        // Through the net (or off the rim) and down; the other player grabs the rebound.
        const out = new THREE.Vector3(attack.x < (this.min.x + this.max.x) / 2 ? 1 : -1, 0, (Math.random() - 0.5) * 1.2).normalize();
        this.from.copy(attack);
        this.to.set(attack.x + out.x * 1.1, 0.75, attack.z + out.z * 1.1);
        this.to.x = Math.min(this.max.x, Math.max(this.min.x, this.to.x));
        this.to.z = Math.min(this.max.z, Math.max(this.min.z, this.to.z));
        this.players[o].target.set(this.to.x, 0, this.to.z);
        this.setPhase('rebound', t, 0.9);
      }
    } else if (this.phase === 'rebound') {
      // Drops out of the hoop, one bounce, into the rebounder's hands.
      const p = this.arc(u, 0.2);
      p.y = u < 0.5 ? 1.05 - (u / 0.5) * 0.95 : 0.1 + Math.sin(((u - 0.5) / 0.5) * Math.PI) * 0.5 + (u - 0.5) * 1.3;
      this.ball.position.copy(p);
      if (u >= 1) {
        this.holder = o;
        this.players[o].target = this.randomSpot();
        this.setPhase('dribble', t, 1.5 + Math.random() * 1.8);
      }
    } else {
      this.to.copy(this.hand(o));
      this.ball.position.copy(this.arc(u, 0.35));
      if (u >= 1) {
        this.holder = o;
        this.players[o].target = this.randomSpot();
        this.setPhase('dribble', t, 1.2 + Math.random() * 1.8);
      }
    }

    // Move towards targets; face where you're going, or the ball when standing.
    for (const p of this.players) {
      const d = p.target.clone().sub(p.pos).setY(0);
      // (v0.60: a target too close to the other player is pushed out to the edge of his space, so nobody walks into him.)
      const other = this.players[p === this.players[0] ? 1 : 0];
      const fromOther = p.target.clone().sub(other.pos).setY(0);
      if (fromOther.length() < MIN_GAP) {
        p.target.copy(other.pos).add((fromOther.lengthSq() > 1e-6 ? fromOther : p.pos.clone().sub(other.pos).setY(0)).setLength(MIN_GAP));
        d.copy(p.target).sub(p.pos).setY(0);
      }
      if (d.length() > 0.03) {
        p.pos.add(d.clampLength(0, SPEED * dt));
        p.facing = Math.atan2(d.x, d.z);
      } else if (!(this.phase === 'shoot' && p === this.players[h])) {
        p.facing = Math.atan2(this.ball.position.x - p.pos.x, this.ball.position.z - p.pos.z);
      }
    }
    // Never overlapping: if they're closer than MIN_GAP, both step apart (half each) along the line between them, so
    // one slides round the other instead of through him.
    // (A few rounds: one pinned against the court's edge can't step back, so the other steps aside more.)
    const [a, b] = this.players;
    for (let k = 0; k < 4; k++) {
      const gap = b.pos.clone().sub(a.pos).setY(0);
      const dist = gap.length();
      if (dist >= MIN_GAP - 1e-3) break;
      const dir = dist > 1e-4 ? gap.normalize() : new THREE.Vector3(1, 0, 0);
      const push = dir.clone().multiplyScalar((MIN_GAP - dist) / 2);
      a.pos.sub(push);
      b.pos.add(push);
      for (const p of this.players) {
        p.pos.x = Math.min(this.max.x, Math.max(this.min.x, p.pos.x));
        p.pos.z = Math.min(this.max.z, Math.max(this.min.z, p.pos.z));
      }
      // Still too close against a wall: slide sideways along it (across the line between them).
      if (k === 3 && b.pos.distanceTo(a.pos) < MIN_GAP) b.pos.add(new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(MIN_GAP / 2));
    }
  }

  /** Where player i is (for the character model). */
  player(i: number, t: number) {
    const p = this.players[i];
    return { pos: p.pos, facing: p.facing, jump: p.jump, shooting: this.phase === 'shoot' && i === this.holder && t - this.phaseStart < 0.45 };
  }

  dispose() {
    this.ball.geometry.dispose();
    (this.ball.material as THREE.Material).dispose();
    this.ball.removeFromParent();
  }
}
