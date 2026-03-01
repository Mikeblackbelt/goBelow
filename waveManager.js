import { Enemy } from "./enemy.js";
import { showDialogue } from "./dialouge.js";
import * as THREE from 'three'
import RAPIER from "@dimforge/rapier3d-compat";
import { color } from "three/src/nodes/TSL.js";

const loreDialogue = [
  "yo gurt", //0
  "ZOMBIES are rising from the depths of their graves... Fight them!",
  "Use G to change the direction of gravity\nZombies will fly up faster than you",
  "Use H to burrow beneath the surface!\nThis will protect you for 2 seconds.",
  "Something big may be coming...\nHealth Restored to Full", //4
  "A zombie knight is coming! It has more health and does more damage!",
  "Prepare for a swarm!\nUse F to activate time stop!",
  "Zombies now have increased speed! Watch out!\nHealth Restored", //7
  "How did these zombies come here?",
  "Who summoned them...?\nZombie Knights incoming!\nHealth fully restored",
  "MEGAKNIGHT", //10
  "Blitz incoming!!!\nThese zombies have high speed and damage!",
  'thats alot of them.... :(\nHealth Fully Restored', //12
  'You can now move faster. Deal with the swarm.',
  'thats everything we saw so far...',
  'You\' need something new to deal with this\nClick E to blow things up\nHealth Fully Restored', //15
  'if you are hit, its over...\nBe careful with the void',
  'Watch out!',
  'Prepare for some heavy enemies...\nHealth restored', //18
  'lock in twin',
  'Welcome to the end\nBeat this, and you achieve your goal.\nYou will save this city\nHealthy Fully Restored ',
  'yo i lied lmao prepare to die'
];

// Waves where player health is fully restored
const healthWaves = [4, 7, 9, 12, 15,18,20];

// Per-wave enemy compositions
// Keys must match ENEMY_TYPES below
const zombieAmounts = [
  { filler: 1 },
  { Standard: 4 },
  { Standard: 6, Fast: 1 },
  { Standard: 6, Fast: 2, Jumpy: 1},
  { Standard: 2, Fast: 4, Strong: 1, Jumpy: 1 },
  { Knight: 1, Strong: 4 },
  { Fast: 10, Standard: 3, Strong: 3, Jumpy: 2},
  { Fast: 12, Standard: 4, Jumpy: 4 },
  { Standard: 18 },
  { Knight: 5, Strong: 2, Fast: 1, Jumpy: 1 },
  { Megaknight: 1, Knight: 5, Jumpy: 10},
  { Blitz: 12},
  { Standard: 30},
  { filler: 1,Standard: 1, Fast: 1, Jumpy: 1, Knight: 1, Strong: 1, Megaknight: 1, Blitz: 1},
  { Tank: 1, filler: 5, Standard: 5},
  { void: 3},
  { void: 1, Fast: 30},
  { Tank: 2, Megaknight: 2, Knight: 2, Strong: 2, void: 2},
  { Strong: 10, Jumpy: 4, Blitz: 5, void: 1},
   {theBigOne:1, Strong: 4, Jumpy: 5, Blitz: 3, void: 1, Standard: 3, Tank: 1},
   {fake: 500}
];

