import * as THREE from 'three';
import { CONFIG } from '../config.js';

/**
 * Axe vertical Z (Torse télescopique)
 * Profilés aluminium 2040 V-Slot, vis trapézoïdale T8 en acier inoxydable,
 * moteur pas à pas NEMA 17, rampe d'accélération trapézoïdale.
 */
export class ZAxisTorso {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'ZAxisTorso';

    // Paramètres cinématiques et mécaniques
    this.strokeM = CONFIG.zAxis.strokeM; // 0.40 m
    this.minHeightM = CONFIG.zAxis.carriageHeightMinM; // 0.35 m
    this.maxHeightM = CONFIG.zAxis.carriageHeightMaxM; // 0.75 m

    this.currentHeightM = this.minHeightM;
    this.targetHeightM = this.minHeightM;
    this.currentSpeedMs = 0.0;
    this.configuredSpeedMs = CONFIG.zAxis.defaultSpeedMs; // 0.06 m/s
    this.accelMs2 = CONFIG.zAxis.accelMs2; // 0.15 m/s²

    this.initStructure();
  }

  initStructure() {
    // Matériau profilé aluminium anodisé naturel 2040
    const aluMat = new THREE.MeshStandardMaterial({
      color: 0x94a3b8,
      metalness: 0.85,
      roughness: 0.25
    });

    // Deux colonnes verticales en profilés 2040 (largeur 40mm x épaisseur 20mm, hauteur 0.85m)
    const columnHeight = 0.85;
    const colGeo = new THREE.BoxGeometry(0.04, columnHeight, 0.02);

    const leftCol = new THREE.Mesh(colGeo, aluMat);
    leftCol.position.set(-0.14, columnHeight / 2, 0);
    leftCol.castShadow = true;
    this.group.add(leftCol);

    const rightCol = new THREE.Mesh(colGeo, aluMat);
    rightCol.position.set(0.14, columnHeight / 2, 0);
    rightCol.castShadow = true;
    this.group.add(rightCol);

    // Plaques de liaison haute et basse en aluminium usiné
    const plateMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.8, roughness: 0.3 });
    const topPlateGeo = new THREE.BoxGeometry(0.34, 0.015, 0.10);
    const topPlate = new THREE.Mesh(topPlateGeo, plateMat);
    topPlate.position.set(0, columnHeight + 0.0075, 0);
    this.group.add(topPlate);

    const basePlateGeo = new THREE.BoxGeometry(0.34, 0.015, 0.12);
    const basePlate = new THREE.Mesh(basePlateGeo, plateMat);
    basePlate.position.set(0, 0.0075, 0);
    this.group.add(basePlate);

    // Moteur pas à pas NEMA 17 à la base
    const nemaMat = new THREE.MeshStandardMaterial({ color: 0x111827, metalness: 0.7, roughness: 0.3 });
    const nemaGeo = new THREE.BoxGeometry(0.042, 0.048, 0.042);
    const nema = new THREE.Mesh(nemaGeo, nemaMat);
    nema.position.set(0, 0.04, 0);
    this.group.add(nema);

    // Accouplement flexible en aluminium
    const couplerGeo = new THREE.CylinderGeometry(0.01, 0.01, 0.025, 16);
    const couplerMat = new THREE.MeshStandardMaterial({ color: 0xd1d5db, metalness: 0.9, roughness: 0.1 });
    const coupler = new THREE.Mesh(couplerGeo, couplerMat);
    coupler.position.set(0, 0.075, 0);
    this.group.add(coupler);

    // Vis trapézoïdale T8 en acier inoxydable (Ø8 mm, pas 8 mm)
    const screwGeo = new THREE.CylinderGeometry(0.004, 0.004, columnHeight - 0.1, 16);
    const screwMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.95, roughness: 0.15 });
    this.leadScrew = new THREE.Mesh(screwGeo, screwMat);
    this.leadScrew.position.set(0, columnHeight / 2 + 0.04, 0);
    this.group.add(this.leadScrew);

    // CHARIOT MOBILE (Carriage) glissant sur galets V-Slot
    this.carriage = new THREE.Group();
    this.carriage.name = 'TorsoCarriage';
    this.carriage.position.set(0, this.currentHeightM, 0);

    // Platine porte-bras centrale en aluminium CNC
    const carriagePlateGeo = new THREE.BoxGeometry(0.36, 0.10, 0.08);
    const carriageMat = new THREE.MeshStandardMaterial({
      color: 0x0284c7, // Bleu anodisé HUMA-LOG
      metalness: 0.7,
      roughness: 0.3
    });
    const carriageMesh = new THREE.Mesh(carriagePlateGeo, carriageMat);
    carriageMesh.castShadow = true;
    this.carriage.add(carriageMesh);

    // Écrou trapézoïdal T8 en laiton anti-backlash
    const nutGeo = new THREE.CylinderGeometry(0.011, 0.011, 0.02, 16);
    const nutMat = new THREE.MeshStandardMaterial({ color: 0xd97706, metalness: 0.9, roughness: 0.2 });
    const nut = new THREE.Mesh(nutGeo, nutMat);
    nut.position.set(0, 0, 0);
    this.carriage.add(nut);

    // Galets V-Wheels en Delrin noir (4 galets guidés dans les rainures)
    const wheelGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.008, 16);
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.6 });
    const wheelOffsets = [
      [-0.14, 0.035, 0.02],
      [-0.14, -0.035, 0.02],
      [ 0.14, 0.035, 0.02],
      [ 0.14, -0.035, 0.02]
    ];
    wheelOffsets.forEach(pos => {
      const w = new THREE.Mesh(wheelGeo, wheelMat);
      w.rotation.x = Math.PI / 2;
      w.position.set(pos[0], pos[1], pos[2]);
      this.carriage.add(w);
    });

    // Emplacements de montage des deux bras (Gauche et Droit)
    this.leftArmMount = new THREE.Object3D();
    this.leftArmMount.position.set(-0.16, 0, 0.04);
    this.carriage.add(this.leftArmMount);

    this.rightArmMount = new THREE.Object3D();
    this.rightArmMount.position.set(0.16, 0, 0.04);
    this.carriage.add(this.rightArmMount);

    this.group.add(this.carriage);
  }

  /**
   * Commande une hauteur cible pour le torse
   */
  setTargetHeight(targetH) {
    this.targetHeightM = THREE.MathUtils.clamp(targetH, this.minHeightM, this.maxHeightM);
  }

  isTargetReached(toleranceM = 0.003) {
    return Math.abs(this.currentHeightM - this.targetHeightM) <= toleranceM;
  }

  /**
   * Ajuste la vitesse de déplacement verticale
   */
  setSpeed(speedMs) {
    this.configuredSpeedMs = THREE.MathUtils.clamp(speedMs, CONFIG.zAxis.minSpeedMs, CONFIG.zAxis.maxSpeedMs);
  }

  /**
   * Mise à jour cinématique avec rampe d'accélération
   */
  update(dt, speedScale = 1.0) {
    const effectiveDt = dt * speedScale;
    const error = this.targetHeightM - this.currentHeightM;

    if (Math.abs(error) > 0.001) {
      // Profil de vitesse avec décélération d'arrêt
      const targetSpeed = Math.sign(error) * this.configuredSpeedMs;
      const speedStep = this.accelMs2 * effectiveDt;

      if (this.currentSpeedMs < targetSpeed) {
        this.currentSpeedMs = Math.min(targetSpeed, this.currentSpeedMs + speedStep);
      } else {
        this.currentSpeedMs = Math.max(targetSpeed, this.currentSpeedMs - speedStep);
      }

      // Distance parcourue
      let deltaH = this.currentSpeedMs * effectiveDt;
      if (Math.abs(deltaH) > Math.abs(error)) {
        deltaH = error;
        this.currentSpeedMs = 0;
      }

      this.currentHeightM += deltaH;
      this.currentHeightM = THREE.MathUtils.clamp(this.currentHeightM, this.minHeightM, this.maxHeightM);

      // Rotation de la vis mère T8
      const leadM = 0.008; // Pas de 8 mm par tour
      const rotAngle = (deltaH / leadM) * (2 * Math.PI);
      if (this.leadScrew) {
        this.leadScrew.rotation.y += rotAngle;
      }
    } else {
      this.currentSpeedMs = 0;
      this.currentHeightM = this.targetHeightM;
    }

    // Mise à jour de la position 3D du chariot
    this.carriage.position.y = this.currentHeightM;
  }

  getMechanicalPowerW(payloadMassKg = 0) {
    const totalMass = CONFIG.zAxis.carriageMassKg + payloadMassKg;
    const isMoving = Math.abs(this.currentSpeedMs) > 0.001;
    if (!isMoving) {
      return CONFIG.power.zAxisHoldingW; // ~5W maintien couple
    }
    // Puissance mécanique P = m * (g + a) * v / rendement
    const mechPower = (totalMass * 9.81 * Math.abs(this.currentSpeedMs)) / CONFIG.zAxis.efficiency;
    return CONFIG.power.zAxisHoldingW + mechPower;
  }
}

