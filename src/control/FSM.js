import * as THREE from 'three';
import { CONFIG } from '../config.js';

/**
 * Machine à États Finis (FSM) du cycle de manutention HUMA-LOG :
 * IDLE -> NAVIGATE_TO_A -> DETECT -> PICK -> NAVIGATE_TO_B (+ADJUST_Z) -> PLACE -> RETURN -> boucle.
 * Transitions prioritaires : BATTERY_LOW (25%), BATTERY_CRITICAL (10%), OBSTACLE_STOP, E_STOP, FAULT.
 * Journalisation complète horodatée de chaque transition.
 */
export class FSM {
  constructor(robot, conveyor, shelves, station, navigation, armCoordinator, swapController, batteryModel) {
    this.robot = robot;
    this.conveyor = conveyor;
    this.shelves = shelves;
    this.station = station;
    this.navigation = navigation;
    this.armCoordinator = armCoordinator;
    this.swapController = swapController;
    this.batteryModel = batteryModel;

    // État courant
    this.currentState = 'IDLE';
    this.previousState = null;
    this.stateTimer = 0.0;
    this.nominalDurationS = 0.0;
    this.timeoutS = 120.0;

    // Données de mission en cours
    this.currentBox = null;
    this.secondBox = null; // Pour le mode parallèle (2ème carton)
    this.targetSlotInfo = null;
    this.secondTargetSlotInfo = null;

    // Flags de contrôle
    this.isPaused = false;
    this.isEmergencyStopped = false;
    this.pendingSwapRequest = false;

    // Journal d'historique des transitions (horodatage, état précédent, nouvel état, motif)
    this.history = [];
    this.maxHistoryLength = 50;

    // Métriques de cycle
    this.cycleStartTime = 0;
    this.lastCycleDurationSec = 0;
    this.totalCyclesCompleted = 0;

    this.logTransition('INIT', 'IDLE', 'Démarrage du système HUMA-LOG');
  }

  logTransition(fromState, toState, reason) {
    const entry = {
      timestamp: (performance.now() / 1000).toFixed(2),
      from: fromState,
      to: toState,
      reason: reason
    };
    this.history.unshift(entry);
    if (this.history.length > this.maxHistoryLength) {
      this.history.pop();
    }
  }

  transitionTo(newState, reason = '') {
    if (this.currentState === newState) return;

    this.onExit(this.currentState);
    const oldState = this.currentState;
    this.previousState = oldState;
    this.currentState = newState;
    this.stateTimer = 0.0;

    this.logTransition(oldState, newState, reason);
    this.onEnter(newState);
  }

