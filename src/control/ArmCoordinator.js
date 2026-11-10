import * as THREE from 'three';
import { CONFIG } from '../config.js';

/**
 * Coordinateur des deux bras robotiques 5-DDL :
 * Gère les trajectoires cinématiques de prise (Pick) et dépose (Place),
 * la synchronisation avec le mât Z et le vide,
 * et les deux modes d'opération :
 *  - Mode 1: Alterné (un bras saisit, l'autre dépose)
 *  - Mode 2: Parallèle (deux cartons transportés simultanément)
 */
export class ArmCoordinator {
  constructor(robot) {
    this.robot = robot;
    this.mode = CONFIG.arms.defaultMode; // "alternate" ou "parallel"

    // État courant de la séquence de manipulation
    this.currentArm = 'left'; // Bras actif pour le cycle
    this.actionPhase = 'IDLE'; // 'APPROACH', 'LOWER', 'SUCTION_WAIT', 'LIFT', 'RETRACT', 'EXTEND_SLOT', 'BLOW_OFF', 'DONE'
    this.phaseTimer = 0.0;
    this.activeTargetBox = null;
    this.targetSlot = null;

    // Métriques pour comparaison des modes
    this.boxesProcessed = 0;
    this.pickSuccesses = 0;
    this.placeSuccesses = 0;
  }

  setMode(mode) {
    if (mode === 'alternate' || mode === 'parallel') {
      this.mode = mode;
    }
  }

  getArm(side) {
    return side === 'left' ? this.robot.leftArm : this.robot.rightArm;
  }

  /**
   * Initialise une séquence de prise d'un carton (PICK)
   */
  startPickSequence(boxData, armSide = null) {
    this.currentArm = armSide || (this.mode === 'parallel' && this.robot.leftArm.gripper.attachedBox ? 'right' : 'left');
    this.activeTargetBox = boxData;
    this.actionPhase = 'APPROACH';
    this.phaseTimer = 0.0;

    const arm = this.getArm(this.currentArm);
    // Pré-positionnement en hauteur Z pour être juste au-dessus du convoyeur
    this.robot.torso.setTargetHeight(CONFIG.zAxis.carriageHeightMinM);

    // Position d'approche au-dessus du colis dans le repère local de la base du bras
    // Le carton est devant le robot
    const approachPos = new THREE.Vector3(
      this.currentArm === 'left' ? 0.05 : -0.05,
      -0.02,
      0.24
    );
    arm.solveIK(approachPos, -Math.PI / 2);
  }

  /**
   * Initialise une séquence de dépose d'un carton dans l'alvéole cible (PLACE)
   */
  startPlaceSequence(slotInfo, armSide = null) {
    this.currentArm = armSide || (this.robot.leftArm.gripper.attachedBox ? 'left' : 'right');
    this.targetSlot = slotInfo;
    this.actionPhase = 'EXTEND_SLOT';
    this.phaseTimer = 0.0;

    const arm = this.getArm(this.currentArm);

    // Ajustement de la hauteur du torse Z pour s'aligner exactement avec le plateau de l'étagère
    // Plateau à 30, 70 ou 110 cm -> le torse compense la hauteur
    const targetTorsoH = THREE.MathUtils.clamp(
      slotInfo.height - 0.15,
      CONFIG.zAxis.carriageHeightMinM,
      CONFIG.zAxis.carriageHeightMaxM
    );
    this.robot.torso.setTargetHeight(targetTorsoH);

    // Extension du bras vers l'intérieur de l'alvéole
    const slotExtendPos = new THREE.Vector3(
      slotInfo.faceSign === 1 ? -0.12 : 0.12,
      -0.04,
      0.26
    );
    arm.solveIK(slotExtendPos, -Math.PI / 2);
  }

  /**
   * Mise à jour de la machine de coordination des bras
   */
  update(dt, speedScale = 1.0) {
    const effectiveDt = dt * speedScale;
    const arm = this.getArm(this.currentArm);
    const gripper = arm.gripper;

    if (this.actionPhase === 'IDLE' || this.actionPhase === 'DONE') {
      return { phase: this.actionPhase, isDone: true };
    }

    this.phaseTimer += effectiveDt;

    switch (this.actionPhase) {
      // --- SÉQUENCE DE PRISE (PICK) ---
      case 'APPROACH':
        if (arm.isTargetReached(0.04) && this.robot.torso.isTargetReached(0.01)) {
          // Descente sur le carton
          this.actionPhase = 'LOWER';
          this.phaseTimer = 0.0;
          const contactPos = new THREE.Vector3(
            this.currentArm === 'left' ? 0.05 : -0.05,
            -0.10, // Descente au contact
            0.24
          );
          arm.solveIK(contactPos, -Math.PI / 2);
        }
        break;

      case 'LOWER':
        if (arm.isTargetReached(0.04) || this.phaseTimer > 1.2) {
          // Activation de la mini-pompe à vide
          gripper.startPump();
          this.actionPhase = 'SUCTION_WAIT';
          this.phaseTimer = 0.0;
        }
        break;

      case 'SUCTION_WAIT':
        // Attente de l'établissement du vide (-35 kPa seuil d'accroche)
        if (gripper.currentPressureKPa <= CONFIG.suction.thresholdPressureKPa) {
          const attached = gripper.tryAttachBox(this.activeTargetBox);
          if (attached) {
            this.pickSuccesses++;
            // Levage du carton de 10 cm (+0.10 m)
            this.actionPhase = 'LIFT';
            this.phaseTimer = 0.0;
            const liftPos = new THREE.Vector3(
              this.currentArm === 'left' ? 0.05 : -0.05,
              0.02,
              0.22
            );
            arm.solveIK(liftPos, -Math.PI / 2);
          }
        }
        // Timeout de sécurité si vide impossible (ex: fuite)
        if (this.phaseTimer > 2.0 && !gripper.hasGrasp) {
          gripper.release();
          arm.setRestPose();
          this.actionPhase = 'DONE';
          return { phase: 'FAILED_PICK', isDone: true };
        }
        break;

      case 'LIFT':
        if (arm.isTargetReached(0.04) || this.phaseTimer > 1.0) {
          // Repli sécurisé en position de transport
          this.actionPhase = 'RETRACT';
          this.phaseTimer = 0.0;
          arm.setCarryPose();
        }
        break;

      case 'RETRACT':
        if (arm.isTargetReached(0.04) || this.phaseTimer > 1.2) {
          this.actionPhase = 'DONE';
          return { phase: 'DONE_PICK', isDone: true };
        }
        break;

      // --- SÉQUENCE DE DÉPOSE (PLACE) ---
      case 'EXTEND_SLOT':
        if (arm.isTargetReached(0.04) && this.robot.torso.isTargetReached(0.015)) {
          // Rupture du vide via l'électrovanne de lâcher
          gripper.release();
          this.actionPhase = 'BLOW_OFF';
          this.phaseTimer = 0.0;
        }
        break;

      case 'BLOW_OFF':
        if (this.phaseTimer >= 0.25) {
          this.placeSuccesses++;
          this.boxesProcessed++;
          // Retrait du bras de l'alvéole
          this.actionPhase = 'RETRACT_FROM_SLOT';
          this.phaseTimer = 0.0;
          arm.setRestPose();
        }
        break;

      case 'RETRACT_FROM_SLOT':
        if (arm.isTargetReached(0.05) || this.phaseTimer > 1.2) {
          this.actionPhase = 'DONE';
          return { phase: 'DONE_PLACE', isDone: true };
        }
        break;
    }

    return { phase: this.actionPhase, isDone: false };
  }
}

