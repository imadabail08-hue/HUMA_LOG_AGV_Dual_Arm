import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { SuctionGripper } from './SuctionGripper.js';

/**
 * Bras robotisé 5-DDL articulé par servomoteurs intelligents STS3215
 * Cinématique directe et inverse (IK) avec contrainte de prise par le dessus,
 * limites articulaires mécaniques et télémétrie des couples/températures.
 */
export class Arm5DOF {
  constructor(side = 'left') {
    this.side = side; // 'left' ou 'right'
    this.group = new THREE.Group();
    this.group.name = `Arm5DOF_${side}`;

    // Longueurs des segments (mètres)
    this.L1 = CONFIG.arms.link1LengthM; // 0.18 m (bras)
    this.L2 = CONFIG.arms.link2LengthM; // 0.17 m (avant-bras)
    this.L3 = CONFIG.arms.link3LengthM; // 0.06 m (poignet vers buse)

    // Angles articulaires actuels et cibles (radians)
    this.jointAngles = [0, 0.5, -1.0, -0.5, 0];
    this.targetAngles = [0, 0.5, -1.0, -0.5, 0];

    // Limites articulaires [min, max] en radians
    this.jointLimits = [
      [-THREE.MathUtils.degToRad(120), THREE.MathUtils.degToRad(120)], // Q1: Base Yaw
      [-THREE.MathUtils.degToRad(35),  THREE.MathUtils.degToRad(110)], // Q2: Épaule Pitch
      [-THREE.MathUtils.degToRad(140), THREE.MathUtils.degToRad(15)],  // Q3: Coude Pitch
      [-THREE.MathUtils.degToRad(100), THREE.MathUtils.degToRad(100)], // Q4: Poignet Pitch
      [-THREE.MathUtils.degToRad(180), THREE.MathUtils.degToRad(180)]  // Q5: Poignet Roll
    ];

    // Préhenseur à ventouse monté sur l'effecteur
    this.gripper = new SuctionGripper(side);

    this.initArticulatedMesh();
    this.setRestPose();
  }

