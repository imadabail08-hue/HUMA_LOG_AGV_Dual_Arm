import * as THREE from 'three';
import { CONFIG } from '../config.js';

/**
 * Suite de capteurs embarqués HUMA-LOG :
 * 1. RPLIDAR A1M8 (LiDAR 2D 360°, portée 12m, détection obstacles & sécurité)
 * 2. Caméra USB HD (Cône de vision, décodage ArUco / QR code simulé)
 * 3. Odométrie roues Mecanum + IMU 6 axes (avec bruit gaussien paramétrable)
 */
export class Sensors {
  constructor(robot) {
    this.robot = robot;
    this.group = new THREE.Group();
    this.group.name = 'Sensors';

    // Paramètres LiDAR
    this.lidarRange = CONFIG.sensors.lidarRangeM;
    this.lidarSamples = CONFIG.sensors.lidarSamples; // 180 rayons
    this.showLidarRays = false;
    this.isLidarActive = true;
    this.closestObstacleDistM = Infinity;
    this.closestObstacleAngleRad = 0;

    // Paramètres Caméra
    this.cameraFovDeg = CONFIG.sensors.cameraFovDeg;
    this.cameraMaxDistM = CONFIG.sensors.cameraMaxDetectDistM;
    this.cameraMaxAngleDeg = CONFIG.sensors.cameraMaxAngleDeg;
    this.showCameraFrustum = false;
    this.lastDetectedQR = null;

    // Paramètres Odométrie / IMU
    this.odomPose = { x: 0, z: 0, theta: 0 };
    this.noiseStdDevPos = CONFIG.agv.positionNoiseStdDevM;
    this.noiseStdDevOri = CONFIG.agv.orientationNoiseStdDevRad;

    this.initLidarMesh();
    this.initCameraMesh();
    this.initLidarVisualizer();
    this.initCameraFrustumVisualizer();
  }

