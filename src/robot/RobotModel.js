import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { ZAxisTorso } from './ZAxisTorso.js';
import { Arm5DOF } from './Arm5DOF.js';
import { Sensors } from './Sensors.js';
import { JetsonOrin } from './JetsonOrin.js';

/**
 * Assemblage complet du robot mobile HUMA-LOG :
 * - Base mobile Mecanum 4WD holonome (vx, vy, omega)
 * - Mât vertical télescopique Z (2040 + T8 + NEMA 17)
 * - Deux bras 5-DDL (servos STS3215) + ventouses 12V
 * - RPLIDAR A1M8, caméra HD, Jetson Orin
 * - Compartiment batterie arrière avec pack amovible
 */
export class RobotModel {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'HUMA_LOG_Robot';
    this.scene.add(this.group);

    // Position et orientation globale (repère Three.js: X et Z horizontaux, Y vertical)
    this.position = new THREE.Vector3(-2.2, 0, -1.0); // Déposé au centre de l'allée atelier
    this.heading = 0.0; // Orientation lacet (yaw) autour de l'axe Y (radians)

    // Vitesses actuelles (repère robot : vx = longitudinal avant, vy = latéral crabe gauche, omega = rotation yaw)
    this.vx = 0.0;
    this.vy = 0.0;
    this.omega = 0.0;

    // Vitesses individuelles des 4 roues Mecanum (rad/s)
    this.wheelSpeeds = { fl: 0, fr: 0, rl: 0, rr: 0 };
    this.wheelMeshes = [];

    // Initialisation des sous-systèmes
    this.initChassis();
    this.initMecanumWheels();
    this.initBeacon();
    this.initBatteryCompartment();

    // Mât Z (torse télescopique)
    this.torso = new ZAxisTorso();
    this.torso.group.position.set(0.05, 0.25, 0); // Monté sur le plateau supérieur de la base
    this.group.add(this.torso.group);

    // Deux bras 5-DOF
    this.leftArm = new Arm5DOF('left');
    this.rightArm = new Arm5DOF('right');
    this.torso.leftArmMount.add(this.leftArm.group);
    this.torso.rightArmMount.add(this.rightArm.group);

    // Calculateur Jetson Orin
    this.jetson = new JetsonOrin();
    this.jetson.group.position.set(-0.15, 0.26, 0);
    this.group.add(this.jetson.group);

    // Suite de capteurs
    this.sensors = new Sensors(this);
    this.group.add(this.sensors.group);