  onEnter(state) {
    switch (state) {
      case 'IDLE':
        this.robot.stop();
        this.nominalDurationS = 1.0;
        break;

      case 'NAVIGATE_TO_A':
        // Navigation vers le point de prise du convoyeur en Zone A
        // Point d'arrêt devant la butée du convoyeur : X = -3.5, Z = -2.5, face au convoyeur (-X, heading = PI)
        this.nominalDurationS = 12.0;
        this.navigation.startNavigation(-3.5, -2.5, Math.PI);
        // Descente préventive du mât Z en position basse
        this.robot.torso.setTargetHeight(CONFIG.zAxis.carriageHeightMinM);
        break;

      case 'DETECT':
        this.robot.stop();
        this.nominalDurationS = 1.5;
        // Lecture caméra ArUco / QR Code du carton disponible
        const availableBox = this.conveyor.getAvailableBoxAtPickup();
        if (availableBox) {
          const scanResult = this.robot.sensors.scanQRCode(availableBox);
          if (scanResult) {
            this.currentBox = availableBox;
            this.targetSlotInfo = this.shelves.getSlotInfo(scanResult.targetSlot) ||
                                  this.shelves.getAvailableSlot(scanResult.targetShelf, scanResult.targetLevel);
          }
        }
        break;

      case 'PICK':
        this.nominalDurationS = 4.5;
        if (this.currentBox) {
          this.conveyor.removeBoxFromConveyor(this.currentBox);
          this.armCoordinator.startPickSequence(this.currentBox, 'left');
        }
        break;

      case 'PICK_SECOND':
        // Pour le mode parallèle : prise du 2ème carton avec le bras droit
        this.nominalDurationS = 4.5;
        if (this.secondBox) {
          this.conveyor.removeBoxFromConveyor(this.secondBox);
          this.armCoordinator.startPickSequence(this.secondBox, 'right');
        }
        break;

      case 'NAVIGATE_TO_B':
        // Trajet de 8 m vers la Zone B (Allée centrale des étagères X = 3.5m)
        this.nominalDurationS = 16.0;
        const targetZ = this.targetSlotInfo ? this.targetSlotInfo.approachPosition.z : 0.0;
        this.navigation.startNavigation(3.5, targetZ, 0.0);

        // ADJUST_Z SIMULTANÉ : le mât monte pendant le roulage pour gagner du temps de cycle !
        if (this.targetSlotInfo) {
          const targetH = THREE.MathUtils.clamp(
            this.targetSlotInfo.height - 0.15,
            CONFIG.zAxis.carriageHeightMinM,
            CONFIG.zAxis.carriageHeightMaxM
          );
          this.robot.torso.setTargetHeight(targetH);
        }
        break;

      case 'PLACE':
        this.nominalDurationS = 4.0;
        if (this.targetSlotInfo && this.currentBox) {
          this.armCoordinator.startPlaceSequence(this.targetSlotInfo, 'left');
        }
        break;

      case 'PLACE_SECOND':
        // Pour le mode parallèle : dépose du 2ème carton avec le bras droit
        this.nominalDurationS = 4.0;
        if (this.secondTargetSlotInfo && this.secondBox) {
          this.armCoordinator.startPlaceSequence(this.secondTargetSlotInfo, 'right');
        }
        break;

      case 'RETURN':
        // Retour vers la Zone A et descente simultanée du mât Z
        this.nominalDurationS = 12.0;
        this.navigation.startNavigation(-3.5, -2.5, Math.PI);
        this.robot.torso.setTargetHeight(CONFIG.zAxis.carriageHeightMinM);
        break;

      case 'NAVIGATE_TO_CHARGE':
        // Déplacement vers le poste de charge Hot-Swap (X = -3.4, Z = 2.4, heading = PI)
        this.nominalDurationS = 10.0;
        this.navigation.startNavigation(this.station.dockingPosition.x, this.station.dockingPosition.z, this.station.dockingHeading);
        this.robot.torso.setTargetHeight(CONFIG.zAxis.carriageHeightMinM);
        break;

      case 'HOT_SWAP_SEQUENCE':
        this.nominalDurationS = CONFIG.battery.swapNominalDurationS;
        this.swapController.startSwap(this.previousState === 'NAVIGATE_TO_CHARGE' ? 'NAVIGATE_TO_A' : this.previousState);
        break;

      case 'OBSTACLE_STOP':
        this.robot.stop();
        break;

      case 'E_STOP':
        this.robot.stop();
        this.isEmergencyStopped = true;
        break;

      case 'FAULT':
        this.robot.stop();
        break;
    }
  }

  onExit(state) {
    if (state === 'PLACE' && this.currentBox && this.targetSlotInfo) {
      this.shelves.depositBox(this.targetSlotInfo.id, this.currentBox);
      this.currentBox = null;
    }
    if (state === 'PLACE_SECOND' && this.secondBox && this.secondTargetSlotInfo) {
      this.shelves.depositBox(this.secondTargetSlotInfo.id, this.secondBox);
      this.secondBox = null;
    }
  }

  /**
   * Déclenchement manuel ou commande UI d'un échange de batterie
   */
  requestBatterySwap() {
    this.pendingSwapRequest = true;
  }

  triggerEmergencyStop(enable = true) {
    if (enable) {
      this.transitionTo('E_STOP', 'Arrêt d\'urgence enclenché');
    } else {
      this.isEmergencyStopped = false;
      this.transitionTo('IDLE', 'Réarmement arrêt d\'urgence');
    }
  }

