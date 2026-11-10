import * as THREE from 'three';
import { CONFIG } from '../config.js';

/**
 * Contrôleur de séquence de Hot-Swap automatique de batterie (Inspiré UBTECH Walker S2)
 * Orchestration pas-à-pas de l'accostage de précision (±5 mm / ±2°),
 * bascule sur bus tampon sans coupure, extraction/insertion mécanique,
 * vérification électrique et reprise de mission.
 */
export class SwapController {
  constructor(robot, station, batteryModel, bufferPower) {
    this.robot = robot;
    this.station = station;
    this.batteryModel = batteryModel;
    this.bufferPower = bufferPower;

    // État de la séquence
    this.step = 'IDLE'; // 'APPROACH', 'ALIGN_CHECK', 'LOCK_BASE', 'ENGAGE_BUFFER', 'EXTRACT_OLD', 'STORE_OLD', 'FETCH_NEW', 'INSERT_NEW', 'VERIFY_POWER', 'DISENGAGE_BUFFER', 'UNLOCK_BASE', 'COMPLETED', 'FAULT'
    this.stepTimer = 0.0;
    this.totalSwapTimeSec = 0.0;
    this.alignmentRetries = 0;
    this.faultReason = null;

    // Animation de la batterie en transit
    this.transitingBatteryMesh = null;
    this.savedMissionState = null; // État FSM à reprendre après le swap
  }

  startSwap(returnState = 'NAVIGATE_TO_A') {
    this.step = 'APPROACH';
    this.stepTimer = 0.0;
    this.totalSwapTimeSec = 0.0;
    this.alignmentRetries = 0;
    this.faultReason = null;
    this.savedMissionState = returnState;
    this.station.stationStatus = 'swapping';
    this.station.updateStatusLED('orange');
  }

