import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";
import { loadModel } from "./loader.js";
import { setUpAudio, playAudio } from "./audio.js";
import { showDialogue } from "./dialouge.js";

setUpAudio();
await RAPIER.init();

const gravity = { x: 0.0, y: -30.0, z: 0.0 };
const world = new RAPIER.World(gravity);

const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(5, 5, 10);

scene.add(new THREE.HemisphereLight(0xffeeb1, 0x080820, 0.9));
const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
dirLight.position.set(5, 10, 7);
scene.add(dirLight);

const playerMesh = new THREE.Mesh(
  new THREE.BoxGeometry(1, 1, 1),
  new THREE.MeshStandardMaterial({ color: 0x00ff00 })
);
scene.add(playerMesh);

const playerBody = world.createRigidBody(
  RAPIER.RigidBodyDesc.dynamic()
    .setTranslation(0, 35, 0)
    .lockRotations()
    .setCcdEnabled(true)
);
world.createCollider(
  RAPIER.ColliderDesc.cuboid(0.48, 0.48, 0.48).setFriction(1.0).setRestitution(0.0),
  playerBody
);

const keys = {};
window.addEventListener("keydown", (e) => (keys[e.code] = true));
window.addEventListener("keyup",   (e) => (keys[e.code] = false));

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
window.addEventListener("mousedown", (e) => { isDragging = true; previousMouse.x = e.clientX; previousMouse.y = e.clientY; });
window.addEventListener("mouseup",   () => { isDragging = false; });
window.addEventListener("mousemove", (e) => {
  if (!isDragging) return;
  const dx = e.clientX - previousMouse.x;
  const dy = e.clientY - previousMouse.y;
  previousMouse.x = e.clientX;
  previousMouse.y = e.clientY;
  camYaw   -= dx * 0.005;
  camPitch -= dy * 0.005;
  camPitch  = Math.max(-pitchLimit, Math.min(pitchLimit, camPitch));
});

const timer = new THREE.Timer();
world.integrationParameters.maxVelocityIterations = 8;
world.integrationParameters.maxPositionIterations = 3;

const cameraLerp = 0.08;
const raycaster = new THREE.Raycaster();
const cameraCollisionRadius = 0.5;

// Store cityBody in outer scope so we can remove it when entering the level
let cityObject = null;
let cityBody   = null;

loadModel("models/cityBase/materials.mtl", "models/cityBase/model.obj").then((object) => {
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
      const indices  = new Uint32Array(geometry.index.array);
      world.createCollider(RAPIER.ColliderDesc.trimesh(vertices, indices), cityBody);
    }
  });
});

const beamPosition = new THREE.Vector3(-6, -7, 30);
const beamRadius   = 4;
const beamLength   = 100;
const beamMesh = new THREE.Mesh(
  new THREE.CylinderGeometry(beamRadius, beamRadius, beamLength, 32),
  new THREE.MeshBasicMaterial({ color: 0xffff00, opacity: 0.7, transparent: true })
);
beamMesh.position.copy(beamPosition);
beamMesh.rotation.y = Math.PI / 2;
scene.add(beamMesh);

const beamBody = world.createRigidBody(
  RAPIER.RigidBodyDesc.fixed().setTranslation(beamPosition.x, beamPosition.y, beamPosition.z)
);
world.createCollider(
  RAPIER.ColliderDesc.cylinder(beamLength / 2, beamRadius)
    .setRotation({ w: Math.cos(Math.PI / 4), x: 0, y: 0, z: Math.sin(Math.PI / 4) }),
  beamBody
);

let level1Loaded  = false;
let cleanupLevel1 = null;

function isTouchingBeam() {
  const pos = playerBody.translation();
  const dx  = pos.x - beamPosition.x;
  const dy  = pos.y - beamPosition.y;
  return (dx * dx + dy * dy) < (beamRadius * beamRadius);
}

const ui = document.createElement("div");
Object.assign(ui.style, {
  position: "absolute", top: "10px", left: "10px",
  color: "white", fontFamily: "monospace", fontSize: "16px",
  backgroundColor: "rgba(0,0,0,0.5)", padding: "8px", borderRadius: "4px",
});
document.body.appendChild(ui);

let deltaCMoon = 0;
const terminalYVelocity = 25;

function checkGrounded() {
  const vel = playerBody.linvel();
  const gravityFlipped = world.gravity.y > 0;

  if (Math.abs(vel.y) > terminalYVelocity) {
    playerBody.setLinvel(
      new RAPIER.Vector3(vel.x, terminalYVelocity * Math.sign(vel.y), vel.z), true
    );
  }

  if (!gravityFlipped && vel.y >  2.0) return false;
  if ( gravityFlipped && vel.y < -2.0) return false;

  const pos     = playerBody.translation();
  const castDir = gravityFlipped ? { x: 0, y: 1, z: 0 } : { x: 0, y: -1, z: 0 };
  const originY = gravityFlipped ? pos.y + 0.48 : pos.y - 0.48;

  const hit = world.castShape(
    { x: pos.x, y: originY, z: pos.z },
    { w: 1, x: 0, y: 0, z: 0 },
    castDir,
    new RAPIER.Ball(0.3),
    0.2, true,
    undefined, undefined, undefined,
    playerBody
  );
  return hit !== null;
}

