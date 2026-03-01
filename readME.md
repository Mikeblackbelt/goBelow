# GO BELOW

A 3D browser-based zombie wave survival game built with **Three.js** and **Rapier** physics. Fight off escalating waves of undead across a city map using movement, gravity manipulation, and unlockable abilities. All enemies use context-aware steering with raycasting to navigate around obstacles, and will jump automatically if they get stuck.

---

##  How to Play

Find the **yellow beam** and touch it to begin. Survive each wave of enemies to progress. Every 5 seconds after clearing a wave, the next one begins automatically.

### Controls

| Key | Action |
|-----|--------|
| `W A S D` | Move |
| `Space` | Jump |
| `Left Click` (drag) | Rotate camera |
| `Left Click` (tap) | Stab with spear |
| `G` | Flip gravity (1s cooldown) |
| `H` | Burrow — 2s invincibility (6s cooldown) |
| `F` | Freeze all enemies - and time itself for 4s — unlocks wave 6 (20s cooldown) |
| `E` | Explosion AOE — unlocks wave 15 (25s cooldown) |

---


## Abilities

### Burrow `H`
Sink into the ground for **2 seconds**, becoming completely invincible. Cannot be used mid-air. 6 second cooldown.

### Freeze `F` *(unlocks wave 6)*
Instantly stops all enemy movement for **4 seconds**, zeroing their velocity. A blue desaturation shader washes over the screen while active. 20 second cooldown.

### Explosion `E` *(unlocks wave 15)*
Detonates a large AOE blast centred on your position, dealing heavy damage to all enemies within range. A fire sphere expands outward visually on use. 25 second cooldown.

### Gravity Flip `G`
Flips the direction of gravity for the entire world — enemies are launched into the air faster than the player. 1 second cooldown between flips.

---

## Tech Stack

- **Three.js** — 3D rendering, scene management, shader materials
- **Rapier3D** (WASM) — rigid body physics, CCD collision, ray/shape casting
- **Vite** 


##  Dev Console

Open the browser console and use:

```js
skipToWave(6)   // jump directly to any wave
```

This cleanly destroys all current enemies and starts the target wave fresh.

---

## Running Locally

This project uses ES modules and loads WASM — it must be served over HTTP, not opened as a file.

```bash
npm i
npx vite 
```

Then open `http://localhost:5173`.

This project will be run on itch.io