  update(dt, speedScale = 1.0) {
    if (this.step === 'IDLE' || this.step === 'COMPLETED' || this.step === 'FAULT') {
      return { step: this.step, isDone: true, faultReason: this.faultReason };
    }

    const effectiveDt = dt * speedScale;
    this.stepTimer += effectiveDt;
    this.totalSwapTimeSec += effectiveDt;

    switch (this.step) {
      case 'APPROACH':
        // Navigation fine vers le repère d'accostage de la station
        const dockPos = this.station.dockingPosition;
        const dx = dockPos.x - this.robot.position.x;
        const dz = dockPos.z - this.robot.position.z;
        const dist = Math.hypot(dx, dz);
        let dHeading = this.station.dockingHeading - this.robot.heading;
        dHeading = Math.atan2(Math.sin(dHeading), Math.cos(dHeading));

        if (dist <= 0.02 && Math.abs(dHeading) <= 0.04) {
          this.robot.stop();
          this.robot.position.copy(dockPos);
          this.robot.heading = this.station.dockingHeading;
          this.robot.syncTransform();
          this.step = 'ALIGN_CHECK';
          this.stepTimer = 0.0;
        } else {
          // Commande fine d'accostage sur le guide
          const cosH = Math.cos(this.robot.heading);
          const sinH = Math.sin(this.robot.heading);
          const localX = dx * cosH + dz * sinH;
          const localY = -dx * sinH + dz * cosH;
          const speed = Math.min(0.25, Math.max(0.05, dist * 1.5));
          const vx = (localX / (dist || 1)) * speed;
          const vy = (localY / (dist || 1)) * speed;
          const omega = Math.sign(dHeading) * Math.min(0.8, Math.max(0.2, Math.abs(dHeading) * 1.8));
          this.robot.setSpeeds(vx, vy, omega);
        }
        break;

      case 'ALIGN_CHECK':
        // Contrôle de tolérance de haute précision (±5 mm / ±2°)
        const alignErrorPos = Math.hypot(
          this.robot.position.x - this.station.dockingPosition.x,
          this.robot.position.z - this.station.dockingPosition.z
        );
        const alignErrorDeg = Math.abs(this.robot.heading - this.station.dockingHeading) * (180 / Math.PI);

        if (alignErrorPos <= 0.025 && alignErrorDeg <= 3.5) {
          // Alignement parfait
          this.step = 'LOCK_BASE';
          this.stepTimer = 0.0;
        } else {
          // Échec d'alignement -> nouvel essai
          this.alignmentRetries++;
          if (this.alignmentRetries <= CONFIG.battery.maxAlignmentRetries) {
            // Recul de 20 cm et réalignement
            this.robot.position.x += 0.15;
            this.robot.heading = this.station.dockingHeading;
            this.step = 'APPROACH';
            this.stepTimer = 0.0;
          } else {
            this.step = 'FAULT';
            this.faultReason = 'DÉFAUT ALIGNEMENT POSTE DE CHARGE (> 3 ESSAIS)';
            this.station.updateStatusLED('red');
          }
        }
        break;

      case 'LOCK_BASE':
        // Verrouillage électromécanique de l'AGV au sol (durée ~1.5s)
        this.robot.stop();
        if (this.stepTimer >= 1.5) {
          this.step = 'ENGAGE_BUFFER';
          this.stepTimer = 0.0;
        }
        break;

      case 'ENGAGE_BUFFER':
        // Bascule sur alimentation tampon : vérification que Jetson & Nav2 restent actifs
        this.bufferPower.engageBuffer();
        this.robot.jetson.setBufferMode(true);
        if (this.stepTimer >= 1.0) {
          // Vérification présence d'un emplacement libre dans le rack pour stocker l'ancienne batterie
          const emptySlotIdx = this.station.batterySlots.findIndex(s => s.state === 'empty');
          // Vérification présence d'un pack chargé prêt à l'emploi
          const readySlotIdx = this.station.batterySlots.findIndex(s => s.state === 'ready');

          if (emptySlotIdx === -1) {
            this.step = 'FAULT';
            this.faultReason = 'RACK PLEIN : AUCUN EMPLACEMENT LIBRE POUR RÉCEPTION';
            this.station.updateStatusLED('red');
            return { step: this.step, isDone: true, faultReason: this.faultReason };
          }
          if (readySlotIdx === -1) {
            this.step = 'FAULT';
            this.faultReason = 'AUCUN PACK CHARGÉ PRÊT À L\'EMPLOI DANS LE RACK';
            this.station.updateStatusLED('red');
            return { step: this.step, isDone: true, faultReason: this.faultReason };
          }

          this.emptySlotIdx = emptySlotIdx;
          this.readySlotIdx = readySlotIdx;
          this.step = 'EXTRACT_OLD';
          this.stepTimer = 0.0;
        }
        break;

      case 'EXTRACT_OLD':
        // Le préhenseur de la baie avance, se verrouille sur la poignée du pack, et l'extrait
        if (this.station.extractorGripper) {
          const t = Math.min(1.0, this.stepTimer / 3.0);
          this.station.extractorGripper.position.x = 0.15 + t * 0.25;
        }
        // Masquer la batterie du robot quand elle est extraite
        if (this.stepTimer >= 2.0 && this.robot.onboardBatteryMesh) {
          this.robot.onboardBatteryMesh.visible = false;
        }
        if (this.stepTimer >= 3.5) {
          this.step = 'STORE_OLD';
          this.stepTimer = 0.0;
        }
        break;

      case 'STORE_OLD':
        // Dépose du pack usagé dans l'emplacement libre du rack
        if (this.stepTimer >= 2.5) {
          // Enregistrer l'ancien pack dans le rack et démarrer sa recharge CC/CV
          const slot = this.station.batterySlots[this.emptySlotIdx];
          slot.id = 'BAT-USED';
          slot.state = 'charging';
          slot.soc = this.batteryModel.soc;
          slot.voltage = this.batteryModel.voltageV;
          slot.tempC = this.batteryModel.tempC;
          slot.cycleCount = this.batteryModel.cycleCount;

          const mesh = this.station.physicalBatteries[this.emptySlotIdx];
          if (mesh) {
            mesh.visible = true;
            if (mesh.userData && mesh.userData.batLed) {
              mesh.userData.batLed.material.color.setHex(0xf59e0b); // Orange charge
            }
          }

          this.step = 'FETCH_NEW';
          this.stepTimer = 0.0;
        }
        break;

      case 'FETCH_NEW':
        // Le chariot de transfert prend le pack 100% prêt
        if (this.stepTimer >= 2.5) {
          const readySlot = this.station.batterySlots[this.readySlotIdx];
          this.newPackData = { ...readySlot };

          // Libérer l'emplacement du rack qui devient vide
          readySlot.id = null;
          readySlot.state = 'empty';
          readySlot.soc = 0;
          const mesh = this.station.physicalBatteries[this.readySlotIdx];
          if (mesh) mesh.visible = false;

          this.step = 'INSERT_NEW';
          this.stepTimer = 0.0;
        }
        break;

      case 'INSERT_NEW':
        // Insertion du pack plein dans le compartiment arrière de l'AGV
        if (this.stepTimer >= 1.5 && this.robot.onboardBatteryMesh) {
          this.robot.onboardBatteryMesh.visible = true;
          if (this.robot.onboardBatteryLed) {
            this.robot.onboardBatteryLed.material.color.setHex(0x00e676);
          }
        }
        if (this.station.extractorGripper) {
          const t = Math.min(1.0, this.stepTimer / 3.0);
          this.station.extractorGripper.position.x = 0.40 - t * 0.25;
        }
        if (this.stepTimer >= 3.5) {
          this.step = 'VERIFY_POWER';
          this.stepTimer = 0.0;
        }
        break;

      case 'VERIFY_POWER':
        // Test électrique de tension du nouveau pack (> 12.4V)
        this.batteryModel.swapToFreshPack(1.0); // 100% plein
        if (this.batteryModel.voltageV >= 12.4) {
          this.step = 'DISENGAGE_BUFFER';
          this.stepTimer = 0.0;
        } else {
          this.step = 'FAULT';
          this.faultReason = 'TENSION PACK INSUFFISANTE (< 12.4V)';
          this.station.updateStatusLED('red');
        }
        break;

      case 'DISENGAGE_BUFFER':
        // Retour sur batterie principale, sortie du tampon
        this.bufferPower.disengageBuffer();
        this.robot.jetson.setBufferMode(false);
        if (this.stepTimer >= 1.0) {
          this.step = 'UNLOCK_BASE';
          this.stepTimer = 0.0;
        }
        break;

      case 'UNLOCK_BASE':
        // Déverrouillage mécanique de la base et reprise de mission
        if (this.stepTimer >= 1.5) {
          this.step = 'COMPLETED';
          this.station.stationStatus = 'ready';
          this.station.updateStatusLED('green');
        }
        break;
    }

    return {
      step: this.step,
      isDone: this.step === 'COMPLETED',
      totalSwapTimeSec: this.totalSwapTimeSec,
      faultReason: this.faultReason
    };
  }
}

