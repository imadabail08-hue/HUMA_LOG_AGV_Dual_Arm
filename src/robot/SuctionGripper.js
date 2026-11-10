import * as THREE from 'three';
import { CONFIG } from '../config.js';

/**
 * Préhenseur par le dessus avec ventouse à vide et électrovanne de lâcher
 * Modélise la dépression d'air (-45 kPa cible), seuil d'accroche (-35 kPa),
 * temps de montée progressive et force de maintien physique F = P * A.
 */
export class SuctionGripper {
  constructor(armId = 'left') {
    this.armId = armId;
    this.group = new THREE.Group();
    this.group.name = `SuctionGripper_${armId}`;

    // Paramètres physiques
    this.targetPressureKPa = CONFIG.suction.targetPressureKPa;     // -45 kPa
    this.thresholdPressureKPa = CONFIG.suction.thresholdPressureKPa; // -35 kPa
    this.dropPressureKPa = CONFIG.suction.dropPressureKPa;           // -20 kPa
    this.cupDiameterM = CONFIG.suction.cupDiameterM;                 // 0.035 m
    this.cupAreaM2 = Math.PI * Math.pow(this.cupDiameterM / 2, 2);   // ~9.62e-4 m²

    // État dynamique du système de vide
    this.currentPressureKPa = 0.0; // 0 = pression atmosphérique (pas de vide)
    this.isPumpOn = false;
    this.isBlowOffValveOpen = false;
    this.hasGrasp = false;
    this.attachedBox = null;
    this.airLeakageRate = 0.0; // En cas de défaut injecté

    this.initVisualMesh();
  }

