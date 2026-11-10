import * as THREE from 'three';
import { CONFIG } from '../config.js';

/**
 * Calculateur de bord NVIDIA Jetson Orin Nano / AGX
 * Télémétrie CPU/GPU, charge algorithmique (Nav2, SLAM, Vision ArUco, IK)
 * et surveillance thermique.
 */
export class JetsonOrin {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'JetsonOrin';

    // Télémétrie du calculateur
    this.cpuLoadPercent = 28.0;
    this.gpuLoadPercent = 35.0;
    this.ramUsageGB = 4.2;
    this.totalRamGB = 8.0;
    this.tempC = 41.5;
    this.powerW = CONFIG.power.jetsonIdleW; // 15W
    this.isThrottled = false;
    this.isBufferActive = false; // Alimentation tampon active pendant le hot-swap

    this.initMesh();
  }

  initMesh() {
    // PCB vert industriel
    const pcbMat = new THREE.MeshStandardMaterial({ color: 0x065f46, roughness: 0.6 });
    const pcbGeo = new THREE.BoxGeometry(0.10, 0.005, 0.08);
    const pcb = new THREE.Mesh(pcbGeo, pcbMat);
    pcb.position.y = 0.0025;
    this.group.add(pcb);

    // Dissipateur thermique noir en aluminium à ailettes
    const sinkMat = new THREE.MeshStandardMaterial({ color: 0x18181b, metalness: 0.8, roughness: 0.2 });
    const sinkGeo = new THREE.BoxGeometry(0.08, 0.025, 0.06);
    const sink = new THREE.Mesh(sinkGeo, sinkMat);
    sink.position.set(0, 0.015, 0);
    this.group.add(sink);

    // Ventilateur miniature axial
    const fanMat = new THREE.MeshStandardMaterial({ color: 0x27272a, roughness: 0.5 });
    const fanGeo = new THREE.CylinderGeometry(0.022, 0.022, 0.008, 16);
    this.fanMesh = new THREE.Mesh(fanGeo, fanMat);
    this.fanMesh.position.set(0, 0.03, 0);
    this.group.add(this.fanMesh);

    // Ports E/S (Ethernet RJ45, USB-C, CAN-bus)
    const portMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.9, roughness: 0.1 });
    const rj45 = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.013, 0.015), portMat);
    rj45.position.set(0.04, 0.009, 0.025);
    this.group.add(rj45);

    // LED d'état (Vert = nominal, Orange = swap sur tampon, Rouge = surchauffe/défaut)
    const ledMat = new THREE.MeshBasicMaterial({ color: 0x00e676 });
    this.statusLed = new THREE.Mesh(new THREE.SphereGeometry(0.003, 8, 8), ledMat);
    this.statusLed.position.set(-0.04, 0.008, 0.03);
    this.group.add(this.statusLed);
  }

  setBufferMode(active) {
    this.isBufferActive = active;
    if (this.statusLed) {
      this.statusLed.material.color.setHex(active ? 0x00d2ff : 0x00e676);
    }
  }

  update(dt, fsmState = 'IDLE', speedScale = 1.0) {
    // Rotation du ventilateur
    if (this.fanMesh) {
      this.fanMesh.rotation.y += 25 * dt * speedScale;
    }

    // Modulation de la charge en fonction de l'activité du robot
    let baseCpu = 22.0;
    let baseGpu = 18.0;

    if (fsmState.includes('NAVIGATE')) {
      baseCpu += 28.0; // Nav2 + SLAM + Pure Pursuit
      baseGpu += 15.0;
    }
    if (fsmState === 'DETECT') {
      baseGpu += 45.0; // Détection et pose estimation ArUco
      baseCpu += 15.0;
    }
    if (fsmState === 'PICK' || fsmState === 'PLACE') {
      baseCpu += 18.0; // Calcul IK haute fréquence
    }

    // Ajout d'une gigue naturelle
    this.cpuLoadPercent = THREE.MathUtils.lerp(this.cpuLoadPercent, baseCpu + (Math.random() - 0.5) * 4, 0.1);
    this.gpuLoadPercent = THREE.MathUtils.lerp(this.gpuLoadPercent, baseGpu + (Math.random() - 0.5) * 4, 0.1);

    // Température fonction de la puissance
    const targetTemp = 38.0 + (this.cpuLoadPercent + this.gpuLoadPercent) * 0.22;
    this.tempC = THREE.MathUtils.lerp(this.tempC, targetTemp, 0.05);

    // Puissance électrique absorbée
    this.powerW = CONFIG.power.jetsonIdleW + (this.cpuLoadPercent / 100) * 8.0 + (this.gpuLoadPercent / 100) * 12.0;
  }
}