// Stat definitions for each enemy type.
// jumpForce     — how hard they jump (default 18 if omitted)
// stuckMinSpeed — horizontal speed below which they're considered stuck (default 0.8)
//                 Jumpy has speed < stuckMinSpeed so it ALWAYS jumps on cooldown
export const ENEMY_TYPES = {
  fake: {
    health: 9999999,
    speed: 9999999,
    damage: 999999,
    attackCooldown: 0.00001,
    color: 0x000000,
    scale: 10,
    jumpForce: 4,
    stuckMinSpeed: 99999
  },
  theBigOne: {
    health: 1000,
    speed: 2,
    damage: 5,
    attackCooldown: 2,
    color: 0x88ff31,
    scale: 6.7,
    jumpForce: 50,
    stuckMinSpeed: 1
  },
  filler: {
    health:         1,
    speed:          1.5,
    damage:         0,
    attackCooldown: 999,
    color:          0x888888,
    scale:          0.6,
    jumpForce:      10,
    stuckMinSpeed:  0.8,
  },
  void: {
    health: 1,
    speed: 1,
    damage: 40,
    color: 0x000000,
    attackCooldown: 5,
    scale: 1, 
    jumpForce: 18,
    stuckMinSpeed: 0.8
  },
  Standard: {
    health:         5,
    speed:          4,
    damage:         1,
    attackCooldown: 1.2,
    color:          0x228822,
    scale:          1.0,
    jumpForce:      18,
    stuckMinSpeed:  0.8,
  },
  Blitz: {
    health: 2,
    speed: 20,
    damage: 0.3,
    attackCooldown: 0.1,
    color: 0x00f4ff,
    scale: 0.5,
    jumpForce: 30,
    stuckMinSpeed: 10
  },
  Fast: {
    health:         3,
    speed:          8,
    damage:         1,
    attackCooldown: 0.8,
    color:          0xddaa00,
    scale:          0.85,
    jumpForce:      20,   // fast enemies leap higher
    stuckMinSpeed:  1.2,  // higher threshold — they notice walls quicker
  },
  Tank: {
    health: 100,
    speed: 1.5,
    damage: 2,
    attackCooldown: 1,
    color: 0x0f0f1f,
    scale: 5,
    jumpForce: 30,
    stuckMinSpeed: 1
  },
  Strong: {
    health:         12,
    speed:          3,
    damage:         2,
    attackCooldown: 1.8,
    color:          0x882222,
    scale:          1.2,
    jumpForce:      15,   // heavy, lower jump
    stuckMinSpeed:  0.8,
  },
  Knight: {
    health:         30,
    speed:          2.5,
    damage:         4,
    attackCooldown: 3.0,
    color:          0x334455,
    scale:          2,
    jumpForce:      22,   // big lunge to get over obstacles
    stuckMinSpeed:  0.8,
  },
  // Jumpy: speed (0.5) is BELOW stuckMinSpeed (2.0) so it is ALWAYS "stuck"
  // and will jump on every jumpCooldown interval — it bounces constantly.
  Jumpy: {
    health:         1,
    speed:          3,
    damage:         2.5,
    attackCooldown: 1,
    color:          0x8f0fff,
    scale:          0.35,
    jumpForce:      40,       // launches very high
    jumpCooldown:   0.2,      // jumps frequently
    stuckMinSpeed:  4.0,      //
    stuckThreshold: 0.1,      // barely any delay before jumping
  },
  Megaknight: {
    health:         50,
    speed:          2.2,
    damage:         6,
    attackCooldown: 2.5,
    color:          0x334455,
    scale:          4,
    jumpForce:      30,
    stuckMinSpeed:  0.8,
  },
};

// How many attempts to find a clear spawn before giving up
const MAX_SPAWN_ATTEMPTS = 20;
const SPAWN_FLOOR_CAST   = 10;  // how far down to look for a floor
const SPAWN_WALL_RADIUS  = 1.0; // how far out to check for walls

