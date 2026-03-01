import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";

const NUM_RAYS      = 16;
const RAY_LENGTH    = 4;
const AVOID_WEIGHT  = 2.5;
const PLAYER_WEIGHT = 1.0;
const ATTACK_RANGE  = 1.8;

// Defaults — individual enemy types can override via stats
const DEFAULT_JUMP_FORCE      = 18;
const DEFAULT_JUMP_COOLDOWN   = 0.8;
const DEFAULT_STUCK_THRESHOLD = 0.5;
const DEFAULT_STUCK_MIN_SPEED = 0.8;

export class Enemy {
  constructor(world, scene, spawnPos, stats) {
    this.world  = world;
    this.scene  = scene;
    this.alive  = true;
    this.attackTimer = 0;

    // Jump / stuck state
    this.jumpCooldown = 0;
    this.stuckTimer   = 0;

    // Apply stats from ENEMY_TYPES
    this.maxHealth      = stats.health;
    this.health         = stats.health;
    this.speed          = stats.speed;
    this.damage         = stats.damage;
    this.attackCooldown = stats.attackCooldown;
    const scale         = stats.scale ?? 1.0;
    this.scale = stats.scale ?? 1.0;

    // Per-character jump tuning (falls back to defaults if not set in ENEMY_TYPES)
    this.jumpForce            = stats.jumpForce      ?? DEFAULT_JUMP_FORCE;
    this.jumpCooldownDuration = stats.jumpCooldown   ?? DEFAULT_JUMP_COOLDOWN;
    this.stuckThreshold       = stats.stuckThreshold ?? DEFAULT_STUCK_THRESHOLD;
    this.stuckMinSpeed        = stats.stuckMinSpeed  ?? DEFAULT_STUCK_MIN_SPEED;

    // Mesh — scale drives physical size too
    this.mesh = new THREE.Mesh(
      new THREE.BoxGeometry(scale, scale * 1.8, scale),
      new THREE.MeshStandardMaterial({ color: stats.color ?? 0xcc0000 })
    );
    scene.add(this.mesh);

    // Health bar
    const barBg = new THREE.Mesh(
      new THREE.PlaneGeometry(1.2, 0.15),
      new THREE.MeshBasicMaterial({ color: 0x333333, depthTest: false })
    );
    this.healthBarFill = new THREE.Mesh(
      new THREE.PlaneGeometry(1.2, 0.15),
      new THREE.MeshBasicMaterial({ color: 0x00ff44, depthTest: false })
    );
    this.healthBarFill.position.z = 0.001;
    this.healthBarGroup = new THREE.Group();
    this.healthBarGroup.add(barBg);
    this.healthBarGroup.add(this.healthBarFill);
    scene.add(this.healthBarGroup);

    // Physics — collider half-extents match mesh scale
    const hw = scale * 0.48;
    const hh = scale * 0.88;
    this.body = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(spawnPos.x, spawnPos.y, spawnPos.z)
        .lockRotations()
        .setCcdEnabled(true)
    );
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(hw, hh, hw)
        .setFriction(1.0)
        .setRestitution(0.0),
      this.body
    );

    this._rayDirs = this._buildRayDirs();
  }

  _buildRayDirs() {
    const dirs = [];
    for (let i = 0; i < NUM_RAYS; i++) {
      const angle = (i / NUM_RAYS) * Math.PI * 2;
      dirs.push({ x: Math.sin(angle), y: 0, z: Math.cos(angle) });
    }
    return dirs;
  }

  _steerTowardPlayer(playerPos) {
  const pos = this.body.translation();
  const dx  = playerPos.x - pos.x;
  const dz  = playerPos.z - pos.z;
  const dy  = playerPos.y - pos.y;

  const dist = Math.sqrt(dx * dx + dz * dz);

  const MAX_DIST = 40;
  const snapX = Math.abs(dx) > MAX_DIST ? playerPos.x - Math.sign(dx) * MAX_DIST : pos.x;
  const snapY = Math.abs(dy) > MAX_DIST ? playerPos.y - Math.sign(dy) * MAX_DIST : pos.y;
  const snapZ = Math.abs(dz) > MAX_DIST ? playerPos.z - Math.sign(dz) * MAX_DIST : pos.z;

  if (snapX !== pos.x || snapY !== pos.y || snapZ !== pos.z) {
    this.body.setTranslation({ x: snapX, y: snapY, z: snapZ }, true);
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true); // kill momentum after teleport
  }

  if (dist < 0.01) return { x: 0, z: 0 };

  const playerDir = { x: dx / dist, z: dz / dist };

  let bestScore = -Infinity;
  let bestDir   = playerDir;

  for (const dir of this._rayDirs) {
    const playerScore = dir.x * playerDir.x + dir.z * playerDir.z;

    const hit = this.world.castRay(
      new RAPIER.Ray(
        { x: pos.x, y: pos.y, z: pos.z },
        { x: dir.x, y: 0,     z: dir.z }
      ),
      RAY_LENGTH,
      true,
      undefined, undefined, undefined,
      this.body
    );

    const obstacleScore = hit
      ? -AVOID_WEIGHT * (1 - hit.timeOfImpact / RAY_LENGTH)
      : 0;

    const score = PLAYER_WEIGHT * playerScore + obstacleScore;
    if (score > bestScore) {
      bestScore = score;
      bestDir   = dir;
    }
  }

  return bestDir;
}

  _checkGrounded() {
    const pos = this.body.translation();
    const hit = this.world.castShape(
      { x: pos.x, y: pos.y - 0.88, z: pos.z },
      { w: 1, x: 0, y: 0, z: 0 },
      { x: 0, y: -1, z: 0 },
      new RAPIER.Ball(0.25),
      0.2,
      true,
      undefined, undefined, undefined,
      this.body
    );
    return hit !== null;
  }

  update(playerPos, camera, frameDelta, onAttackPlayer) {
    if (this.frozen) return;
    if (!this.alive) return;

    const pos = this.body.translation();
    this.mesh.position.set(pos.x, pos.y, pos.z);

    // Billboard health bar
    this.healthBarGroup.position.set(pos.x, pos.y + 1.8, pos.z);
    this.healthBarGroup.quaternion.copy(camera.quaternion);
    const pct = this.health / this.maxHealth;
    this.healthBarFill.scale.x    = pct;
    this.healthBarFill.position.x = (pct - 1) * 0.6;

    this.attackTimer  = Math.max(0, this.attackTimer  - frameDelta);
    this.jumpCooldown = Math.max(0, this.jumpCooldown - frameDelta);

    const dx   = playerPos.x - pos.x;
    const dz   = playerPos.z - pos.z;
    const dy   = playerPos.y - pos.y;
    const dist = Math.sqrt(dx * dx + dz * dz + dy * dy);

    if (dist < ATTACK_RANGE + this.scale) {
      if (this.attackTimer <= 0) {
        this.attackTimer = this.attackCooldown;
        onAttackPlayer(this.damage);
      }
    } else {
      const steerDir = this._steerTowardPlayer(playerPos);
      const vel      = this.body.linvel();
      const mass     = this.body.mass();

      this.body.applyImpulse({
        x: (steerDir.x * this.speed - vel.x) * mass,
        y: 0,
        z: (steerDir.z * this.speed - vel.z) * mass,
      }, true);

      if (steerDir.x !== 0 || steerDir.z !== 0) {
        this.mesh.rotation.y = Math.atan2(steerDir.x, steerDir.z);
      }

      // ── Stuck detection & jumping ─────────────────────────────────────────
      const horizSpeed = Math.sqrt(vel.x * vel.x + vel.z * vel.z);
      const isGrounded = this._checkGrounded();

      if (horizSpeed < this.stuckMinSpeed && isGrounded) {
        this.stuckTimer += frameDelta;
      } else {
        this.stuckTimer = 0;
      }

      if (this.stuckTimer >= this.stuckThreshold && isGrounded && this.jumpCooldown <= 0) {
        this.stuckTimer   = 0;
        this.jumpCooldown = this.jumpCooldownDuration;
        this.body.applyImpulse({ x: 0, y: this.jumpForce * mass, z: 0 }, true);
      }
    }
  }

  takeDamage(amount, world, scene) {
    if (!this.alive) return;
    this.health -= amount;

    this.mesh.material.emissive.setHex(0xff0000);
    setTimeout(() => {
      if (this.mesh.material) this.mesh.material.emissive.setHex(0x000000);
    }, 100);

    if (this.health <= 0) this.die(world, scene);
  }

  die(world, scene) {
    this.alive = false;
    scene.remove(this.mesh);
    scene.remove(this.healthBarGroup);
    world.removeRigidBody(this.body);
  }
}

