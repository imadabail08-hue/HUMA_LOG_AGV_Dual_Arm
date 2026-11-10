import * as THREE from 'three';
import { CONFIG } from '../config.js';

/**
 * Poste de charge & station d'échange automatique de batterie (Hot-Swap)
 * Inspiré du système robotique Walker S2 d'UBTECH.
 */
export class ChargingStation {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'ChargingStation';
    this.scene.add(this.group);

    // Position de la station
    this.position = new THREE.Vector3(-4.2, 0, 2.4);
    // Position précise de docking AGV devant la station
    this.dockingPosition = new THREE.Vector3(-3.4, 0, 2.4);
    this.dockingHeading = Math.PI; // Face à la station (-X)

    // État du rack de 3 batteries
    // Slot 0: En recharge
    // Slot 1: Pleine prête à l'emploi
    // Slot 2: Emplacement vide (pour recevoir la batterie du robot)
    this.batterySlots = [
      { id: 'BAT-01', state: 'charging', soc: 0.65, voltage: 11.8, tempC: 28.5, cycleCount: 142 },
      { id: 'BAT-02', state: 'ready', soc: 1.00, voltage: 12.6, tempC: 22.0, cycleCount: 98 },
      { id: null, state: 'empty', soc: 0, voltage: 0, tempC: 0, cycleCount: 0 }
    ];

    this.stationStatus = 'ready'; // 'ready', 'swapping', 'charging', 'fault'
    this.faultType = null;
    this.isEmergencyStopActive = false;

    // Meshes animables du mécanisme de transfert
    this.gantryCarriage = null;
    this.extractorGripper = null;
    this.physicalBatteries = [];
    this.statusLEDs = [];

