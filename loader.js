
import * as THREE from "three";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { MTLLoader } from "three/examples/jsm/loaders/MTLLoader.js";

export function loadModel(pathMtl, pathObj) {
  return new Promise((resolve, reject) => {
    const mtlLoader = new MTLLoader();

    mtlLoader.load(
      pathMtl,
      (materials) => {
        materials.preload();

        const objLoader = new OBJLoader();
        objLoader.setMaterials(materials);

        objLoader.load(
          pathObj,
          (object) => {
            resolve(object); // YIPPEE !!!
          },
          undefined,
          (error) => {
            reject(error); // OBJ loading failed
          }
        );
      },
      undefined,
      (error) => {
        reject(error); // MTL loading failed
      }
    );
  });
}