function findClearSpawn(world, playerPos, radius) {
  for (let attempt = 0; attempt < MAX_SPAWN_ATTEMPTS; attempt++) {

    // Pick a random point in a ring around the player
    const angle = Math.random() * Math.PI * 2;
    const dist  = radius + Math.random() * 19;
    const candidate = {
      x: playerPos.x + Math.cos(angle) * dist,
      y: playerPos.y + 15,
      z: playerPos.z + Math.sin(angle) * dist,
    };

    // ── 1. Cast down — must hit a floor ──────────────────────────────────────
    const floorHit = world.castRay(
      new RAPIER.Ray(candidate, { x: 0, y: -1, z: 0 }),
      SPAWN_FLOOR_CAST,
      true
    );
    if (!floorHit) continue;

    const floorY = candidate.y - floorHit.timeOfImpact + 1.0;
    const landedPos = { x: candidate.x, y: floorY, z: candidate.z };

    // ── 2. Cast outward in 4 directions — must not be inside a wall ──────────
    const wallDirs = [
      { x:  1, y: 0, z:  0 },
      { x: -1, y: 0, z:  0 },
      { x:  0, y: 0, z:  1 },
      { x:  0, y: 0, z: -1 },
    ];

    let insideWall = false;
    for (const dir of wallDirs) {
      const wallHit = world.castRay(
        new RAPIER.Ray(landedPos, dir),
        SPAWN_WALL_RADIUS,
        true
      );
      if (wallHit && wallHit.timeOfImpact < SPAWN_WALL_RADIUS) {
        insideWall = true;
        break;
      }
    }
    if (insideWall) continue;

    return landedPos;
  }

  // Fallback
  return { x: playerPos.x, y: playerPos.y + 5, z: playerPos.z };
}

export class WaveManager {
  constructor(world, scene) {
    this.world   = world;
    this.scene   = scene;
    this.wave    = 0;
    this.enemies = [];
    this.active  = false;
    this.waitingToStart = false;

    this.onHealthRestore = null;
  }

  startNextWave(playerPos) {
    this.wave++;
    this.active = true;
    this.waitingToStart = false;

    if (healthWaves.includes(this.wave) && this.onHealthRestore) {
      this.onHealthRestore();
    }

    const composition = zombieAmounts[this.wave - 1] ?? { Standard: this.wave * 2 };

    const spawnList = [];
    for (const [type, count] of Object.entries(composition)) {
      for (let i = 0; i < count; i++) spawnList.push(type);
    }

    for (const type of spawnList) {
      const stats    = ENEMY_TYPES[type] ?? ENEMY_TYPES.Standard;
      const spawnPos = findClearSpawn(this.world, playerPos, 40);
      this.enemies.push(new Enemy(this.world, this.scene, spawnPos, stats));
    }

    const label = this.wave <= loreDialogue.length - 1
      ? loreDialogue[this.wave]
      : `Wave ${this.wave}!`;
    showDialogue(label);
  }

  update(playerPos, camera, frameDelta, onAttackPlayer) {
    if (!this.active) return;

    for (const enemy of this.enemies) {
      enemy.update(playerPos, camera, frameDelta, onAttackPlayer);
    }

    this.enemies = this.enemies.filter(e => e.alive);

    if (this.enemies.length === 0 && !this.waitingToStart) {
      this.waitingToStart = true;
      this.active = false;
      showDialogue(`Wave ${this.wave} cleared!\nNext wave in 5 seconds...`);
      setTimeout(() => this.startNextWave(playerPos), 5000);
    }
  }

  damageEnemiesNear(pos, range, damage) {
    for (const enemy of this.enemies) {
      if (!enemy.alive) continue;
      const ep = enemy.body.translation();
      const rangeSize = range + (enemy.mesh.geometry.parameters.width ?? 1.0);
      const dx = ep.x - pos.x;
      const dz = ep.z - pos.z;
      const dy = ep.y - pos.y;
      if (dx * dx + dz * dz + dy * dy < rangeSize * rangeSize) {
        enemy.takeDamage(damage, this.world, this.scene);
      }
    }
  }

  freezeEnemies(duration) {
  for (const enemy of this.enemies) {
    if (!enemy.alive) continue;
    enemy.frozen = true;
    enemy.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    setTimeout(() => {
      if (enemy.alive) enemy.frozen = false;
    }, duration * 1000);
  }
}
}

export var skipToWave = (n, wm) => {
  "wm is an instance of waveManager"
  while (wm.wave != n) {
    startNextWave()
  }
}