    // Mise à jour de la position 3D initiale
    this.syncTransform();
  }

  initChassis() {
    const l = CONFIG.agv.lengthM;  // 0.60 m
    const w = CONFIG.agv.widthM;   // 0.45 m
    const h = CONFIG.agv.heightM;  // 0.25 m

    // Corps principal du châssis en tôle pliée thermolaquée gris foncé
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x111827,
      metalness: 0.6,
      roughness: 0.4
    });

    const bodyGeo = new THREE.BoxGeometry(l, h - 0.06, w);
    const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
    bodyMesh.position.set(0, (h - 0.06) / 2 + 0.04, 0);
    bodyMesh.castShadow = true;
    bodyMesh.receiveShadow = true;
    this.group.add(bodyMesh);

    // Bandeaux latéraux jaunes de sécurité avec chanfreins
    const yellowMat = new THREE.MeshStandardMaterial({
      color: 0xfacc15,
      metalness: 0.4,
      roughness: 0.3
    });

    const sidePanelGeo = new THREE.BoxGeometry(l + 0.01, 0.06, 0.01);
    const leftPanel = new THREE.Mesh(sidePanelGeo, yellowMat);
    leftPanel.position.set(0, 0.12, -w / 2 - 0.005);
    this.group.add(leftPanel);

    const rightPanel = new THREE.Mesh(sidePanelGeo, yellowMat);
    rightPanel.position.set(0, 0.12, w / 2 + 0.005);
    this.group.add(rightPanel);

    // Bumper avant biseauté
    const bumperMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.5 });
    const bumperGeo = new THREE.BoxGeometry(0.04, 0.08, w + 0.02);
    const bumper = new THREE.Mesh(bumperGeo, bumperMat);
    bumper.position.set(l / 2 + 0.02, 0.08, 0);
    this.group.add(bumper);

    // Logo et lettrage « HUMA-LOG » sur les flancs
    const logoCanvas = document.createElement('canvas');
    logoCanvas.width = 512;
    logoCanvas.height = 128;
    const ctx = logoCanvas.getContext('2d');
    ctx.fillStyle = '#111827';
    ctx.fillRect(0, 0, 512, 128);
    ctx.fillStyle = '#00d2ff';
    ctx.font = 'bold 52px "Segoe UI", Arial, sans-serif';
    ctx.fillText('HUMA-LOG', 30, 85);
    ctx.fillStyle = '#ffc107';
    ctx.fillRect(360, 45, 100, 45);
    ctx.fillStyle = '#000000';
    ctx.font = 'bold 28px "Segoe UI", Arial, sans-serif';
    ctx.fillText('AGV-01', 370, 78);

    const logoTex = new THREE.CanvasTexture(logoCanvas);
    const logoGeo = new THREE.PlaneGeometry(0.35, 0.09);
    const logoMat = new THREE.MeshBasicMaterial({ map: logoTex });

    const leftLogo = new THREE.Mesh(logoGeo, logoMat);
    leftLogo.position.set(0, 0.17, -w / 2 - 0.006);
    leftLogo.rotation.y = Math.PI;
    this.group.add(leftLogo);

    const rightLogo = new THREE.Mesh(logoGeo, logoMat);
    rightLogo.position.set(0, 0.17, w / 2 + 0.006);
    this.group.add(rightLogo);
  }

  initMecanumWheels() {
    // 4 Roues Mecanum Ø 80 mm (Rayon R = 0.04 m)
    const R = CONFIG.agv.wheelRadiusM;
    const wheelWidth = 0.038;
    const lx = CONFIG.agv.lxM; // 0.25 m (demi-empattement)
    const ly = CONFIG.agv.lyM; // 0.20 m (demi-voie)

    const wheelPositions = [
      { id: 'fl', x:  lx, z: -ly, sign:  1 }, // Avant gauche
      { id: 'fr', x:  lx, z:  ly, sign: -1 }, // Avant droit
      { id: 'rl', x: -lx, z: -ly, sign: -1 }, // Arrière gauche
      { id: 'rr', x: -lx, z:  ly, sign:  1 }  // Arrière droit
    ];

    const hubMat = new THREE.MeshStandardMaterial({ color: 0x0284c7, metalness: 0.8, roughness: 0.2 });
    const rollerMat = new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.8 });

    wheelPositions.forEach(wp => {
      const wheelGroup = new THREE.Group();
      wheelGroup.position.set(wp.x, R, wp.z);

      // Moyeu central en aluminium
      const hubGeo = new THREE.CylinderGeometry(R * 0.65, R * 0.65, wheelWidth, 16);
      const hub = new THREE.Mesh(hubGeo, hubMat);
      hub.rotation.x = Math.PI / 2;
      wheelGroup.add(hub);

      // Rouleaux périphériques à 45° (8 rouleaux en tonneau)
      const numRollers = 8;
      const rollerRadius = 0.009;
      const rollerLength = 0.024;
      const rollerGeo = new THREE.CylinderGeometry(rollerRadius * 0.8, rollerRadius, rollerLength, 10);

      for (let i = 0; i < numRollers; i++) {
        const theta = (i / numRollers) * Math.PI * 2;
        const roller = new THREE.Mesh(rollerGeo, rollerMat);
        const distFromHub = R * 0.82;
        roller.position.set(
          Math.cos(theta) * distFromHub,
          Math.sin(theta) * distFromHub,
          0
        );
        // Angle de 45° des rouleaux Mecanum
        roller.rotation.z = theta;
        roller.rotation.y = wp.sign * Math.PI / 4;
        wheelGroup.add(roller);
      }

      this.group.add(wheelGroup);
      this.wheelMeshes.push({ id: wp.id, mesh: wheelGroup });
    });
  }

  initBeacon() {
    // Gyrophare de sécurité orange sur le mât
    const beaconGroup = new THREE.Group();
    beaconGroup.position.set(-0.20, 0.42, 0);

    const baseMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
    const baseGeo = new THREE.CylinderGeometry(0.025, 0.03, 0.02, 16);
    const base = new THREE.Mesh(baseGeo, baseMat);
    beaconGroup.add(base);

    // Dôme translucide orange
    const domeMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      transparent: true,
      opacity: 0.85,
      roughness: 0.1
    });
    const domeGeo = new THREE.CylinderGeometry(0.022, 0.025, 0.04, 16);
    const dome = new THREE.Mesh(domeGeo, domeMat);
    dome.position.y = 0.03;
    beaconGroup.add(dome);

    // Réflecteur tournant intérieur émissif
    const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffaa00 });
    this.beaconBulb = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.02, 0.008), bulbMat);
    this.beaconBulb.position.y = 0.03;
    beaconGroup.add(this.beaconBulb);

    this.group.add(beaconGroup);
  }

  initBatteryCompartment() {
    // Compartiment arrière pour la batterie 12V amovible
    const bayMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.5 });
    const bayGeo = new THREE.BoxGeometry(0.26, 0.18, 0.24);
    const bay = new THREE.Mesh(bayGeo, bayMat);
    bay.position.set(-CONFIG.agv.lengthM / 2 + 0.13, 0.14, 0);
    this.group.add(bay);

    // Modèle du pack batterie 12V 20Ah présent dans le robot
    this.onboardBatteryMesh = new THREE.Group();
    this.onboardBatteryMesh.name = 'OnboardBattery';

    const batCaseMat = new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.3 });
    const batCase = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.16, 0.22), batCaseMat);
    this.onboardBatteryMesh.add(batCase);

    // Poignée jaune d'extraction rapide
    const handleMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b });
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.12, 12), handleMat);
    handle.rotation.z = Math.PI / 2;
    handle.position.set(-0.125, 0.02, 0);
    this.onboardBatteryMesh.add(handle);

    // Témoin LED SoC
    const socLedMat = new THREE.MeshBasicMaterial({ color: 0x00e676 });
    this.onboardBatteryLed = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.012, 0.04), socLedMat);
    this.onboardBatteryLed.position.set(-0.121, 0.05, 0);
    this.onboardBatteryMesh.add(this.onboardBatteryLed);

    this.onboardBatteryMesh.position.set(-CONFIG.agv.lengthM / 2 + 0.13, 0.14, 0);
    this.group.add(this.onboardBatteryMesh);
  }

  /**
   * Commande holonome Mecanum : applique les vitesses vx (avant), vy (gauche), omega (rotation)
   */
  setSpeeds(vx, vy, omega) {
    this.vx = vx;
    this.vy = vy;
    this.omega = omega;

    // Cinématique inverse 4WD Mecanum
    const R = CONFIG.agv.wheelRadiusM;
    const L = CONFIG.agv.lxM + CONFIG.agv.lyM;

    // Vitesses angulaires de chaque roue (rad/s)
    this.wheelSpeeds.fl = (vx - vy - L * omega) / R;
    this.wheelSpeeds.fr = (vx + vy + L * omega) / R;
    this.wheelSpeeds.rl = (vx + vy - L * omega) / R;
    this.wheelSpeeds.rr = (vx - vy + L * omega) / R;
  }

  stop() {
    this.setSpeeds(0, 0, 0);
  }

  /**
   * Intégration cinématique et mise à jour des positions
   */
  update(dt, fsmState = 'IDLE', obstacleList = [], speedScale = 1.0) {
    const effectiveDt = dt * speedScale;

    // 1. Déplacement holonome dans le repère global
    if (Math.abs(this.vx) > 0.001 || Math.abs(this.vy) > 0.001 || Math.abs(this.omega) > 0.001) {
      const cosH = Math.cos(this.heading);
      const sinH = Math.sin(this.heading);

      // Conversion vitesses robot -> monde
      const worldVx = this.vx * cosH - this.vy * sinH;
      const worldVz = this.vx * sinH + this.vy * cosH;

      this.position.x += worldVx * effectiveDt;
      this.position.z += worldVz * effectiveDt;
      this.heading += this.omega * effectiveDt;

      // Normalisation du heading entre -PI et +PI
      this.heading = Math.atan2(Math.sin(this.heading), Math.cos(this.heading));

      // Mise à jour de l'odométrie avec bruit capteur
      this.sensors.updateOdometry(this.vx, this.vy, this.omega, effectiveDt);

      // Rotation visuelle des roues Mecanum
      this.wheelMeshes.forEach(wm => {
        const speed = this.wheelSpeeds[wm.id] || 0;
        wm.mesh.rotation.z += speed * effectiveDt;
      });
    }

    // 2. Synchronisation de la pose Three.js
    this.syncTransform();

    // 3. Clignotement / rotation du gyrophare orange
    if (this.beaconBulb) {
      this.beaconBulb.rotation.y += 18 * effectiveDt;
    }

    // 4. Mise à jour de l'axe vertical Z (torse)
    this.torso.update(dt, speedScale);

    // 5. Mise à jour des deux bras 5-DOF
    this.leftArm.update(dt, speedScale);
    this.rightArm.update(dt, speedScale);

    // 6. Mise à jour des capteurs (LiDAR, Caméra)
    this.sensors.updateLidar(effectiveDt, obstacleList);

    // 7. Mise à jour du calculateur Jetson Orin
    this.jetson.update(dt, fsmState, speedScale);
  }

  syncTransform() {
    this.group.position.set(this.position.x, 0, this.position.z);
    this.group.rotation.y = -this.heading; // Inversion Three.js pour repère main droite standard
  }

  reset(startPosition = new THREE.Vector3(-2.2, 0, -1.0), startHeading = 0) {
    this.position.copy(startPosition);
    this.heading = startHeading;
    this.stop();
    this.torso.setTargetHeight(CONFIG.zAxis.carriageHeightMinM);
    this.leftArm.setRestPose();
    this.rightArm.setRestPose();
    this.leftArm.gripper.release();
    this.rightArm.gripper.release();
    this.syncTransform();
  }
}