  initLidarMesh() {
    // Boîtier RPLIDAR A1M8 (cylindre noir avec tête tournante)
    const lidarGroup = new THREE.Group();
    lidarGroup.position.set(0.24, 0.26, 0); // À l'avant du châssis AGV

    const baseMat = new THREE.MeshStandardMaterial({ color: 0x111827, metalness: 0.8, roughness: 0.3 });
    const baseGeo = new THREE.CylinderGeometry(0.045, 0.045, 0.025, 24);
    const baseMesh = new THREE.Mesh(baseGeo, baseMat);
    lidarGroup.add(baseMesh);

    // Tête optique tournante
    const rotorMat = new THREE.MeshStandardMaterial({ color: 0x1f2937, metalness: 0.9, roughness: 0.2 });
    const rotorGeo = new THREE.CylinderGeometry(0.038, 0.038, 0.02, 24);
    this.lidarRotor = new THREE.Mesh(rotorGeo, rotorMat);
    this.lidarRotor.position.y = 0.02;

    // Fentes optiques de l'émetteur/récepteur laser
    const lensMat = new THREE.MeshBasicMaterial({ color: 0x00d2ff });
    const lens = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.012, 0.005), lensMat);
    lens.position.set(0, 0, 0.036);
    this.lidarRotor.add(lens);

    lidarGroup.add(this.lidarRotor);
    this.group.add(lidarGroup);
    this.lidarAnchor = lidarGroup;
  }

  initCameraMesh() {
    // Caméra HD industrielle montée sur le mât
    const camGroup = new THREE.Group();
    camGroup.position.set(0.12, 0.42, 0);

    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.7, roughness: 0.3 });
    const bodyGeo = new THREE.BoxGeometry(0.035, 0.035, 0.06);
    const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
    camGroup.add(bodyMesh);

    // Objectif optique avec filtre antireflet bleu
    const lensMat = new THREE.MeshStandardMaterial({ color: 0x0284c7, metalness: 0.9, roughness: 0.1 });
    const lensGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.015, 16);
    const lens = new THREE.Mesh(lensGeo, lensMat);
    lens.rotation.x = Math.PI / 2;
    lens.position.set(0, 0, 0.035);
    camGroup.add(lens);

    // LED d'éclairage d'appoint pour lecture QR
    const ledMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.004, 8, 8), ledMat);
    led.position.set(0, 0.012, 0.032);
    camGroup.add(led);

    this.group.add(camGroup);
    this.cameraAnchor = camGroup;
  }

  initLidarVisualizer() {
    // Lignes ou nuage de points pour visualiser le balayage LiDAR à 360°
    const positions = new Float32Array(this.lidarSamples * 3);
    const colors = new Float32Array(this.lidarSamples * 3);

    for (let i = 0; i < this.lidarSamples; i++) {
      const angle = (i / this.lidarSamples) * Math.PI * 2;
      positions[i * 3] = Math.cos(angle) * 3.0;
      positions[i * 3 + 1] = 0;
      positions[i * 3 + 2] = Math.sin(angle) * 3.0;

      colors[i * 3] = 0.0;
      colors[i * 3 + 1] = 0.82;
      colors[i * 3 + 2] = 1.0;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const mat = new THREE.PointsMaterial({
      size: 0.04,
      vertexColors: true,
      transparent: true,
      opacity: 0.75
    });

    this.lidarPointsMesh = new THREE.Points(geo, mat);
    this.lidarPointsMesh.position.copy(this.lidarAnchor.position);
    this.lidarPointsMesh.visible = this.showLidarRays;
    this.group.add(this.lidarPointsMesh);
  }

  initCameraFrustumVisualizer() {
    // Cône de vision trapézoïdal semi-transparent
    const frustumGeo = new THREE.ConeGeometry(0.7, this.cameraMaxDistM, 4, 1, true);
    frustumGeo.rotateX(Math.PI / 2);
    frustumGeo.rotateZ(Math.PI / 4);

    const frustumMat = new THREE.MeshBasicMaterial({
      color: 0x00d2ff,
      wireframe: true,
      transparent: true,
      opacity: 0.35
    });

    this.frustumMesh = new THREE.Mesh(frustumGeo, frustumMat);
    this.frustumMesh.position.set(0.12, 0.42, this.cameraMaxDistM / 2 + 0.05);
    this.frustumMesh.visible = this.showCameraFrustum;
    this.group.add(this.frustumMesh);
  }

  toggleLidarRays(visible) {
    this.showLidarRays = visible !== undefined ? visible : !this.showLidarRays;
    if (this.lidarPointsMesh) {
      this.lidarPointsMesh.visible = this.showLidarRays;
    }
  }

  toggleCameraFrustum(visible) {
    this.showCameraFrustum = visible !== undefined ? visible : !this.showCameraFrustum;
    if (this.frustumMesh) {
      this.frustumMesh.visible = this.showCameraFrustum;
    }
  }

  /**
   * Simulation de scan LiDAR 2D avec détection d'obstacles
   * obstacleList: tableau d'objets avec position et rayon
   */
  updateLidar(dt, obstacleList = []) {
    if (!this.isLidarActive) {
      this.closestObstacleDistM = Infinity;
      return;
    }

    // Rotation de la tête LiDAR (10 Hz = 62.8 rad/s)
    if (this.lidarRotor) {
      this.lidarRotor.rotation.y += Math.PI * 2 * CONFIG.sensors.lidarScanRateHz * dt;
    }

    // Position mondiale du LiDAR
    const lidarWorldPos = new THREE.Vector3();
    this.lidarAnchor.getWorldPosition(lidarWorldPos);

    let minObstacleDist = Infinity;
    let minObstacleAngle = 0;

    const positions = this.lidarPointsMesh.geometry.attributes.position.array;
    const colors = this.lidarPointsMesh.geometry.attributes.color.array;

    for (let i = 0; i < this.lidarSamples; i++) {
      const angle = (i / this.lidarSamples) * Math.PI * 2 + this.robot.heading;
      const rayDir = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));

      let rayDist = this.lidarRange;

      // Détection contre les obstacles dynamiques et statiques
      for (const obs of obstacleList) {
        if (!obs || !obs.position) continue;
        const toObs = new THREE.Vector3().subVectors(obs.position, lidarWorldPos);
        toObs.y = 0;
        const obsDist = toObs.length();
        const obsRadius = obs.radius || 0.4;

        // Projection sur le rayon
        const proj = toObs.dot(rayDir);
        if (proj > 0 && proj < rayDist) {
          const perpDist = Math.sqrt(Math.max(0, obsDist * obsDist - proj * proj));
          if (perpDist < obsRadius) {
            // Impact du rayon sur le cylindre de l'obstacle
            const hitDist = proj - Math.sqrt(obsRadius * obsRadius - perpDist * perpDist);
            if (hitDist > 0 && hitDist < rayDist) {
              rayDist = hitDist;
            }
          }
        }
      }

      // Distance minimale
      if (rayDist < minObstacleDist) {
        minObstacleDist = rayDist;
        minObstacleAngle = angle;
      }

      // Mise à jour de la visualisation
      if (this.showLidarRays) {
        const localAngle = (i / this.lidarSamples) * Math.PI * 2;
        positions[i * 3] = Math.cos(localAngle) * rayDist;
        positions[i * 3 + 1] = 0;
        positions[i * 3 + 2] = Math.sin(localAngle) * rayDist;

        // Couleur selon la proximité (rouge si proche, vert/bleu si loin)
        if (rayDist < CONFIG.sensors.obstacleStopDistM) {
          colors[i * 3] = 1.0; colors[i * 3 + 1] = 0.1; colors[i * 3 + 2] = 0.1;
        } else if (rayDist < CONFIG.sensors.obstacleSlowDistM) {
          colors[i * 3] = 1.0; colors[i * 3 + 1] = 0.6; colors[i * 3 + 2] = 0.0;
        } else {
          colors[i * 3] = 0.0; colors[i * 3 + 1] = 0.8; colors[i * 3 + 2] = 1.0;
        }
      }
    }

    this.closestObstacleDistM = minObstacleDist;
    this.closestObstacleAngleRad = minObstacleAngle;

    if (this.showLidarRays) {
      this.lidarPointsMesh.geometry.attributes.position.needsUpdate = true;
      this.lidarPointsMesh.geometry.attributes.color.needsUpdate = true;
    }
  }

  /**
   * Simulation de lecture caméra de QR Code / ArUco
   * Vérifie que le carton se trouve dans le champ de vision (portée et angle)
   */
  scanQRCode(targetBox) {
    if (!targetBox || !targetBox.mesh) return null;

    const camWorldPos = new THREE.Vector3();
    this.cameraAnchor.getWorldPosition(camWorldPos);

    const boxWorldPos = new THREE.Vector3();
    targetBox.mesh.getWorldPosition(boxWorldPos);

    // Distance caméra - carton
    const dist = camWorldPos.distanceTo(boxWorldPos);
    if (dist > this.cameraMaxDistM) {
      return null; // Trop loin
    }

    // Vecteur de visée de la caméra (vers l'avant du robot)
    const forward = new THREE.Vector3(Math.cos(this.robot.heading), 0, Math.sin(this.robot.heading));
    const toBox = new THREE.Vector3().subVectors(boxWorldPos, camWorldPos).normalize();
    const dot = forward.dot(toBox);
    const angleDeg = THREE.MathUtils.radToDeg(Math.acos(THREE.MathUtils.clamp(dot, -1, 1)));

    if (angleDeg > this.cameraMaxAngleDeg) {
      return null; // Hors champ angulaire
    }

    // Décodage réussi de la charge utile ArUco
    this.lastDetectedQR = {
      boxId: targetBox.id,
      targetSlot: targetBox.targetSlot,
      targetShelf: targetBox.targetShelf,
      targetLevel: targetBox.targetLevel,
      targetLevelHeight: targetBox.targetLevelHeight,
      slotLetter: targetBox.slotLetter,
      mass: targetBox.mass,
      confidence: 0.98,
      timestamp: performance.now()
    };

    return this.lastDetectedQR;
  }

  /**
   * Odométrie roues + IMU avec bruit gaussien
   */
  updateOdometry(vx, vy, omega, dt) {
    // Intégration odométrique avec dérive gaussienne
    const noiseX = (Math.random() - 0.5) * 2 * this.noiseStdDevPos * dt;
    const noiseZ = (Math.random() - 0.5) * 2 * this.noiseStdDevPos * dt;
    const noiseTheta = (Math.random() - 0.5) * 2 * this.noiseStdDevOri * dt;

    const cosT = Math.cos(this.odomPose.theta);
    const sinT = Math.sin(this.odomPose.theta);

    const dx = (vx * cosT - vy * sinT) * dt + noiseX;
    const dz = (vx * sinT + vy * cosT) * dt + noiseZ;
    const dTheta = omega * dt + noiseTheta;

    this.odomPose.x += dx;
    this.odomPose.z += dz;
    this.odomPose.theta += dTheta;
  }
}

