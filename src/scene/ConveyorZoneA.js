import * as THREE from 'three';
import { CONFIG } from '../config.js';

/**
 * Zone A : Convoyeur à rouleaux motorisé avec butée mécanique,
 * détection optique de présence et cartons étiquetés QR/ArUco.
 */
export class ConveyorZoneA {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'ConveyorZoneA';
    this.scene.add(this.group);

    // Paramètres du convoyeur
    this.position = new THREE.Vector3(-4.5, 0, -2.5);
    this.length = 2.4;
    this.width = 0.55;
    this.height = 0.42; // Hauteur du plan de roulement
    this.pickupStopPosition = new THREE.Vector3(-4.0, this.height + 0.05, -2.5);

    this.rollers = [];
    this.boxesOnConveyor = [];
    this.spawnTimer = 0;
    this.spawnCadenceS = CONFIG.boxes.conveyorCadenceS;
    this.boxCounter = 0;

    this.initStructure();
    this.initRollers();
    this.initBumperStop();
    this.initOpticalSensor();
    this.initQRCodeGenerator();

    // Spawn initial d'un carton à la butée
    this.spawnBox(true);
  }

  initStructure() {
    const frameMat = new THREE.MeshStandardMaterial({
      color: 0x1f2937,
      metalness: 0.7,
      roughness: 0.3
    });

    // Profilés latéraux longitudinaux
    const beamGeo = new THREE.BoxGeometry(this.length, 0.08, 0.04);
    const leftBeam = new THREE.Mesh(beamGeo, frameMat);
    leftBeam.position.set(this.position.x, this.height - 0.04, this.position.z - this.width / 2);
    leftBeam.castShadow = true;
    leftBeam.receiveShadow = true;
    this.group.add(leftBeam);

    const rightBeam = new THREE.Mesh(beamGeo, frameMat);
    rightBeam.position.set(this.position.x, this.height - 0.04, this.position.z + this.width / 2);
    rightBeam.castShadow = true;
    rightBeam.receiveShadow = true;
    this.group.add(rightBeam);

    // 4 pieds télescopiques
    const legGeo = new THREE.CylinderGeometry(0.025, 0.03, this.height - 0.08, 12);
    const legPositions = [
      [this.position.x - this.length / 2 + 0.15, this.position.z - this.width / 2 + 0.04],
      [this.position.x - this.length / 2 + 0.15, this.position.z + this.width / 2 - 0.04],
      [this.position.x + this.length / 2 - 0.15, this.position.z - this.width / 2 + 0.04],
      [this.position.x + this.length / 2 - 0.15, this.position.z + this.width / 2 - 0.04]
    ];

    legPositions.forEach(p => {
      const leg = new THREE.Mesh(legGeo, frameMat);
      leg.position.set(p[0], (this.height - 0.08) / 2, p[1]);
      leg.castShadow = true;
      this.group.add(leg);

      // Pied vérin
      const footGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.02, 12);
      const foot = new THREE.Mesh(footGeo, frameMat);
      foot.position.set(p[0], 0.01, p[1]);
      this.group.add(foot);
    });

    // Moteur électrique d'entraînement du convoyeur
    const motorGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.18, 16);
    const motorMat = new THREE.MeshStandardMaterial({ color: 0x0284c7, metalness: 0.6, roughness: 0.3 });
    const motor = new THREE.Mesh(motorGeo, motorMat);
    motor.rotation.x = Math.PI / 2;
    motor.position.set(this.position.x - this.length / 2 + 0.1, this.height - 0.08, this.position.z + this.width / 2 + 0.1);
    this.group.add(motor);
  }

  initRollers() {
    const rollerCount = 20;
    const rollerSpacing = this.length / (rollerCount + 1);
    const rollerGeo = new THREE.CylinderGeometry(0.022, 0.022, this.width - 0.06, 14);
    const rollerMat = new THREE.MeshStandardMaterial({
      color: 0x94a3b8,
      metalness: 0.85,
      roughness: 0.25
    });

    for (let i = 0; i < rollerCount; i++) {
      const x = this.position.x - this.length / 2 + (i + 1) * rollerSpacing;
      const roller = new THREE.Mesh(rollerGeo, rollerMat);
      roller.rotation.x = Math.PI / 2;
      roller.position.set(x, this.height, this.position.z);
      roller.castShadow = true;
      roller.receiveShadow = true;
      this.group.add(roller);
      this.rollers.push(roller);
    }
  }

  initBumperStop() {
    // Butée d'arrêt mécanique d'indexation du colis
    const stopMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.4 });
    const bumperGeo = new THREE.BoxGeometry(0.04, 0.12, this.width - 0.05);
    const bumper = new THREE.Mesh(bumperGeo, stopMat);
    // Butée placée vers X = this.pickupStopPosition.x + 0.12
    bumper.position.set(this.pickupStopPosition.x + 0.14, this.height + 0.05, this.position.z);
    bumper.castShadow = true;
    this.group.add(bumper);

    // Amortisseurs caoutchouc sur la butée
    const rubberMat = new THREE.MeshBasicMaterial({ color: 0x111111 });
    const rubberGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.03, 8);
    const rubber1 = new THREE.Mesh(rubberGeo, rubberMat);
    rubber1.rotation.z = Math.PI / 2;
    rubber1.position.set(this.pickupStopPosition.x + 0.115, this.height + 0.05, this.position.z - 0.1);
    const rubber2 = rubber1.clone();
    rubber2.position.z = this.position.z + 0.1;
    this.group.add(rubber1);
    this.group.add(rubber2);
  }

  initOpticalSensor() {
    // Capteur optique photoélectrique de présence colis
    const sensorGeo = new THREE.BoxGeometry(0.03, 0.05, 0.03);
    const sensorMat = new THREE.MeshStandardMaterial({ color: 0x111827 });
    const emitter = new THREE.Mesh(sensorGeo, sensorMat);
    emitter.position.set(this.pickupStopPosition.x, this.height + 0.06, this.position.z - this.width / 2 - 0.02);
    this.group.add(emitter);

    const receiver = new THREE.Mesh(sensorGeo, sensorMat);
    receiver.position.set(this.pickupStopPosition.x, this.height + 0.06, this.position.z + this.width / 2 + 0.02);
    this.group.add(receiver);

    // Faisceau rouge infrarouge/laser visible
    const beamGeo = new THREE.CylinderGeometry(0.0015, 0.0015, this.width + 0.04, 8);
    const beamMat = new THREE.MeshBasicMaterial({ color: 0xff0044, transparent: true, opacity: 0.65 });
    this.opticalBeam = new THREE.Mesh(beamGeo, beamMat);
    this.opticalBeam.rotation.x = Math.PI / 2;
    this.opticalBeam.position.set(this.pickupStopPosition.x, this.height + 0.06, this.position.z);
    this.group.add(this.opticalBeam);
  }

  initQRCodeGenerator() {
    // Génère des textures canvas procédurales simulant des marqueurs ArUco / QR Code
    this.generateMarkerTexture = (boxId, targetSlot, mass) => {
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 256;
      const ctx = canvas.getContext('2d');

      // Fond carton beige/kraft
      ctx.fillStyle = '#c8a265';
      ctx.fillRect(0, 0, 256, 256);

      // Zone étiquette blanche
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(28, 28, 200, 200);

      // ArUco / QR marker cadre noir
      ctx.fillStyle = '#000000';
      ctx.fillRect(40, 40, 110, 110);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(50, 50, 90, 90);
      ctx.fillStyle = '#000000';
      ctx.fillRect(60, 60, 70, 70);

      // ArUco bits intérieurs pseudo-aléatoires basés sur boxId
      const seed = boxId * 37;
      for (let r = 0; r < 5; r++) {
        for (let c = 0; c < 5; c++) {
          if (((seed + r * 7 + c * 13) % 3) === 0) {
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(66 + c * 11.5, 66 + r * 11.5, 11, 11);
          }
        }
      }

      // Données textuelles lisibles sur l'étiquette
      ctx.fillStyle = '#111827';
      ctx.font = 'bold 15px "Segoe UI", Arial, sans-serif';
      ctx.fillText(`HUMA-LOG`, 160, 60);

      ctx.font = 'bold 13px "Segoe UI", Arial, sans-serif';
      ctx.fillText(`ID: #${boxId}`, 160, 82);

      ctx.fillStyle = '#0284c7';
      ctx.font = 'bold 14px "Segoe UI", Arial, sans-serif';
      ctx.fillText(`${targetSlot}`, 160, 108);

      ctx.fillStyle = '#4b5563';
      ctx.font = '12px "Segoe UI", Arial, sans-serif';
      ctx.fillText(`${mass.toFixed(2)} kg`, 160, 130);

      // Code-barres en bas
      ctx.fillStyle = '#000000';
      for (let x = 40; x < 216; x += 4) {
        if ((x + seed) % 7 !== 0) {
          ctx.fillRect(x, 180, 2.5, 30);
        }
      }

      const tex = new THREE.CanvasTexture(canvas);
      tex.needsUpdate = true;
      return tex;
    };
  }

  /**
   * Crée un nouveau colis sur le convoyeur
   */
  spawnBox(atPickupStop = false) {
    this.boxCounter++;
    const boxId = this.boxCounter;

    // Détermination de la cible étagère aléatoire pondérée
    // 3 étagères (E1, E2, E3), 3 niveaux (N1=bas, N2=moyen, N3=haut)
    const shelfNum = 1 + (this.boxCounter % CONFIG.shelves.count);
    const levelNum = 1 + ((this.boxCounter + 1) % 3);
    const slotLetter = ['A', 'B', 'C'][(this.boxCounter + 2) % 3];
    const targetSlot = `E${shelfNum}-N${levelNum}-${slotLetter}`;
    const targetLevelHeight = CONFIG.shelves.levelHeightsM[levelNum - 1];

    // Masse comprise entre 0.5 et 1.2 kg
    const mass = 0.5 + Math.random() * 0.7;

    const length = CONFIG.boxes.lengthM; // 0.20 m
    const width = CONFIG.boxes.widthM;   // 0.15 m
    const height = CONFIG.boxes.heightM; // 0.10 m

    const boxGeo = new THREE.BoxGeometry(length, height, width);

    // Matériau kraft pour les côtés
    const kraftMat = new THREE.MeshStandardMaterial({
      color: 0xc8a265,
      roughness: 0.85,
      metalness: 0.05
    });

    // Texture QR pour le dessus (Y positif)
    const topTexture = this.generateMarkerTexture(boxId, targetSlot, mass);
    const topMat = new THREE.MeshStandardMaterial({
      map: topTexture,
      roughness: 0.75,
      metalness: 0.05
    });

    // [px, nx, py, ny, pz, nz] -> dessus = index 2 (py)
    const materials = [kraftMat, kraftMat, topMat, kraftMat, kraftMat, kraftMat];

    const boxMesh = new THREE.Mesh(boxGeo, materials);
    boxMesh.castShadow = true;
    boxMesh.receiveShadow = true;

    const initialX = atPickupStop
      ? this.pickupStopPosition.x
      : this.position.x - this.length / 2 + 0.2;

    boxMesh.position.set(initialX, this.height + height / 2 + 0.005, this.position.z);

    const boxData = {
      id: boxId,
      mesh: boxMesh,
      targetSlot: targetSlot,
      targetShelf: shelfNum,
      targetLevel: levelNum,
      targetLevelHeight: targetLevelHeight,
      slotLetter: slotLetter,
      mass: mass,
      dimensions: { length, width, height },
      isAtStop: atPickupStop,
      isPicked: false
    };

    boxMesh.userData = boxData;
    this.group.add(boxMesh);
    this.boxesOnConveyor.push(boxData);
    return boxData;
  }

  /**
   * Retourne le colis actuellement prêt en butée de prise
   */
  getAvailableBoxAtPickup() {
    return this.boxesOnConveyor.find(b => !b.isPicked && b.isAtStop);
  }

  /**
   * Retire le colis du flux convoyeur lors de la prise par ventouse
   */
  removeBoxFromConveyor(boxData) {
    boxData.isPicked = true;
    const index = this.boxesOnConveyor.indexOf(boxData);
    if (index !== -1) {
      this.boxesOnConveyor.splice(index, 1);
    }
  }

  /**
   * Mise à jour physique et animation du convoyeur
   */
  update(dt, speedScale = 1.0) {
    // Rotation des rouleaux
    const rollerSpeed = CONFIG.boxes.conveyorSpeedMs * speedScale;
    const rotSpeed = (rollerSpeed / 0.022) * dt;
    this.rollers.forEach(r => {
      r.rotation.y += rotSpeed;
    });

    // Avancement des colis sur le convoyeur vers la butée
    const stopX = this.pickupStopPosition.x;
    for (let i = 0; i < this.boxesOnConveyor.length; i++) {
      const box = this.boxesOnConveyor[i];
      if (box.isPicked) continue;

      if (!box.isAtStop) {
        // Avance vers la droite (+X)
        box.mesh.position.x += rollerSpeed * dt;

        // Vérification butée ou carton précédent
        let blocked = false;
        if (box.mesh.position.x >= stopX) {
          box.mesh.position.x = stopX;
          box.isAtStop = true;
          blocked = true;
        } else {
          // Vérification collision avec un carton en avant
          for (let j = 0; j < this.boxesOnConveyor.length; j++) {
            if (i !== j && !this.boxesOnConveyor[j].isPicked) {
              const other = this.boxesOnConveyor[j];
              const dist = other.mesh.position.x - box.mesh.position.x;
              if (dist > 0 && dist < (CONFIG.boxes.lengthM + 0.05)) {
                box.mesh.position.x = other.mesh.position.x - (CONFIG.boxes.lengthM + 0.05);
                blocked = true;
                break;
              }
            }
          }
        }
      }
    }

    // Gestion du faisceau optique (clignote ou devient vert si carton présent)
    const boxAtStop = this.getAvailableBoxAtPickup();
    if (this.opticalBeam) {
      this.opticalBeam.material.color.setHex(boxAtStop ? 0x00e676 : 0xff0044);
    }

    // Timer d'arrivée automatique des colis si la butée n'est pas engorgée
    this.spawnTimer += dt * speedScale;
    if (this.spawnTimer >= this.spawnCadenceS) {
      this.spawnTimer = 0;
      // Ne spawner que si l'entrée n'est pas bloquée
      const entryX = this.position.x - this.length / 2 + 0.2;
      const entryBlocked = this.boxesOnConveyor.some(b => Math.abs(b.mesh.position.x - entryX) < 0.3);
      if (!entryBlocked && this.boxesOnConveyor.length < 5) {
        this.spawnBox(false);
      }
    }
  }

  setCadence(cadenceSeconds) {
    this.spawnCadenceS = Math.max(3.0, cadenceSeconds);
  }

  reset() {
    // Nettoyer tous les colis
    this.boxesOnConveyor.forEach(b => {
      this.group.remove(b.mesh);
      if (b.mesh.geometry) b.mesh.geometry.dispose();
    });
    this.boxesOnConveyor = [];
    this.boxCounter = 0;
    this.spawnTimer = 0;
    this.spawnBox(true);
  }
}