    this.initStructure();
    this.initRackAndBatteries();
    this.initTransferMechanism();
    this.initDockingGuides();
    this.initStatusPanel();
    this.initEmergencyStop();
  }

  initStructure() {
    const cabinetMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      metalness: 0.7,
      roughness: 0.3
    });

    const trimMat = new THREE.MeshStandardMaterial({
      color: 0x0284c7,
      metalness: 0.5,
      roughness: 0.4
    });

    // Armoire principale de la station
    const cabinetGeo = new THREE.BoxGeometry(0.8, 1.6, 1.4);
    const cabinet = new THREE.Mesh(cabinetGeo, cabinetMat);
    cabinet.position.set(this.position.x - 0.2, 0.8, this.position.z);
    cabinet.castShadow = true;
    cabinet.receiveShadow = true;
    this.group.add(cabinet);

    // Bandes décoratives bleues HUMA-LOG
    const trimGeo = new THREE.BoxGeometry(0.02, 1.58, 0.04);
    const trim1 = new THREE.Mesh(trimGeo, trimMat);
    trim1.position.set(this.position.x + 0.21, 0.8, this.position.z - 0.65);
    const trim2 = new THREE.Mesh(trimGeo, trimMat);
    trim2.position.set(this.position.x + 0.21, 0.8, this.position.z + 0.65);
    this.group.add(trim1);
    this.group.add(trim2);

    // Fronton avec logo
    const bannerCanvas = document.createElement('canvas');
    bannerCanvas.width = 512;
    bannerCanvas.height = 128;
    const ctx = bannerCanvas.getContext('2d');
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, 512, 128);
    ctx.strokeStyle = '#0284c7';
    ctx.lineWidth = 6;
    ctx.strokeRect(4, 4, 504, 120);

    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 32px "Segoe UI", Arial, sans-serif';
    ctx.fillText('HOT-SWAP STATION', 25, 55);

    ctx.fillStyle = '#f59e0b';
    ctx.font = 'bold 20px "Segoe UI", Arial, sans-serif';
    ctx.fillText('WALKER S2 SYSTEM - 12V 20Ah', 25, 95);

    const bannerTex = new THREE.CanvasTexture(bannerCanvas);
    const bannerGeo = new THREE.PlaneGeometry(0.7, 0.2);
    const bannerMat = new THREE.MeshBasicMaterial({ map: bannerTex });
    const banner = new THREE.Mesh(bannerGeo, bannerMat);
    banner.position.set(this.position.x + 0.205, 1.45, this.position.z);
    banner.rotation.y = Math.PI / 2;
    this.group.add(banner);
  }

  initRackAndBatteries() {
    // Baie ouverte du rack à 3 compartiments verticaux
    const bayMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      metalness: 0.8,
      roughness: 0.2
    });

    const bayGeo = new THREE.BoxGeometry(0.35, 1.0, 1.1);
    const bay = new THREE.Mesh(bayGeo, bayMat);
    bay.position.set(this.position.x + 0.05, 0.7, this.position.z);
    this.group.add(bay);

    // 3 compartiments (étagères du rack)
    const slotYPositions = [0.35, 0.70, 1.05];
    const shelfGeo = new THREE.BoxGeometry(0.32, 0.02, 1.05);
    const shelfMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.9, roughness: 0.2 });

    slotYPositions.forEach((y, idx) => {
      const shelf = new THREE.Mesh(shelfGeo, shelfMat);
      shelf.position.set(this.position.x + 0.05, y - 0.12, this.position.z);
      this.group.add(shelf);

      // Connecteur électrique doré à l'arrière du rack
      const connGeo = new THREE.BoxGeometry(0.04, 0.05, 0.08);
      const connMat = new THREE.MeshStandardMaterial({ color: 0xd97706, metalness: 0.9, roughness: 0.1 });
      const conn = new THREE.Mesh(connGeo, connMat);
      conn.position.set(this.position.x - 0.08, y, this.position.z);
      this.group.add(conn);

      // Création du mesh de la batterie si présente
      const slot = this.batterySlots[idx];
      const batMesh = this.createBatteryMesh(slot.id, slot.soc, slot.state);
      batMesh.position.set(this.position.x + 0.05, y, this.position.z - 0.35 + idx * 0.35);

      if (slot.state === 'empty') {
        batMesh.visible = false;
      }

      this.group.add(batMesh);
      this.physicalBatteries.push(batMesh);

      // Étiquette de slot
      const slotLabelCanvas = document.createElement('canvas');
      slotLabelCanvas.width = 128;
      slotLabelCanvas.height = 64;
      const lctx = slotLabelCanvas.getContext('2d');
      lctx.fillStyle = '#1e293b';
      lctx.fillRect(0, 0, 128, 64);
      lctx.fillStyle = '#ffffff';
      lctx.font = 'bold 22px "Segoe UI", Arial, sans-serif';
      lctx.fillText(`RACK ${idx + 1}`, 15, 40);

      const labelTex = new THREE.CanvasTexture(slotLabelCanvas);
      const labelGeo = new THREE.PlaneGeometry(0.12, 0.06);
      const labelMat = new THREE.MeshBasicMaterial({ map: labelTex });
      const labelMesh = new THREE.Mesh(labelGeo, labelMat);
      labelMesh.position.set(this.position.x + 0.21, y, this.position.z - 0.35 + idx * 0.35);
      labelMesh.rotation.y = Math.PI / 2;
      this.group.add(labelMesh);
    });
  }

  createBatteryMesh(label = 'BAT', soc = 1.0, state = 'ready') {
    const batGroup = new THREE.Group();
    batGroup.name = `Battery_${label}`;

    // Boîtier batterie industriel (étanche, poignée rétractable, contacts auto-alignants)
    const caseMat = new THREE.MeshStandardMaterial({
      color: 0x111827,
      metalness: 0.4,
      roughness: 0.4
    });

    const caseGeo = new THREE.BoxGeometry(0.24, 0.16, 0.22);
    const caseMesh = new THREE.Mesh(caseGeo, caseMat);
    caseMesh.castShadow = true;
    batGroup.add(caseMesh);

    // Poignée jaune d'extraction rapide
    const handleMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.3 });
    const handleGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.14, 12);
    const handle = new THREE.Mesh(handleGeo, handleMat);
    handle.rotation.x = Math.PI / 2;
    handle.position.set(0.125, 0, 0);
    batGroup.add(handle);

    // Jauge LED sur la batterie
    const ledColor = state === 'ready' ? 0x00e676 : (state === 'charging' ? 0xf59e0b : 0xef4444);
    const ledGeo = new THREE.BoxGeometry(0.01, 0.015, 0.06);
    const ledMat = new THREE.MeshBasicMaterial({ color: ledColor });
    const batLed = new THREE.Mesh(ledGeo, ledMat);
    batLed.position.set(0.121, 0.05, 0);
    batGroup.add(batLed);

    // Connecteur multipôle arrière
    const pinMat = new THREE.MeshStandardMaterial({ color: 0xd97706, metalness: 0.9, roughness: 0.1 });
    const pinGeo = new THREE.BoxGeometry(0.02, 0.04, 0.08);
    const pins = new THREE.Mesh(pinGeo, pinMat);
    pins.position.set(-0.125, 0, 0);
    batGroup.add(pins);

    batGroup.userData = { label, soc, state, caseMesh, batLed };
    return batGroup;
  }

  initTransferMechanism() {
    // Mécanisme robotique cartésien à 2 axes (X télescopique, Y vertical, Z horizontal)
    // Permet d'extraire la batterie du robot et de la ranger dans le rack
    this.transferGroup = new THREE.Group();
    this.transferGroup.position.set(this.position.x + 0.25, 0.7, this.position.z);

    // Chariot Z
    const carriageMat = new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.7, roughness: 0.3 });
    const carriageGeo = new THREE.BoxGeometry(0.12, 0.14, 0.18);
    this.gantryCarriage = new THREE.Mesh(carriageGeo, carriageMat);
    this.transferGroup.add(this.gantryCarriage);

    // Bras préhenseur télescopique en X
    const gripperMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, metalness: 0.6, roughness: 0.3 });
    const gripperGeo = new THREE.BoxGeometry(0.3, 0.08, 0.12);
    this.extractorGripper = new THREE.Mesh(gripperGeo, gripperMat);
    this.extractorGripper.position.set(0.15, 0, 0);
    this.gantryCarriage.add(this.extractorGripper);

    // Pince / verrou électromécanique
    const pinGeo = new THREE.CylinderGeometry(0.008, 0.008, 0.06, 12);
    const pinMat = new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.9, roughness: 0.1 });
    const lockPin = new THREE.Mesh(pinGeo, pinMat);
    lockPin.position.set(0.15, 0, 0);
    this.extractorGripper.add(lockPin);

    this.group.add(this.transferGroup);
  }

  initDockingGuides() {
    // Rails biseautés de guidage mécanique de la base AGV
    const guideMat = new THREE.MeshStandardMaterial({ color: 0xfacc15, metalness: 0.6, roughness: 0.3 });
    const railGeo = new THREE.BoxGeometry(0.8, 0.04, 0.04);

    const leftRail = new THREE.Mesh(railGeo, guideMat);
    leftRail.position.set(this.dockingPosition.x - 0.1, 0.02, this.dockingPosition.z - 0.28);
    leftRail.rotation.y = 0.05; // Entrée biseautée
    this.group.add(leftRail);

    const rightRail = new THREE.Mesh(railGeo, guideMat);
    rightRail.position.set(this.dockingPosition.x - 0.1, 0.02, this.dockingPosition.z + 0.28);
    rightRail.rotation.y = -0.05;
    this.group.add(rightRail);

    // Butée mécanique avec capteur inductif de contact
    const stopperGeo = new THREE.BoxGeometry(0.05, 0.1, 0.5);
    const stopperMat = new THREE.MeshStandardMaterial({ color: 0x111827 });
    const stopper = new THREE.Mesh(stopperGeo, stopperMat);
    stopper.position.set(this.dockingPosition.x - 0.45, 0.05, this.dockingPosition.z);
    this.group.add(stopper);
  }

  initStatusPanel() {
    // Voyants lumineux industriels à colonne (Andon Tower)
    // Vert = prêt / nominal, Orange = en charge / swap en cours, Rouge = défaut
    const towerMat = new THREE.MeshStandardMaterial({ color: 0x1f2937 });
    const towerPole = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.6, 12), towerMat);
    towerPole.position.set(this.position.x + 0.15, 1.8, this.position.z + 0.5);
    this.group.add(towerPole);

    const lightColors = [
      { name: 'red', color: 0xef4444, y: 1.95 },
      { name: 'orange', color: 0xf59e0b, y: 1.85 },
      { name: 'green', color: 0x00e676, y: 1.75 }
    ];

    lightColors.forEach(lc => {
      const lightGeo = new THREE.CylinderGeometry(0.035, 0.035, 0.08, 16);
      const lightMat = new THREE.MeshBasicMaterial({ color: 0x222222 }); // Éteint par défaut
      const lightMesh = new THREE.Mesh(lightGeo, lightMat);
      lightMesh.position.set(this.position.x + 0.15, lc.y, this.position.z + 0.5);
      this.group.add(lightMesh);

      this.statusLEDs.push({
        name: lc.name,
        colorHex: lc.color,
        mesh: lightMesh,
        active: false
      });
    });

    this.updateStatusLED('green');
  }

  updateStatusLED(status) {
    this.statusLEDs.forEach(led => {
      if (led.name === status) {
        led.mesh.material.color.setHex(led.colorHex);
        led.active = true;
      } else {
        led.mesh.material.color.setHex(0x1a202c);
        led.active = false;
      }
    });
  }

  initEmergencyStop() {
    // Bouton coup-de-poing d'arrêt d'urgence au poste de charge
    const collarMat = new THREE.MeshBasicMaterial({ color: 0xfacc15 }); // Jaune
    const collarGeo = new THREE.CylinderGeometry(0.045, 0.045, 0.02, 16);
    const collar = new THREE.Mesh(collarGeo, collarMat);
    collar.position.set(this.position.x + 0.205, 1.15, this.position.z - 0.45);
    collar.rotation.z = Math.PI / 2;
    this.group.add(collar);

    const btnMat = new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.3 }); // Rouge
    const btnGeo = new THREE.CylinderGeometry(0.035, 0.03, 0.03, 16);
    this.eStopBtnMesh = new THREE.Mesh(btnGeo, btnMat);
    this.eStopBtnMesh.position.set(this.position.x + 0.225, 1.15, this.position.z - 0.45);
    this.eStopBtnMesh.rotation.z = Math.PI / 2;
    this.group.add(this.eStopBtnMesh);
  }

  triggerEmergencyStop(active = true) {
    this.isEmergencyStopActive = active;
    if (active) {
      this.stationStatus = 'fault';
      this.faultType = 'ARRÊT D\'URGENCE MANUEL POSTE DE CHARGE';
      this.updateStatusLED('red');
      this.eStopBtnMesh.position.x = this.position.x + 0.21; // Enfoncé
    } else {
      this.stationStatus = 'ready';
      this.faultType = null;
      this.updateStatusLED('green');
      this.eStopBtnMesh.position.x = this.position.x + 0.225;
    }
  }

  /**
   * Animation et recharge CC/CV des batteries du rack
   */
  update(dt, speedScale = 1.0) {
    const effectiveDt = dt * speedScale;

    // Simulation de recharge CC/CV pour toute batterie en charge
    this.batterySlots.forEach((slot, idx) => {
      if (slot.state === 'charging' && slot.soc < 1.0) {
        // Courbe CC/CV simplifiée
        // CC : courant 10A sur pack 20Ah -> dSoC/dt = 10A / (20Ah * 3600s) = 0.000138 / s
        // À vitesse normale, une charge complète prendrait 2h.
        // En simu accélérée, on applique un facteur d'accélération pour observer la recharge
        const chargeRate = (10.0 / (CONFIG.battery.capacityAh * 300)) * effectiveDt;
        slot.soc = Math.min(1.0, slot.soc + chargeRate);

        // Tension de 11.1V à 12.6V
        slot.voltage = 11.1 + (slot.soc * 1.5);
        slot.tempC = 25.0 + slot.soc * 8.0;

        if (slot.soc >= 0.999) {
          slot.soc = 1.0;
          slot.state = 'ready';
          slot.voltage = 12.6;
        }

        // Mettre à jour le mesh physique
        const mesh = this.physicalBatteries[idx];
        if (mesh && mesh.userData) {
          mesh.userData.soc = slot.soc;
          mesh.userData.state = slot.state;
          if (mesh.userData.batLed) {
            mesh.userData.batLed.material.color.setHex(slot.state === 'ready' ? 0x00e676 : 0xf59e0b);
          }
        }
      }
    });
  }

  reset() {
    this.batterySlots = [
      { id: 'BAT-01', state: 'charging', soc: 0.65, voltage: 11.8, tempC: 28.5, cycleCount: 142 },
      { id: 'BAT-02', state: 'ready', soc: 1.00, voltage: 12.6, tempC: 22.0, cycleCount: 98 },
      { id: null, state: 'empty', soc: 0, voltage: 0, tempC: 0, cycleCount: 0 }
    ];
    this.physicalBatteries.forEach((mesh, idx) => {
      const slot = this.batterySlots[idx];
      mesh.visible = slot.state !== 'empty';
      if (mesh.userData && mesh.userData.batLed) {
        mesh.userData.batLed.material.color.setHex(slot.state === 'ready' ? 0x00e676 : 0xf59e0b);
      }
    });
    this.triggerEmergencyStop(false);
  }
}

