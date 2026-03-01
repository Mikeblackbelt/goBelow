import * as THREE from "three";

const SPEAR_LENGTH  = 2.5;
const SPEAR_RADIUS  = 0.07;
const STAB_RANGE    = 3.0;
const STAB_COOLDOWN = 0.5;

// Glow colour — change this to whatever you like
const GLOW_COLOR = 0x00ccff;
const GLOW_EMISSIVE_IDLE   = 0x003366;
const GLOW_EMISSIVE_ACTIVE = 0x00ccff;

export class Spear {
  constructor(scene) {
    this.scene        = scene;
    this.stab_damage = 3;
    this.stabCooldown = 0;
    this.stabbing     = false;
    this.stabTimer    = 0;
    this._glowTime    = 0;

    // ── Materials ─────────────────────────────────────────────────────────────

    const shaftMat = new THREE.MeshStandardMaterial({
      color:     0x4a2800,
      roughness: 0.6,
      metalness: 0.1,
    });

    // Shared blade material so we can pulse emissive on both tips at once
    this._bladeMat = new THREE.MeshStandardMaterial({
      color:     GLOW_COLOR,
      emissive:  new THREE.Color(GLOW_EMISSIVE_IDLE),
      metalness: 0.9,
      roughness: 0.1,
    });

    // ── Geometry ──────────────────────────────────────────────────────────────

    // Shaft
    const shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(SPEAR_RADIUS, SPEAR_RADIUS, SPEAR_LENGTH, 8),
      shaftMat
    );
    shaft.rotation.x = Math.PI / 2;

    // Front tip (cone pointing forward  →  +Z after rotation)
    const tipFront = new THREE.Mesh(
      new THREE.ConeGeometry(SPEAR_RADIUS * 3, 0.5, 8),
      this._bladeMat
    );
    tipFront.rotation.x = Math.PI / 2;
    tipFront.position.z = SPEAR_LENGTH / 2 + 0.25;

    // Back tip  (cone pointing backward →  -Z, so rotate 180° on X)
    const tipBack = new THREE.Mesh(
      new THREE.ConeGeometry(SPEAR_RADIUS * 3, 0.5, 8),
      this._bladeMat
    );
    tipBack.rotation.x = -Math.PI / 2;
    tipBack.position.z = -(SPEAR_LENGTH / 2 + 0.25);

    // ── Glow sprite (soft halo around the shaft) ──────────────────────────────

    const spriteMat = new THREE.SpriteMaterial({
      color:       GLOW_COLOR,
      transparent: true,
      opacity:     0.18,
      depthWrite:  false,
      blending:    THREE.AdditiveBlending,
    });
    this._glowSprite = new THREE.Sprite(spriteMat);
    this._glowSprite.scale.set(0.55, SPEAR_LENGTH + 1.2, 1);
    // Sprites are always camera-facing — no rotation needed

    // ── Assemble ──────────────────────────────────────────────────────────────

    this.group = new THREE.Group();
    this.group.add(shaft);
    this.group.add(tipFront);
    this.group.add(tipBack);
    this.group.add(this._glowSprite);
    scene.add(this.group);

    // ── Animation offsets ─────────────────────────────────────────────────────

    this._restOffset    = new THREE.Vector3(0.5, -0.4, -0.8);
    this._stabOffset    = new THREE.Vector3(0.5, -0.4, -2.2);
    this._currentOffset = this._restOffset.clone();
  }

  update(playerPos, camYaw, frameDelta) {
    this.stabCooldown = Math.max(0, this.stabCooldown - frameDelta);
    this._glowTime   += frameDelta;

    // ── Stab animation ────────────────────────────────────────────────────────

    if (this.stabbing) {
      this.stabTimer += frameDelta;
      const t = Math.min(this.stabTimer / 0.12, 1);
      this._currentOffset.lerpVectors(
        this._restOffset,
        this._stabOffset,
        t < 0.5 ? t * 2 : 2 - t * 2
      );
      if (this.stabTimer > 0.25) this.stabbing = false;
    } else {
      this._currentOffset.lerp(this._restOffset, 0.2);
    }

    // ── Position ──────────────────────────────────────────────────────────────

    const offset = this._currentOffset.clone();
    offset.applyEuler(new THREE.Euler(0, camYaw, 0));
    this.group.position.copy(playerPos).add(offset);
    this.group.rotation.y = camYaw;

    // ── Pulsing glow ──────────────────────────────────────────────────────────

    // Idle: slow gentle pulse. Active (just stabbed): bright flash.
    const cooldownFraction = this.stabCooldown / STAB_COOLDOWN; // 1→0
    const idlePulse  = 0.5 + 0.5 * Math.sin(this._glowTime * 3);
    const flashBoost = cooldownFraction * 1.5;

    const emissiveIntensity = idlePulse * 0.4 + flashBoost;
    this._bladeMat.emissive.setHex(GLOW_COLOR);
    this._bladeMat.emissiveIntensity = emissiveIntensity;

    // Sprite opacity tracks same pulse
    this._glowSprite.material.opacity = 0.10 + idlePulse * 0.12 + flashBoost * 0.25;
  }

  tryStab(playerPos, camYaw) {
    if (this.stabCooldown > 0) return { didHit: false };

    this.stabCooldown = STAB_COOLDOWN;
    this.stabbing     = true;
    this.stabTimer    = 0;

    const forward = new THREE.Vector3(-Math.sin(camYaw), 0, -Math.cos(camYaw));
    const stabPos = new THREE.Vector3()
      .copy(playerPos)
      .addScaledVector(forward, STAB_RANGE * 0.5);

    return {
      didHit:      true,
      hitPosition: stabPos,
      range:       STAB_RANGE * 0.5,
      damage:      this.stab_damage,
    };
  }
}