  /**
   * Boucle d'exécution FSM
   */
  update(dt, dynamicObstacles = [], speedScale = 1.0) {
    if (this.isPaused) return;

    const effectiveDt = dt * speedScale;
    this.stateTimer += effectiveDt;

    // --- CONTRÔLES PRIORITAIRES DE SÉCURITÉ ---
    if (this.isEmergencyStopped) {
      if (this.currentState !== 'E_STOP') {
        this.transitionTo('E_STOP', 'Arrêt d\'urgence actif');
      }
      return;
    }

    // 1. Contrôle batterie critique (< 10%) : interruption prioritaire immédiate
    if (this.batteryModel.soc <= (CONFIG.battery.criticalThresholdPercent / 100)) {
      if (this.currentState !== 'NAVIGATE_TO_CHARGE' && this.currentState !== 'HOT_SWAP_SEQUENCE') {
        this.transitionTo('NAVIGATE_TO_CHARGE', 'Niveau batterie CRITIQUE (< 10%)');
        return;
      }
    }

    // 2. Contrôle de présence d'obstacle dans l'allée (LiDAR)
    if (this.robot.sensors.closestObstacleDistM < CONFIG.sensors.obstacleStopDistM &&
        (this.currentState === 'NAVIGATE_TO_A' || this.currentState === 'NAVIGATE_TO_B' || this.currentState === 'RETURN' || this.currentState === 'NAVIGATE_TO_CHARGE')) {
      if (this.currentState !== 'OBSTACLE_STOP') {
        this.transitionTo('OBSTACLE_STOP', `Obstacle détecté à ${this.robot.sensors.closestObstacleDistM.toFixed(2)} m`);
        return;
      }
    }

    // --- MACHINE D'ÉTATS PRINCIPALE ---
    switch (this.currentState) {
      case 'IDLE':
        // Démarrage d'un nouveau cycle
        this.cycleStartTime = performance.now();
        this.transitionTo('NAVIGATE_TO_A', 'Démarrage du cycle');
        break;

      case 'NAVIGATE_TO_A':
        const navResA = this.navigation.update(effectiveDt, dynamicObstacles);
        if (navResA.isDone) {
          this.transitionTo('DETECT', 'Arrivée en Zone A (Convoyeur)');
        }
        break;

      case 'DETECT':
        // Attente de détection et lecture du code ArUco
        if (this.currentBox && this.targetSlotInfo) {
          this.transitionTo('PICK', `Code lu: ${this.currentBox.targetSlot} (${this.currentBox.mass.toFixed(2)} kg)`);
        } else {
          // Si aucun colis n'est encore arrivé en butée, vérification continue
          const box = this.conveyor.getAvailableBoxAtPickup();
          if (box) {
            const scan = this.robot.sensors.scanQRCode(box);
            if (scan) {
              this.currentBox = box;
              this.targetSlotInfo = this.shelves.getSlotInfo(scan.targetSlot) ||
                                    this.shelves.getAvailableSlot(scan.targetShelf, scan.targetLevel);
            }
          }
          if (this.stateTimer > 8.0) {
            // Forcer le spawn d'un colis si convoyeur vide
            this.conveyor.spawnBox(true);
          }
        }
        break;

      case 'PICK':
        const armPickRes = this.armCoordinator.update(dt, speedScale);
        if (armPickRes.isDone) {
          if (armPickRes.phase === 'DONE_PICK') {
            // Si mode parallèle activé et 2ème carton disponible, le prendre
            if (this.armCoordinator.mode === 'parallel' && !this.secondBox) {
              const nextBox = this.conveyor.getAvailableBoxAtPickup();
              if (nextBox) {
                const scan2 = this.robot.sensors.scanQRCode(nextBox);
                this.secondBox = nextBox;
                this.secondTargetSlotInfo = scan2 ? (this.shelves.getSlotInfo(scan2.targetSlot) || this.shelves.getAvailableSlot()) : null;
                this.transitionTo('PICK_SECOND', 'Mode parallèle : Prise du 2ème carton');
                break;
              }
            }
            this.transitionTo('NAVIGATE_TO_B', 'Colis saisi avec succès');
          } else {
            // Échec de prise : nouvel essai
            this.transitionTo('DETECT', 'Nouvel essai de détection/prise');
          }
        }
        break;

      case 'PICK_SECOND':
        const armPickRes2 = this.armCoordinator.update(dt, speedScale);
        if (armPickRes2.isDone) {
          this.transitionTo('NAVIGATE_TO_B', 'Deux colis saisis (Mode Parallèle)');
        }
        break;

      case 'NAVIGATE_TO_B':
        const navResB = this.navigation.update(effectiveDt, dynamicObstacles);
        if (navResB.isDone) {
          this.transitionTo('PLACE', 'Arrivée en Zone B devant l\'alvéole');
        }
        break;

      case 'PLACE':
        const armPlaceRes = this.armCoordinator.update(dt, speedScale);
        if (armPlaceRes.isDone) {
          if (this.armCoordinator.mode === 'parallel' && this.secondBox) {
            this.transitionTo('PLACE_SECOND', 'Dépose du second carton');
          } else {
            this.completeCycleAndEvaluateNext();
          }
        }
        break;

      case 'PLACE_SECOND':
        const armPlaceRes2 = this.armCoordinator.update(dt, speedScale);
        if (armPlaceRes2.isDone) {
          this.completeCycleAndEvaluateNext();
        }
        break;

      case 'RETURN':
        const navResReturn = this.navigation.update(effectiveDt, dynamicObstacles);
        if (navResReturn.isDone) {
          // Vérification fin de cycle : seuil batterie faible (25%) ou demande de swap
          if (this.batteryModel.soc <= (CONFIG.battery.lowThresholdPercent / 100) || this.pendingSwapRequest) {
            this.pendingSwapRequest = false;
            this.transitionTo('NAVIGATE_TO_CHARGE', 'Batterie faible (< 25%) ou demande de Hot-Swap');
          } else {
            this.transitionTo('DETECT', 'Nouveau cycle de prise');
          }
        }
        break;

      case 'NAVIGATE_TO_CHARGE':
        const navResCharge = this.navigation.update(effectiveDt, dynamicObstacles);
        if (navResCharge.isDone) {
          this.transitionTo('HOT_SWAP_SEQUENCE', 'Accostage à la baie de swap terminé');
        }
        break;

      case 'HOT_SWAP_SEQUENCE':
        const swapRes = this.swapController.update(dt, speedScale);
        if (swapRes.isDone) {
          if (swapRes.step === 'COMPLETED') {
            this.transitionTo('NAVIGATE_TO_A', 'Hot-Swap terminé avec succès - Reprise de mission');
          } else if (swapRes.step === 'FAULT') {
            this.transitionTo('FAULT', `Défaut Hot-Swap : ${swapRes.faultReason}`);
          }
        }
        break;

      case 'OBSTACLE_STOP':
        // Arrêt tant que l'obstacle est présent, puis reprise dès qu'il est dégagé
        if (this.robot.sensors.closestObstacleDistM >= CONFIG.sensors.obstacleSlowDistM) {
          this.transitionTo(this.previousState || 'NAVIGATE_TO_A', 'Obstacle dégagé - Reprise');
        }
        break;
    }
  }

  completeCycleAndEvaluateNext() {
    this.totalCyclesCompleted++;
    const now = performance.now();
    this.lastCycleDurationSec = (now - this.cycleStartTime) / 1000;

    // Vérification seuil batterie faible (< 25%)
    if (this.batteryModel.soc <= (CONFIG.battery.lowThresholdPercent / 100) || this.pendingSwapRequest) {
      this.pendingSwapRequest = false;
      this.transitionTo('NAVIGATE_TO_CHARGE', 'Cycle terminé -> Déroutement vers Station Hot-Swap');
    } else {
      this.transitionTo('RETURN', 'Cycle terminé -> Retour Zone A');
    }
  }

  reset() {
    this.currentState = 'IDLE';
    this.previousState = null;
    this.stateTimer = 0.0;
    this.currentBox = null;
    this.secondBox = null;
    this.targetSlotInfo = null;
    this.isPaused = false;
    this.isEmergencyStopped = false;
    this.pendingSwapRequest = false;
    this.logTransition('RESET', 'IDLE', 'Réinitialisation système');
  }
}

