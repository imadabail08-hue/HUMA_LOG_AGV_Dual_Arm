import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

/**
 * Gestionnaire des caméras virtuelles :
 * 4 Vues prédéfinies :
 *  1. Vue Globale (Isométrique atelier d'usine)
 *  2. Suivi Robot (Caméra poursuite fluide 3ème personne)
 *  3. Caméra Embarquée (Vue 1ère personne depuis le mât AGV)
 *  4. Vue du dessus 2D (Top-down minimap avec grille et trajectoires)
 */
export class CameraManager {
  constructor(camera, domElement, robot) {
    this.camera = camera;
    this.domElement = domElement;
    this.robot = robot;

    // OrbitControls pour manipulation libre à la souris
    this.controls = new OrbitControls(this.camera, this.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.02; // Empêcher de passer sous le sol
    this.controls.minDistance = 0.5;
    this.controls.maxDistance = 25.0;

    this.currentMode = 'global'; // 'global', 'follow', 'onboard', 'top'

    // Configuration des caméras
    this.presets = {
      global: {
        pos: new THREE.Vector3(0, 8.5, 9.5),
        target: new THREE.Vector3(0, 0.5, 0)
      },
      top: {
        pos: new THREE.Vector3(0, 14.0, 0.01),
        target: new THREE.Vector3(0, 0, 0)
      }
    };

    this.setMode('global');
  }

  setMode(mode) {
    this.currentMode = mode;

    if (mode === 'global') {
      this.controls.enabled = true;
      this.controls.target.copy(this.presets.global.target);
      this.camera.position.copy(this.presets.global.pos);
    } else if (mode === 'top') {
      this.controls.enabled = true;
      this.controls.target.copy(this.presets.top.target);
      this.camera.position.copy(this.presets.top.pos);
    } else if (mode === 'follow') {
      this.controls.enabled = false;
    } else if (mode === 'onboard') {
      this.controls.enabled = false;
    }
  }

  update() {
    if (this.currentMode === 'global' || this.currentMode === 'top') {
      this.controls.update();
    } else if (this.currentMode === 'follow') {
      // Caméra poursuite 3ème personne derrière l'AGV
      const distBehind = 2.2;
      const heightAbove = 1.35;
      const h = this.robot.heading;

      // Position cible de la caméra
      const camTargetX = this.robot.position.x - Math.cos(h) * distBehind;
      const camTargetZ = this.robot.position.z - Math.sin(h) * distBehind;
      const camTargetY = heightAbove;

      // Amortissement doux (smooth lerp)
      this.camera.position.lerp(new THREE.Vector3(camTargetX, camTargetY, camTargetZ), 0.12);
      this.camera.lookAt(
        this.robot.position.x + Math.cos(h) * 0.8,
        0.5,
        this.robot.position.z + Math.sin(h) * 0.8
      );
    } else if (this.currentMode === 'onboard') {
      // Caméra 1ère personne embarquée sur le mât du robot
      const h = this.robot.heading;
      const eyeX = this.robot.position.x + Math.cos(h) * 0.15;
      const eyeZ = this.robot.position.z + Math.sin(h) * 0.15;
      const eyeY = 0.44; // Hauteur de l'objectif caméra

      this.camera.position.set(eyeX, eyeY, eyeZ);

      // Regarde vers l'avant dans la direction du cap
      const lookDist = 3.0;
      this.camera.lookAt(
        eyeX + Math.cos(h) * lookDist,
        eyeY - 0.08,
        eyeZ + Math.sin(h) * lookDist
      );
    }
  }
}

