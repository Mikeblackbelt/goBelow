import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import RAPIER from "@dimforge/rapier3d-compat";

await RAPIER.init();

const gravity = { x: 0.0, y: -9.81, z: 0.0 };
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

const camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
);
camera.position.set(5, 5, 5);
camera.lookAt(0, 0, 0);

// Optional orbit controls for debugging
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

// Lights
scene.add(new THREE.HemisphereLight(0xffeeb1, 0x080820, 0.9));

const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
dirLight.position.set(5, 10, 7);
scene.add(dirLight);


const groundMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(200, 200),
    new THREE.MeshStandardMaterial({ color: 0xff4f44 })
);
groundMesh.rotation.x = -Math.PI / 2;
scene.add(groundMesh);

// Rapier ground collider
const groundBodyDesc = RAPIER.RigidBodyDesc.fixed();
const groundBody = world.createRigidBody(groundBodyDesc);

const groundColliderDesc = RAPIER.ColliderDesc.cuboid(100, 0.1, 100);
world.createCollider(groundColliderDesc, groundBody);


const playerMesh = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ color: 0x00ff00 })
);
scene.add(playerMesh);

const playerBodyDesc = RAPIER.RigidBodyDesc.dynamic()
    .setTranslation(0, 5, 0)
    .lockRotations(); // prevent tipping over

const playerBody = world.createRigidBody(playerBodyDesc);

const playerColliderDesc = RAPIER.ColliderDesc.cuboid(0.5, 0.5, 0.5)
    .setFriction(1.0);

world.createCollider(playerColliderDesc, playerBody);

const keys = {};
window.addEventListener("keydown", (e) => (keys[e.code] = true));
window.addEventListener("keyup", (e) => (keys[e.code] = false));


const moveSpeed = 5;
const jumpForce = 8;
let canJump = false;

const clock = new THREE.Clock();

function animate() {
    const delta = clock.getDelta();

    world.step();

    const position = playerBody.translation();
    playerMesh.position.set(position.x, position.y, position.z);

    let playerVelocity = playerBody.velocityAtPoint( {x: 0, y:0, z:0}, true)
    /*if (playerBody.velocity().y === 0) {
        canJump = true;
    } else {
        canJump = false;
    }*/
   console.log(playerVelocity)

    const velocity = playerBody.linvel();
    let newVelX = 0;
    let newVelZ = 0;

    if (keys["KeyW"]) newVelZ -= moveSpeed;
    if (keys["KeyS"]) newVelZ += moveSpeed;
    if (keys["KeyA"]) newVelX -= moveSpeed;
    if (keys["KeyD"]) newVelX += moveSpeed;

    playerBody.setLinvel(
        { x: newVelX, y: velocity.y, z: newVelZ },
        true
    );

    if (keys[" "] && canJump) {
        playerBody.applyImpulse({ x: 0, y: jumpForce, z: 0 }, true);
    }

    controls.update();
    renderer.render(scene, camera);
}

renderer.setAnimationLoop(animate);

window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});