  initArticulatedMesh() {
    // Matériaux réalistes : servomoteurs STS3215 boîtier alu CNC anodisé noir
    const servoMat = new THREE.MeshStandardMaterial({
      color: 0x18181b,
      metalness: 0.85,
      roughness: 0.25
    });

    // Étriers en U et pièces de structure en aluminium aéronautique 6061 anodisé
    const bracketMat = new THREE.MeshStandardMaterial({
      color: this.side === 'left' ? 0x0284c7 : 0x0369a1, // Nuance bleue HUMA-LOG
      metalness: 0.7,
      roughness: 0.35
    });

    const hornMat = new THREE.MeshStandardMaterial({
      color: 0xd97706, // Palonnier laiton / or STS3215
      metalness: 0.9,
      roughness: 0.2
    });

    // Helper pour créer un servomoteur STS3215 réaliste
    const createServoMesh = () => {
      const g = new THREE.Group();
      // Boîtier 40.5 x 20 x 40 mm
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.040, 0.040, 0.020), servoMat);
      g.add(body);
      // Palonnier cannelé
      const horn = new THREE.Mesh(new THREE.CylinderGeometry(0.010, 0.010, 0.006, 16), hornMat);
      horn.rotation.x = Math.PI / 2;
      horn.position.set(0, 0.012, 0.013);
      g.add(horn);
      return g;
    };

    // --- ARTICULATION 1 : BASE YAW (Axe Y) ---
    this.joint1 = new THREE.Group();
    this.joint1.name = 'Joint1_BaseYaw';
    const baseMount = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.025, 20), bracketMat);
    this.joint1.add(baseMount);
    const servo1 = createServoMesh();
    servo1.position.y = 0.025;
    this.joint1.add(servo1);
    this.group.add(this.joint1);

    // --- ARTICULATION 2 : ÉPAULE PITCH (Axe Z) ---
    this.joint2 = new THREE.Group();
    this.joint2.name = 'Joint2_ShoulderPitch';
    this.joint2.position.set(0, 0.05, 0);

    const shoulderBracket = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.05, 0.04), bracketMat);
    shoulderBracket.position.set(0, 0.025, 0);
    this.joint2.add(shoulderBracket);

    const servo2 = createServoMesh();
    servo2.rotation.z = Math.PI / 2;
    servo2.position.set(0, 0.025, 0);
    this.joint2.add(servo2);

    // Segment 1 (Bras L1 = 0.18 m)
    const link1Geo = new THREE.BoxGeometry(0.028, this.L1, 0.028);
    const link1Mesh = new THREE.Mesh(link1Geo, bracketMat);
    link1Mesh.position.set(0, this.L1 / 2, 0);
    link1Mesh.castShadow = true;
    this.joint2.add(link1Mesh);

    this.joint1.add(this.joint2);

    // --- ARTICULATION 3 : COUDE PITCH (Axe Z) ---
    this.joint3 = new THREE.Group();
    this.joint3.name = 'Joint3_ElbowPitch';
    this.joint3.position.set(0, this.L1, 0);

    const servo3 = createServoMesh();
    servo3.rotation.z = Math.PI / 2;
    this.joint3.add(servo3);

    // Segment 2 (Avant-bras L2 = 0.17 m)
    const link2Geo = new THREE.BoxGeometry(0.024, this.L2, 0.024);
    const link2Mesh = new THREE.Mesh(link2Geo, bracketMat);
    link2Mesh.position.set(0, this.L2 / 2, 0);
    link2Mesh.castShadow = true;
    this.joint3.add(link2Mesh);

    this.joint2.add(this.joint3);

    // --- ARTICULATION 4 : POIGNET PITCH (Axe Z) ---
    this.joint4 = new THREE.Group();
    this.joint4.name = 'Joint4_WristPitch';
    this.joint4.position.set(0, this.L2, 0);

    const servo4 = createServoMesh();
    servo4.rotation.z = Math.PI / 2;
    this.joint4.add(servo4);

    this.joint3.add(this.joint4);

    // --- ARTICULATION 5 : POIGNET ROLL (Axe Y) ---
    this.joint5 = new THREE.Group();
    this.joint5.name = 'Joint5_WristRoll';
    this.joint5.position.set(0, 0.035, 0);

    const servo5 = createServoMesh();
    this.joint5.add(servo5);

    // Montage du préhenseur à ventouse sur l'effecteur final
    this.gripper.group.position.set(0, 0, 0);
    this.joint5.add(this.gripper.group);

    this.joint4.add(this.joint5);

    // Référence aux noeuds articulaires pour mise à jour rapide
    this.jointNodes = [this.joint1, this.joint2, this.joint3, this.joint4, this.joint5];
  }

  /**
   * Poses prédéfinies
   */
  setRestPose() {
    // Position de repos repliée compacte pour le roulage
    this.targetAngles = [
      this.side === 'left' ? 0.3 : -0.3,
      0.9,
      -1.9,
      -0.6,
      0
    ];
  }

  setCarryPose() {
    // Position de transport sécurisée du carton (haute pour éviter les collisions)
    this.targetAngles = [
      this.side === 'left' ? 0.1 : -0.1,
      0.65,
      -1.2,
      -0.95,
      0
    ];
  }

  /**
   * Résolution analytique de cinématique inverse (IK) pour prise par le dessus
   * Le point cible targetPos est donné dans le repère local de la base du bras.
   */
  solveIK(targetPos, pitchAngle = -Math.PI / 2) {
    const x = targetPos.x;
    const y = targetPos.y;
    const z = targetPos.z;

    // 1. Azimuth / Base Yaw Q1
    const q1 = Math.atan2(z, x);

    // Distance horizontale dans le plan du bras
    const r = Math.hypot(x, z);

    // Position cible du poignet (Wrist Center) en retirant l'effecteur orienté vers le bas
    // Le poignet vers la ventouse a une longueur de L3 orientée à pitchAngle
    const wristR = r - this.L3 * Math.cos(pitchAngle);
    const wristY = (y - 0.05) - this.L3 * Math.sin(pitchAngle);

    // Distance de l'épaule au poignet
    const D = Math.hypot(wristR, wristY);
    const reachMax = this.L1 + this.L2 - 0.005;

    // Contrôle d'atteignabilité
    if (D > reachMax) {
      // Point hors de portée
      return false;
    }
    if (D < Math.abs(this.L1 - this.L2) + 0.02) {
      // Trop proche de la singularité
      return false;
    }

    // 2. Loi des cosinus pour le coude Q3 (configuration coude haut/fléchi)
    const cosQ3 = (D * D - this.L1 * this.L1 - this.L2 * this.L2) / (2 * this.L1 * this.L2);
    const clampedCosQ3 = THREE.MathUtils.clamp(cosQ3, -1, 1);
    const q3 = -Math.acos(clampedCosQ3);

    // 3. Épaule Pitch Q2
    const alpha = Math.atan2(wristY, wristR);
    const beta = Math.atan2(this.L2 * Math.sin(-q3), this.L1 + this.L2 * Math.cos(q3));
    const q2 = Math.PI / 2 - (alpha + beta);

    // 4. Poignet Pitch Q4 pour maintenir la ventouse vers le bas
    // Orientation globale dans le plan : pitchAngle = -(q2 + q3 + q4)
    const q4 = -pitchAngle - (q2 + q3);

    // 5. Poignet Roll Q5
    const q5 = 0; // Aligné

    const proposedAngles = [q1, q2, q3, q4, q5];

    // Contrôle des limites articulaires
    for (let i = 0; i < 5; i++) {
      if (proposedAngles[i] < this.jointLimits[i][0] || proposedAngles[i] > this.jointLimits[i][1]) {
        // En dehors des limites autorisées
        return false;
      }
    }

    // Affectation de la consigne
    for (let i = 0; i < 5; i++) {
      this.targetAngles[i] = proposedAngles[i];
    }
    return true;
  }

  /**
   * Commande directe des angles cibles
   */
  setTargetAngles(angles) {
    for (let i = 0; i < 5; i++) {
      if (angles[i] !== undefined) {
        this.targetAngles[i] = THREE.MathUtils.clamp(angles[i], this.jointLimits[i][0], this.jointLimits[i][1]);
      }
    }
  }

  /**
   * Vérifie si le bras a atteint la consigne avec une tolérance angulaire
   */
  isTargetReached(toleranceRad = 0.035) {
    for (let i = 0; i < 5; i++) {
      if (Math.abs(this.jointAngles[i] - this.targetAngles[i]) > toleranceRad) {
        return false;
      }
    }
    return true;
  }

  /**
   * Mise à jour de la cinématique et des servomoteurs STS3215
   */
  update(dt, speedScale = 1.0) {
    const effectiveDt = dt * speedScale;
    const maxSpeed = CONFIG.arms.maxServoSpeedRadS; // ~3 rad/s

    // Interpolation réaliste avec vitesse max servo
    for (let i = 0; i < 5; i++) {
      const diff = this.targetAngles[i] - this.jointAngles[i];
      const maxDelta = maxSpeed * effectiveDt;
      if (Math.abs(diff) <= maxDelta) {
        this.jointAngles[i] = this.targetAngles[i];
      } else {
        this.jointAngles[i] += Math.sign(diff) * maxDelta;
      }
    }

    // Application des rotations sur la hiérarchie 3D Three.js
    // Q1 : Base Yaw (rotation autour de Y)
    this.joint1.rotation.y = this.jointAngles[0];

    // Q2 : Épaule Pitch (rotation autour de Z)
    this.joint2.rotation.z = this.jointAngles[1];

    // Q3 : Coude Pitch (rotation autour de Z)
    this.joint3.rotation.z = this.jointAngles[2];

    // Q4 : Poignet Pitch (rotation autour de Z)
    this.joint4.rotation.z = this.jointAngles[3];

    // Q5 : Poignet Roll (rotation autour de Y)
    this.joint5.rotation.y = this.jointAngles[4];

    // Mise à jour de la ventouse
    this.gripper.update(dt, speedScale);
  }
}