  initVisualMesh() {
    // Corps porte-ventouse en aluminium
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      metalness: 0.8,
      roughness: 0.2
    });

    const bodyGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.035, 16);
    const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
    bodyMesh.position.y = -0.0175;
    this.group.add(bodyMesh);

    // Mini-électrovanne de rupture de vide (bleue)
    const valveGeo = new THREE.BoxGeometry(0.016, 0.02, 0.016);
    const valveMat = new THREE.MeshStandardMaterial({ color: 0x0284c7 });
    const valve = new THREE.Mesh(valveGeo, valveMat);
    valve.position.set(0.015, -0.015, 0);
    this.group.add(valve);

    // Tube pneumatique flexible (polyuréthane bleu translucide)
    const tubeGeo = new THREE.CylinderGeometry(0.003, 0.003, 0.05, 8);
    const tubeMat = new THREE.MeshBasicMaterial({ color: 0x00d2ff });
    const tube = new THREE.Mesh(tubeGeo, tubeMat);
    tube.position.set(0.015, 0.01, 0);
    this.group.add(tube);

    // Soufflet ventouse en élastomère souple (silicone noir/orange)
    const cupMat = new THREE.MeshStandardMaterial({
      color: 0x111111,
      roughness: 0.9,
      metalness: 0.1
    });

    // Profil soufflet à 1.5 spires
    const cupTopGeo = new THREE.CylinderGeometry(0.012, 0.018, 0.012, 16);
    const cupTop = new THREE.Mesh(cupTopGeo, cupMat);
    cupTop.position.y = -0.038;
    this.group.add(cupTop);

    const cupBellowGeo = new THREE.CylinderGeometry(0.018, 0.02, 0.012, 16);
    const cupBellow = new THREE.Mesh(cupBellowGeo, cupMat);
    cupBellow.position.y = -0.046;
    this.group.add(cupBellow);

    // Lèvre inférieure ventouse (surface de contact Ø35 mm)
    const lipGeo = new THREE.CylinderGeometry(0.0175, 0.0175, 0.004, 16);
    const lipMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.95 });
    this.lipMesh = new THREE.Mesh(lipGeo, lipMat);
    this.lipMesh.position.y = -0.052;
    this.group.add(this.lipMesh);

    // Point d'accroche physique exact (tip de succion)
    this.tipAnchor = new THREE.Object3D();
    this.tipAnchor.position.y = -0.054;
    this.group.add(this.tipAnchor);
  }

  /**
   * Active la mini-pompe à vide 12V
   */
  startPump() {
    this.isPumpOn = true;
    this.isBlowOffValveOpen = false;
  }

  /**
   * Arrête la pompe et ouvre l'électrovanne de décharge pour libérer immédiatement le colis
   */
  release() {
    this.isPumpOn = false;
    this.isBlowOffValveOpen = true;
    this.detachBox();
  }

  /**
   * Injection d'une fuite de vide
   */
  setLeakage(active) {
    this.airLeakageRate = active ? 60.0 : 0.0; // Perte rapide de vide
  }

  /**
   * Calcule la force de succion maximale théorique F = |P| * A (en Newtons)
   */
  getHoldingForceN() {
    const deltaP_Pa = Math.abs(this.currentPressureKPa) * 1000.0;
    return deltaP_Pa * this.cupAreaM2;
  }

  /**
   * Attache un colis sous la ventouse si les conditions géométriques et physiques sont réunies
   */
  tryAttachBox(boxData) {
    if (!this.isPumpOn || this.hasGrasp) return false;

    // Vérifie que le vide a atteint le seuil d'accroche (-35 kPa)
    if (this.currentPressureKPa > this.thresholdPressureKPa) {
      return false; // Vide insuffisant
    }

    // Vérifie que la force de maintien surpasse le poids du colis (avec marge de sécurité)
    const boxWeightN = boxData.mass * 9.81;
    const holdingForceN = this.getHoldingForceN();

    if (holdingForceN < boxWeightN) {
      return false; // Colis trop lourd pour le niveau de vide actuel
    }

    this.hasGrasp = true;
    this.attachedBox = boxData;

    // Raccrocher le mesh du colis au repère de l'effecteur (pour suivi parfait du bras)
    // On compense le décalage pour que la face supérieure du colis soit plaquée contre la lèvre
    this.tipAnchor.add(boxData.mesh);
    boxData.mesh.position.set(0, -CONFIG.boxes.heightM / 2, 0);
    boxData.mesh.rotation.set(0, 0, 0);

    return true;
  }

  /**
   * Détache le carton
   */
  detachBox() {
    if (this.attachedBox) {
      const box = this.attachedBox;
      // Convertir la position mondiale du colis
      const worldPos = new THREE.Vector3();
      const worldQuat = new THREE.Quaternion();
      box.mesh.getWorldPosition(worldPos);
      box.mesh.getWorldQuaternion(worldQuat);

      // Détacher de la ventouse et remettre dans la scène
      let root = this.group;
      while (root.parent) {
        root = root.parent;
      }
      root.add(box.mesh);
      box.mesh.position.copy(worldPos);
      box.mesh.quaternion.copy(worldQuat);

      this.attachedBox = null;
      this.hasGrasp = false;
      return box;
    }
    this.hasGrasp = false;
    return null;
  }

  /**
   * Mise à jour temporelle de la dynamique de pression d'air (dP/dt)
   */
  update(dt, speedScale = 1.0) {
    const effectiveDt = dt * speedScale;

    if (this.isBlowOffValveOpen) {
      // Décharge rapide à la pression atmosphérique
      const ventRate = Math.abs(CONFIG.suction.targetPressureKPa) / CONFIG.suction.blowOffTimeS;
      this.currentPressureKPa = Math.min(0.0, this.currentPressureKPa + ventRate * effectiveDt);
      if (this.currentPressureKPa >= -1.0) {
        this.currentPressureKPa = 0.0;
        this.isBlowOffValveOpen = false;
      }
    } else if (this.isPumpOn) {
      // Établissement progressif du vide vers la cible
      const effectiveTarget = this.targetPressureKPa + this.airLeakageRate;
      const tau = CONFIG.suction.pressureRiseTimeS;
      const dP = (effectiveTarget - this.currentPressureKPa) * (effectiveDt / tau);
      this.currentPressureKPa += dP;
      this.currentPressureKPa = Math.max(CONFIG.suction.targetPressureKPa, Math.min(0.0, this.currentPressureKPa));
    } else {
      // Fuite naturelle lente
      this.currentPressureKPa = Math.min(0.0, this.currentPressureKPa + 15.0 * effectiveDt);
    }

    // Détection de perte de vide en cours de transport (ex: fuite ou panne)
    if (this.hasGrasp && this.currentPressureKPa > this.dropPressureKPa) {
      // Décrochage involontaire du colis !
      const droppedBox = this.detachBox();
      if (droppedBox) {
        droppedBox.dropped = true;
      }
    }

    // Rétroaction visuelle : lèvre orange devient verte sous vide
    if (this.lipMesh) {
      if (this.hasGrasp) {
        this.lipMesh.material.color.setHex(0x00e676);
      } else if (this.currentPressureKPa < this.thresholdPressureKPa) {
        this.lipMesh.material.color.setHex(0x38bdf8);
      } else {
        this.lipMesh.material.color.setHex(0xf59e0b);
      }
    }
  }

  getTipWorldPosition() {
    const pos = new THREE.Vector3();
    this.tipAnchor.getWorldPosition(pos);
    return pos;
  }
}

