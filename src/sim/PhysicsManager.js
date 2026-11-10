import * as THREE from 'three';
import { CONFIG } from '../config.js';

/**
 * Moteur physique et gestionnaire de collisions pour HUMA-LOG :
 * Gère la dynamique de chute des colis en cas de perte de vide,
 * la détection de contact ventouse/carton et la détection d'interférences avec l'allée.
 */
export class PhysicsManager {
  constructor(scene) {
    this.scene = scene;
    this.fallingBoxes = []; // Colis en chute libre
    this.gravity = 9.81; // m/s²
  }

  /**
   * Enregistre un colis qui vient de se détacher en l'air (perte de vide)
   */
  registerFallingBox(boxData) {
    const worldPos = new THREE.Vector3();
    boxData.mesh.getWorldPosition(worldPos);

    this.fallingBoxes.push({
      boxData: boxData,
      mesh: boxData.mesh,
      position: worldPos.clone(),
      velocity: new THREE.Vector3(0, -0.2, 0),
      mass: boxData.mass,
      isLanded: false
    });
  }

  /**
   * Mise à jour de la physique des corps libres
   */
  update(dt, speedScale = 1.0) {
    const effectiveDt = dt * speedScale;

    // Simulation de chute parabolique pour les colis tombés
    for (let i = this.fallingBoxes.length - 1; i >= 0; i--) {
      const fb = this.fallingBoxes[i];
      if (fb.isLanded) continue;

      // Intégration Euler : v = v + g * dt, y = y + v * dt
      fb.velocity.y -= this.gravity * effectiveDt;
      fb.position.y += fb.velocity.y * effectiveDt;
      fb.position.x += fb.velocity.x * effectiveDt;
      fb.position.z += fb.velocity.z * effectiveDt;

      // Contact avec le sol (Y = hauteur_colis / 2)
      const floorY = CONFIG.boxes.heightM / 2;
      if (fb.position.y <= floorY) {
        fb.position.y = floorY;
        // Rebond élastique amorti
        if (Math.abs(fb.velocity.y) > 0.4) {
          fb.velocity.y = -fb.velocity.y * 0.25;
        } else {
          fb.velocity.set(0, 0, 0);
          fb.isLanded = true;
        }
      }

      fb.mesh.position.copy(fb.position);
      // Légère rotation de culbute
      fb.mesh.rotation.z += 0.05;
    }
  }

  /**
   * Vérifie la tolérance de précision de dépose (en millimètres)
   */
  checkPlacementAccuracy(actualPos, targetPos) {
    const errorM = actualPos.distanceTo(targetPos);
    const errorMM = errorM * 1000.0;
    return {
      errorMM: errorMM,
      isAccurate: errorMM <= 5.0 // Tolérance ± 5 mm
    };
  }

  reset() {
    this.fallingBoxes = [];
  }
}