showDialogue('Use WASD to move. Get to the beam\nGO BELOW');

function animate() {
  timer.update();
  const frameDelta = timer.getDelta();
  deltaCMoon  += frameDelta;
  jumpCooldown = Math.max(0, jumpCooldown - frameDelta);

  world.step();

  const pos = playerBody.translation();
  playerMesh.position.set(pos.x, pos.y, pos.z);

  if (!level1Loaded && isTouchingBeam()) {
    level1Loaded = true;

    // FIX: remove city properly using the stored references
    if (cityObject) scene.remove(cityObject);
    if (cityBody)   world.removeRigidBody(cityBody);   // removes body + all its colliders
    cityObject = null;
    cityBody   = null;

    // Also hide the beam mesh (player is now inside the room)
    scene.remove(beamMesh);
    scene.background = new THREE.Color(0x006994);

    const result = loadModel("models/level1/obj.mtl", "models/level1/tinker.obj").then((object) => {
  const level1Mesh = object;
  level1Mesh.scale.set(0.5, 0.5, 0.5);
  level1Mesh.rotation.set(0,90,0);

  scene.add(level1Mesh);
  level1Mesh.updateMatrixWorld(true);

  const level1Body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());

  level1Mesh.traverse((child) => {
    if (child.isMesh) {
      const geometry = child.geometry.clone();
      playerBody.translation.apply(0,100,0);
      geometry.applyMatrix4(child.matrixWorld);
      if (!geometry.index) {
        const count = geometry.attributes.position.count;
        const indices = new Uint32Array(count);
        for (let i = 0; i < count; i++) indices[i] = i;
        geometry.setIndex(new THREE.BufferAttribute(indices, 1));
      }
      const vertices = new Float32Array(geometry.attributes.position.array);
      const indices  = new Uint32Array(geometry.index.array);
      world.createCollider(RAPIER.ColliderDesc.trimesh(vertices, indices), level1Body);
    }
  });

  showDialogue("You'll need C-Moon to get through this.\nUse G to activate your new ability, but be careful...");
});

    showDialogue("You'll need C-Moon to get through this.\nUse G to activate your new ability, but be careful...");
  }

  canJump = jumpCooldown <= 0 && checkGrounded();

  let inputX = 0, inputZ = 0;
  if (keys["KeyW"]) inputZ -= 1;
  if (keys["KeyS"]) inputZ += 1;
  if (keys["KeyA"]) inputX -= 1;
  if (keys["KeyD"]) inputX += 1;

  if (inputX !== 0 && inputZ !== 0) {
    inputX *= Math.SQRT1_2;
    inputZ *= Math.SQRT1_2;
  }

  const camDir   = new THREE.Vector3(Math.sin(camYaw), 0, Math.cos(camYaw));
  const camRight = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), camDir).normalize();
  const moveDir  = new THREE.Vector3();
  moveDir.addScaledVector(camDir, inputZ);
  moveDir.addScaledVector(camRight, inputX);
  if (moveDir.lengthSq() > 0) moveDir.normalize();

  const currentVel = playerBody.linvel();
  const velChange  = new RAPIER.Vector3(
    moveDir.x * moveSpeed - currentVel.x,
    0,
    moveDir.z * moveSpeed - currentVel.z
  );
  const mass = playerBody.mass();
  playerBody.applyImpulse({ x: velChange.x * mass, y: 0, z: velChange.z * mass }, true);

  const spaceDown = !!keys["Space"];
  if (spaceDown && !spaceWasDown && canJump) {
    canJump = false;
    jumpCooldown = 0.2;
    const jumpDir = world.gravity.y < 0 ? 1 : -1;
    playerBody.applyImpulse({ x: 0, y: jumpForce * mass * jumpDir, z: 0 }, true);
  }
  spaceWasDown = spaceDown;

  if (keys['KeyG'] && deltaCMoon > 1) {
    deltaCMoon = 0;
    world.gravity.y *= -1;
    playAudio(0);
  }

  const distance = 10;
  const height   = 4;
  const offset   = new THREE.Vector3(
    distance * Math.sin(camYaw) * Math.cos(camPitch),
    distance * Math.sin(camPitch) + height,
    distance * Math.cos(camYaw) * Math.cos(camPitch)
  );

  const direction   = offset.clone().normalize();
  const rayDistance = offset.length();
  raycaster.set(playerMesh.position, direction);
  const intersects = raycaster.intersectObjects(scene.children, true);

  let finalDistance = rayDistance;
  for (const hit of intersects) {
    if (hit.object === playerMesh) continue;
    if (hit.distance < finalDistance) {
      finalDistance = Math.max(1.5, hit.distance - cameraCollisionRadius);
      break;
    }
  }

  camera.position.lerp(
    playerMesh.position.clone().addScaledVector(direction, finalDistance),
    cameraLerp
  );
  camera.lookAt(playerMesh.position);

  ui.innerHTML = `X: ${pos.x.toFixed(1)} Y: ${pos.y.toFixed(1)} Z: ${pos.z.toFixed(1)}`;
  renderer.render(scene, camera);
}

renderer.setAnimationLoop(animate);

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});