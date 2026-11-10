import { CONFIG } from '../config.js';

/**
 * Modèle dynamique d'agrégation de puissance électrique :
 * P_tot = P_mecanum(vx, vy, omega) + P_zAxis(vz, mass) + P_arms(servos) + P_vacuum + P_jetson + P_lidar + P_aux
 */
export class PowerConsumption {
  constructor(robot) {
    this.robot = robot;
    this.totalPowerW = 0.0;
    this.criticalPowerW = 0.0; // Puissance critique maintenue par l'alimentation tampon

    this.breakdown = {
      mecanumBaseW: 0.0,
      zAxisW: 0.0,
      armsW: 0.0,
      vacuumW: 0.0,
      jetsonW: 0.0,
      lidarW: 0.0,
      auxW: CONFIG.power.auxLogicW
    };
  }

  update(fsmState = 'IDLE') {
    // 1. Base Mecanum (puissance fonction des vitesses linéaires et angulaires)
    const linSpeed = Math.hypot(this.robot.vx, this.robot.vy);
    const angSpeed = Math.abs(this.robot.omega);
    const isMoving = linSpeed > 0.01 || angSpeed > 0.02;

    if (isMoving) {
      // Puissance dynamique moteurs Mecanum
      const speedNorm = Math.min(1.0, linSpeed / CONFIG.agv.maxLinearSpeedMs);
      const angNorm = Math.min(1.0, angSpeed / CONFIG.agv.maxAngularSpeedRadS);
      this.breakdown.mecanumBaseW = CONFIG.power.mecanumBaseIdleW + (CONFIG.power.mecanumMaxW - CONFIG.power.mecanumBaseIdleW) * (0.7 * speedNorm + 0.3 * angNorm);
    } else {
      this.breakdown.mecanumBaseW = CONFIG.power.mecanumBaseIdleW;
    }

    // 2. Axe vertical Z (Torse télescopique)
    let payloadMass = 0;
    if (this.robot.leftArm.gripper.attachedBox) payloadMass += this.robot.leftArm.gripper.attachedBox.mass;
    if (this.robot.rightArm.gripper.attachedBox) payloadMass += this.robot.rightArm.gripper.attachedBox.mass;
    this.breakdown.zAxisW = this.robot.torso.getMechanicalPowerW(payloadMass);

    // 3. Servomoteurs STS3215 des 2 bras (10 servos au total)
    // 1W de maintien par servo + supplément si le bras est en mouvement
    let armsMoving = false;
    if (!this.robot.leftArm.isTargetReached(0.05) || !this.robot.rightArm.isTargetReached(0.05)) {
      armsMoving = true;
    }
    const perServoW = armsMoving ? CONFIG.power.servoMovingW : CONFIG.power.servoIdleW;
    this.breakdown.armsW = 10 * perServoW;

    // 4. Pompe à vide
    const pumpLeft = this.robot.leftArm.gripper.isPumpOn;
    const pumpRight = this.robot.rightArm.gripper.isPumpOn;
    this.breakdown.vacuumW = (pumpLeft ? CONFIG.power.vacuumPumpW : 0) + (pumpRight ? CONFIG.power.vacuumPumpW : 0);

    // 5. Calculateur NVIDIA Jetson Orin
    this.breakdown.jetsonW = this.robot.jetson.powerW;

    // 6. LiDAR RPLIDAR A1M8
    this.breakdown.lidarW = this.robot.sensors.isLidarActive ? CONFIG.power.lidarW : 0.5;

    // 7. Auxiliaires (voyants, ventilateurs, BMS)
    this.breakdown.auxW = CONFIG.power.auxLogicW;

    // Totalisation
    this.totalPowerW = this.breakdown.mecanumBaseW +
                       this.breakdown.zAxisW +
                       this.breakdown.armsW +
                       this.breakdown.vacuumW +
                       this.breakdown.jetsonW +
                       this.breakdown.lidarW +
                       this.breakdown.auxW;

    // Puissance critique nécessaire au calculateur, LiDAR, capteurs et électronique de contrôle
    this.criticalPowerW = this.breakdown.jetsonW + this.breakdown.lidarW + this.breakdown.auxW;

    return {
      totalPowerW: this.totalPowerW,
      criticalPowerW: this.criticalPowerW,
      breakdown: this.breakdown
    };
  }
}

