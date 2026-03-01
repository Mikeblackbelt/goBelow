import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";
import { loadModel } from "./loader.js";
import { setUpAudio, playAudio } from "./audio.js";
import { showDialogue } from "./dialouge.js";
import { WaveManager } from "./waveManager.js";
import { Spear } from "./spear.js";

setUpAudio();
await RAPIER.init();

const gravity = { x: 0.0, y: -30.0, z: 0.0 };
const world = new RAPIER.World(gravity);

const renderer = new THREE.WebGLRenderer({
  antialias: false,
  powerPreference: "high-performance",
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0000f0);

const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  1000,
);
camera.position.set(5, 5, 10);

// ── Time-stop shader overlay ───────────────────────────────────────────────
const freezeScene = new THREE.Scene();
const freezeCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

const freezeMaterial = new THREE.ShaderMaterial({
  uniforms: {
    tDiffuse: { value: null },
    intensity: { value: 0.0 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float intensity;
    varying vec2 vUv;

    void main() {
      vec4 color = texture2D(tDiffuse, vUv);

      // Desaturate
      float gray = dot(color.rgb, vec3(0.299, 0.587, 0.114));
      vec3 desat = mix(color.rgb, vec3(gray), intensity);

      // Blue tint
      vec3 tinted = mix(desat, vec3(0.4, 0.6, 1.0) * gray, intensity * 0.6);

      // Vignette
      vec2 uv = vUv - 0.5;
      float vignette = 1.0 - dot(uv, uv) * 2.0 * intensity;

      gl_FragColor = vec4(tinted * vignette, 1.0);
    }
  `,
  depthTest: false,
  depthWrite: false,
});

const freezeQuad = new THREE.Mesh(
  new THREE.PlaneGeometry(2, 2),
  freezeMaterial,
);
freezeScene.add(freezeQuad);

const renderTarget = new THREE.WebGLRenderTarget(
  window.innerWidth,
  window.innerHeight,
  { depthBuffer: true, stencilBuffer: false },
);

let freezeShaderIntensity = 0.0;
let freezeShaderTarget = 0.0;

// ─────────────────────────────────────────────────────────────────────────────

scene.add(new THREE.HemisphereLight(0xffeeb1, 0x080820, 0.9));
const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
dirLight.position.set(5, 10, 7);
scene.add(dirLight);

const playerMesh = new THREE.Mesh(
  new THREE.BoxGeometry(1, 1, 1),
  new THREE.MeshStandardMaterial({ color: 0x00ff00 }),
);
scene.add(playerMesh);

const playerBody = world.createRigidBody(
  RAPIER.RigidBodyDesc.dynamic()
    .setTranslation(0, 35, 0)
    .lockRotations()
    .setCcdEnabled(true),
);
world.createCollider(
  RAPIER.ColliderDesc.cuboid(0.48, 0.48, 0.48)
    .setFriction(1.0)
    .setRestitution(0.0),
  playerBody,
);

const keys = {};
window.addEventListener("keydown", (e) => (keys[e.code] = true));
window.addEventListener("keyup", (e) => (keys[e.code] = false));

let moveSpeed = 7.5;
const jumpForce = 30;
let canJump = false;
let spaceWasDown = false;
let jumpCooldown = 0;

let camYaw = 0;
let camPitch = 15 * (Math.PI / 180);
const pitchLimit = 80 * (Math.PI / 180);

let isDragging = false;
let previousMouse = { x: 0, y: 0 };

window.addEventListener("mousedown", (e) => {
  isDragging = true;
  previousMouse.x = e.clientX;
  previousMouse.y = e.clientY;

  // Left click — stab
  if (e.button === 0 && waveManager.active) {
    const result = spear.tryStab(playerMesh.position, camYaw);
    if (result.didHit) {
      waveManager.damageEnemiesNear(
        result.hitPosition,
        result.range,
        result.damage,
      );
    }
  }
});
window.addEventListener("mouseup", () => {
  isDragging = false;
});
window.addEventListener("mousemove", (e) => {
  if (!isDragging) return;
  const dx = e.clientX - previousMouse.x;
  const dy = e.clientY - previousMouse.y;
  previousMouse.x = e.clientX;
  previousMouse.y = e.clientY;
  camYaw -= dx * 0.005;
  camPitch -= dy * 0.005;
  camPitch = Math.max(-pitchLimit, Math.min(pitchLimit, camPitch));
});

const timer = new THREE.Timer();
world.integrationParameters.maxVelocityIterations = 8;
world.integrationParameters.maxPositionIterations = 3;

const cameraLerp = 0.08;
const raycaster = new THREE.Raycaster();
const cameraCollisionRadius = 0.5;

let cityObject = null;
let cityBody = null;

loadModel("models/cityBase/materials.mtl", "models/cityBase/model.obj").then(
  (object) => {
    cityObject = object;
    cityObject.scale.set(100, 100, 100);
    scene.add(cityObject);
    cityObject.updateMatrixWorld(true);

    cityBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());

    cityObject.traverse((child) => {
      if (child.isMesh) {
        const geometry = child.geometry.clone();
        geometry.applyMatrix4(child.matrixWorld);
        if (!geometry.index) {
          const count = geometry.attributes.position.count;
          const indices = new Uint32Array(count);
          for (let i = 0; i < count; i++) indices[i] = i;
          geometry.setIndex(new THREE.BufferAttribute(indices, 1));
        }
        const vertices = new Float32Array(geometry.attributes.position.array);
        const indices = new Uint32Array(geometry.index.array);
        world.createCollider(
          RAPIER.ColliderDesc.trimesh(vertices, indices),
          cityBody,
        );
      }
    });
  },
);

// ── Beam ──────────────────────────────────────────────────────────────────────

const beamPosition = new THREE.Vector3(-6, -7, 30);
const beamRadius = 4;
const beamLength = 100;

let beamVisible = true;
const beamMesh = new THREE.Mesh(
  new THREE.CylinderGeometry(beamRadius, beamRadius, beamLength, 32),
  new THREE.MeshBasicMaterial({
    color: 0xffff00,
    opacity: 0.7,
    transparent: true,
  }),
);
beamMesh.position.copy(beamPosition);
beamMesh.rotation.y = Math.PI / 2;
scene.add(beamMesh);

function isTouchingBeam() {
  const pos = playerBody.translation();
  const dx = pos.x - beamPosition.x;
  const dy = pos.y - beamPosition.y;
  const dz = pos.z - beamPosition.z;
  return (
    dx * dx + dy * dy < beamRadius * beamRadius && Math.abs(dz) < beamLength / 2
  );
}

function onBeamContact() {
  waveManager.startNextWave(playerBody.translation());
}

// ── Player healee. ─────────────────────────────────────────────────────────────

let playerHealth = 30;
let playerMaxHealth = 30;
let playerDead = false;

const healthUI = document.createElement("div");
Object.assign(healthUI.style, {
  position: "absolute",
  bottom: "20px",
  left: "50%",
  transform: "translateX(-50%)",
  width: "200px",
  height: "18px",
  backgroundColor: "#333",
  border: "2px solid #fff",
  borderRadius: "4px",
  overflow: "hidden",
});
const healthBar = document.createElement("div");
Object.assign(healthBar.style, {
  height: "100%",
  width: "100%",
  backgroundColor: "#e74c3c",
  transition: "width 0.15s",
});
healthUI.appendChild(healthBar);
document.body.appendChild(healthUI);

function onAttackPlayer(damage) {
  if (playerDead) return;
  if (isBurrowed) return;
  playerHealth = Math.max(0, playerHealth - damage);
  healthBar.style.width = `${(playerHealth / playerMaxHealth) * 100}%`;
  if (playerHealth <= 0) {
    playerDead = true;
    showDialogue("You died!\nRefresh to restart.");
  }
}

// ── Burrow ────────────────────────────────────────────────────────────────────

let isBurrowed = false;
let burrowTimer = 0;
let burrowCooldown = 0;

const BURROW_DURATION = 2.0;
const BURROW_COOLDOWN = 6.0;

const burrowMaterial = new THREE.MeshStandardMaterial({
  color: 0x3d0c02,
  transparent: false,
  opacity: 1,
});
const normalMaterial = playerMesh.material;

const burrowUI = document.createElement("div");
Object.assign(burrowUI.style, {
  position: "absolute",
  bottom: "76px",
  left: "50%",
  transform: "translateX(-50%)",
  color: "white",
  fontFamily: "monospace",
  fontSize: "13px",
  backgroundColor: "rgba(0,0,0,0.5)",
  padding: "4px 10px",
  borderRadius: "4px",
});
document.body.appendChild(burrowUI);

function updateBurrowUI() {
  if (isBurrowed) {
    burrowUI.textContent = `BURROWED — ${burrowTimer.toFixed(1)}s`;
    burrowUI.style.color = "#ff9900";
  } else if (burrowCooldown > 0) {
    burrowUI.textContent = `Burrow cooldown: ${burrowCooldown.toFixed(1)}s`;
    burrowUI.style.color = "#aaaaaa";
  } else {
    burrowUI.textContent = "H — Burrow (2s invincibility)";
    burrowUI.style.color = "#ffffff";
  }
}

function tryBurrow() {
  if (isBurrowed || burrowCooldown > 0 || !checkGrounded()) return;
  isBurrowed = true;
  burrowTimer = BURROW_DURATION;
  burrowCooldown = BURROW_COOLDOWN;
  playerMesh.material = burrowMaterial;
  playerMesh.position.y -= 0.4;
  playAudio(2);
}

function updateBurrow(frameDelta) {
  if (burrowCooldown > 0) burrowCooldown -= frameDelta;
  if (!isBurrowed) return;
  burrowTimer -= frameDelta;
  if (burrowTimer <= 0) {
    isBurrowed = false;
    burrowTimer = 0;
    playerMesh.material = normalMaterial;
  }
}
const cMoonUI = document.createElement("div");
Object.assign(cMoonUI.style, {
  position: "absolute",
  bottom: "48px",
  left: "50%",
  transform: "translateX(-50%)",
  color: "white",
  fontFamily: "monospace",
  fontSize: "13px",
  backgroundColor: "rgba(0,0,0,0.5)",
  padding: "4px 10px",
  borderRadius: "4px",
});
cMoonUI.textContent = `G - Change the direction of gravity`;
document.body.appendChild(cMoonUI);
// ── Freeze ability ────────────────────────────────────────────────────────────

let freezeCooldown = 0;
const FREEZE_COOLDOWN = 20.0;

const freezeUI = document.createElement("div");
Object.assign(freezeUI.style, {
  position: "absolute",
  bottom: "104px",
  left: "50%",
  transform: "translateX(-50%)",
  color: "white",
  fontFamily: "monospace",
  fontSize: "13px",
  backgroundColor: "rgba(0,0,0,0.5)",
  padding: "4px 10px",
  borderRadius: "4px",
});
document.body.appendChild(freezeUI);

function updateFreezeUI() {
  if (freezeCooldown > 0) {
    freezeUI.textContent = `Freeze cooldown: ${freezeCooldown.toFixed(1)}s`;
    freezeUI.style.color = "#aaaaaa";
  } else {
    if (waveManager.wave >= 6) {
      freezeUI.textContent = `F — Freeze enemies (2s)`;
      freezeUI.style.color = "#ffffff";
    } else {
      freezeUI.textContent = "Ability unlocks wave 6";
    }
  }
}

// ── Wave manager & spear ──────────────────────────────────────────────────────

const waveManager = new WaveManager(world, scene);
const spear = new Spear(scene);

waveManager.onHealthRestore = () => {
  playerHealth = playerMaxHealth;
  healthBar.style.width = "100%";
};

// ── HUD ───────────────────────────────────────────────────────────────────────

const ui = document.createElement("div");
Object.assign(ui.style, {
  position: "absolute",
  top: "10px",
  left: "10px",
  color: "white",
  fontFamily: "monospace",
  fontSize: "16px",
  backgroundColor: "rgba(0,0,0,0.5)",
  padding: "8px",
  borderRadius: "4px",
});
document.body.appendChild(ui);

let deltaCMoon = 0;
const terminalYVelocity = 25;

function checkGrounded() {
  const vel = playerBody.linvel();
  const gravityFlipped = world.gravity.y > 0;

  if (Math.abs(vel.y) > terminalYVelocity) {
    playerBody.setLinvel(
      new RAPIER.Vector3(vel.x, terminalYVelocity * Math.sign(vel.y), vel.z),
      true,
    );
  }

  if (!gravityFlipped && vel.y > 2.0) return false;
  if (gravityFlipped && vel.y < -2.0) return false;

  const pos = playerBody.translation();
  const castDir = gravityFlipped ? { x: 0, y: 1, z: 0 } : { x: 0, y: -1, z: 0 };
  const originY = gravityFlipped ? pos.y + 0.48 : pos.y - 0.48;

  const hit = world.castShape(
    { x: pos.x, y: originY, z: pos.z },
    { w: 1, x: 0, y: 0, z: 0 },
    castDir,
    new RAPIER.Ball(0.3),
    0.2,
    true,
    undefined,
    undefined,
    undefined,
    playerBody,
  );
  return hit !== null;
}

showDialogue("Use WASD to move. Get to the beam\nGO BELOW");

// Safe raycaster — skips meshes detached from scene mid-frame
function safeIntersectObjects(origin, direction) {
  raycaster.set(origin, direction);
  const results = [];
  scene.traverseVisible((obj) => {
    if (!obj.isMesh) return;
    if (obj === playerMesh) return;
    let node = obj;
    while (node.parent) node = node.parent;
    if (node !== scene) return;
    raycaster.intersectObject(obj, false, results);
  });
  results.sort((a, b) => a.distance - b.distance);
  return results;
}

let explosionCooldown = 0;
const EXPLOSION_COOLDOWN = 25.0;
const EXPLOSION_RADIUS = 12;
const EXPLOSION_DAMAGE = 8;

// Explosion visual — sphere that flashes and fades
const explosionMesh = new THREE.Mesh(
  new THREE.SphereGeometry(1, 16, 16),
  new THREE.MeshBasicMaterial({
    color: 0xff6600,
    transparent: true,
    opacity: 0.0,
  }),
);
scene.add(explosionMesh);
let explosionTimer = 0;

const explosionUI = document.createElement("div");
Object.assign(explosionUI.style, {
  position: "absolute",
  bottom: "132px",
  left: "50%",
  transform: "translateX(-50%)",
  color: "white",
  fontFamily: "monospace",
  fontSize: "13px",
  backgroundColor: "rgba(0,0,0,0.5)",
  padding: "4px 10px",
  borderRadius: "4px",
});
document.body.appendChild(explosionUI);

function updateExplosionUI() {
  if (waveManager.wave < 15) {
    explosionUI.textContent = "Ability unlocks wave 15";
    explosionUI.style.color = "#aaaaaa";
  } else if (explosionCooldown > 0) {
    explosionUI.textContent = `Explosion cooldown: ${explosionCooldown.toFixed(1)}s`;
    explosionUI.style.color = "#aaaaaa";
  } else {
    explosionUI.textContent = "E — Explode (HIGH AOE damage)";
    explosionUI.style.color = "#ff6600";
  }
}

function triggerExplosion() {
  const pos = playerBody.translation();
  explosionMesh.position.set(pos.x, pos.y, pos.z);
  explosionMesh.scale.set(1, 1, 1);
  explosionMesh.material.opacity = 0.85;
  explosionTimer = 0.5; // seconds the visual lasts

  waveManager.damageEnemiesNear(pos, EXPLOSION_RADIUS, EXPLOSION_DAMAGE);
  playAudio(4); // swap index if you have a boom sfx
}

function updateExplosion(frameDelta) {
  if (explosionTimer <= 0) return;
  explosionTimer -= frameDelta;
  const t = explosionTimer / 0.5; // 1 → 0 as it fades
  const scale = EXPLOSION_RADIUS * (1 - t * 0.3); // expands outward
  explosionMesh.scale.set(scale, scale, scale);
  explosionMesh.material.opacity = t * 0.85;
  if (explosionTimer <= 0) explosionMesh.material.opacity = 0;
}

let speedAlreadyIncreased = false;
let lastwave = 1;
function animate() {
  const frameDelta = timer.getDelta();
  if (waveManager.wave > lastwave) {
    playerHealth = Math.min(playerHealth + 2, playerMaxHealth)
    healthBar.style.width = `${(playerHealth / playerMaxHealth) * 100}%`;
    lastwave = waveManager.wave;
  }
  if (isBurrowed) {
    playerBody.setGravityScale(0);
  } else {
    playerBody.setGravityScale(1);
  }

  timer.update();
  deltaCMoon += frameDelta;
  jumpCooldown = Math.max(0, jumpCooldown - frameDelta);

  world.step();

  const pos = playerBody.translation();
  playerMesh.position.set(pos.x, pos.y, pos.z);

  if (waveManager.wave === 13 && !speedAlreadyIncreased) {
    speedAlreadyIncreased = true;
    moveSpeed = 14;
    playerMaxHealth += 5;
    playerHealth += 5;
    jumpForce += 1;
  }
  // Beam contact
  if (beamVisible && isTouchingBeam()) {
    playAudio(1, true);
    beamVisible = false;
    beamMesh.visible = false;
    showDialogue(
      "Wave 1 Begins\nUse G to shift gravity for yourself\nUse H to Burrow\nUse Left Click to ATTACK",
    );
    onBeamContact();
  }

  // Freeze ability
  if (keys["KeyF"] && freezeCooldown <= 0 && waveManager.wave >= 6) {
    freezeCooldown = FREEZE_COOLDOWN;
    freezeShaderTarget = 0.8;
    waveManager.freezeEnemies(4);
    playAudio(3, false, 1.5);
    setTimeout(() => {
      freezeShaderTarget = 0.0;
    }, 4000);
  }
  freezeCooldown = Math.max(0, freezeCooldown - frameDelta);
  updateFreezeUI();

  // Explosion ability
  if (keys["KeyE"] && explosionCooldown <= 0 && waveManager.wave >= 15) {
    explosionCooldown = EXPLOSION_COOLDOWN;
    triggerExplosion();
  }
  explosionCooldown = Math.max(0, explosionCooldown - frameDelta);
  updateExplosion(frameDelta);
  updateExplosionUI();

  if (!playerDead) {
    canJump = jumpCooldown <= 0 && checkGrounded();

    let inputX = 0,
      inputZ = 0;
    if (!isBurrowed) {
      if (keys["KeyW"]) inputZ -= 1;
      if (keys["KeyS"]) inputZ += 1;
      if (keys["KeyA"]) inputX -= 1;
      if (keys["KeyD"]) inputX += 1;

      if (inputX !== 0 && inputZ !== 0) {
        inputX *= Math.SQRT1_2;
        inputZ *= Math.SQRT1_2;
      }
    }

    const camDir = new THREE.Vector3(Math.sin(camYaw), 0, Math.cos(camYaw));
    const camRight = new THREE.Vector3()
      .crossVectors(new THREE.Vector3(0, 1, 0), camDir)
      .normalize();
    const moveDir = new THREE.Vector3();
    moveDir.addScaledVector(camDir, inputZ);
    moveDir.addScaledVector(camRight, inputX);
    if (moveDir.lengthSq() > 0) moveDir.normalize();

    const currentVel = playerBody.linvel();
    const velChange = new RAPIER.Vector3(
      moveDir.x * moveSpeed - currentVel.x,
      0,
      moveDir.z * moveSpeed - currentVel.z,
    );
    const mass = playerBody.mass();
    playerBody.applyImpulse(
      { x: velChange.x * mass, y: 0, z: velChange.z * mass },
      true,
    );

    const spaceDown = !!keys["Space"];
    if (spaceDown && !spaceWasDown && canJump) {
      canJump = false;
      jumpCooldown = 0.2;
      const jumpDir = world.gravity.y < 0 ? 1 : -1;
      playerBody.applyImpulse(
        { x: 0, y: jumpForce * mass * jumpDir, z: 0 },
        true,
      );
    }
    spaceWasDown = spaceDown;

    if (keys["KeyG"] && deltaCMoon > 1) {
      deltaCMoon = 0;
      world.gravity.y *= -1;
      playAudio(0);
    }

    // Burrow
    if (keys["KeyH"] && !isBurrowed && burrowCooldown <= 0) {
      tryBurrow();
    }
    updateBurrow(frameDelta);
    updateBurrowUI();

    spear.update(playerMesh.position, camYaw, frameDelta);
    waveManager.update(pos, camera, frameDelta, onAttackPlayer);
  }

  // ── Camera collision ──────────────────────────────────────────────────────

  const distance = 10;
  const height = 4;
  const offset = new THREE.Vector3(
    distance * Math.sin(camYaw) * Math.cos(camPitch),
    distance * Math.sin(camPitch) + height,
    distance * Math.cos(camYaw) * Math.cos(camPitch),
  );

  const direction = offset.clone().normalize();
  const rayDistance = offset.length();
  const intersects = safeIntersectObjects(playerMesh.position, direction);

  let finalDistance = rayDistance;
  for (const hit of intersects) {
    if (hit.distance < finalDistance) {
      finalDistance = Math.max(1.5, hit.distance - cameraCollisionRadius);
      break;
    }
  }

  camera.position.lerp(
    playerMesh.position.clone().addScaledVector(direction, finalDistance),
    cameraLerp,
  );
  camera.lookAt(playerMesh.position);

  ui.innerHTML = `X: ${pos.x.toFixed(1)} Y: ${pos.y.toFixed(1)} Z: ${pos.z.toFixed(1)} | Wave: ${waveManager.wave} | Enemies: ${waveManager.enemies.length}`;

  // ── Render with freeze shader ─────────────────────────────────────────────
  renderer.setRenderTarget(renderTarget);
  renderer.render(scene, camera);
  renderer.setRenderTarget(null);

  freezeMaterial.uniforms.tDiffuse.value = renderTarget.texture;
  freezeShaderIntensity += (freezeShaderTarget - freezeShaderIntensity) * 0.1;
  freezeMaterial.uniforms.intensity.value = freezeShaderIntensity;

  renderer.render(freezeScene, freezeCamera);
}

renderer.setAnimationLoop(animate);

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderTarget.setSize(window.innerWidth, window.innerHeight);
});

window.skipToWave = (n) => {
  if (n <= waveManager.wave) {
    console.warn(`Already on wave ${waveManager.wave}, target must be higher.`);
    return;
  }

  // Kill all existing enemies cleanly
  for (const enemy of waveManager.enemies) {
    if (enemy.alive) enemy.die(world, scene);
  }
  waveManager.enemies = [];

  // Cancel any pending auto-start timer by jumping straight to n-1
  waveManager.wave    = n - 1;
  waveManager.active  = false;
  waveManager.waitingToStart = false;

  // Start the target wave fresh
  waveManager.startNextWave(playerBody.translation());
};