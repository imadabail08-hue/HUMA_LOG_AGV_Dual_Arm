/**
 * Système d'injection de pannes et scénarios de défaillance (Fault Injection)
 * Permet de tester la résilience et les sécurités matérielles/logicielles du jumeau numérique.
 */
export class FaultInjector {
  constructor(robot, fsm, obstacleManager, batteryModel) {
    this.robot = robot;
    this.fsm = fsm;
    this.obstacleManager = obstacleManager;
    this.batteryModel = batteryModel;
  }

  injectObstacleInAisle() {
    // Place un obstacle au milieu du trajet Zone A -> Zone B
    this.obstacleManager.toggle(true, 0.0, -1.0);
  }

  removeObstacle() {
    this.obstacleManager.toggle(false);
  }

  injectVacuumLoss() {
    // Provoque une fuite brutale sur le préhenseur actif
    if (this.robot.leftArm.gripper.hasGrasp) {
      this.robot.leftArm.gripper.setLeakage(true);
    }
    if (this.robot.rightArm.gripper.hasGrasp) {
      this.robot.rightArm.gripper.setLeakage(true);
    }
  }

  restoreVacuum() {
    this.robot.leftArm.gripper.setLeakage(false);
    this.robot.rightArm.gripper.setLeakage(false);
  }

  injectLowBattery(socPercent = 18) {
    this.batteryModel.setSoC(socPercent);
  }

  injectCriticalBattery(socPercent = 8) {
    this.batteryModel.setSoC(socPercent);
  }

  injectLidarCut(cut = true) {
    this.robot.sensors.isLidarActive = !cut;
  }

  injectAlignmentError() {
    // Décale le robot de 35 mm au poste de charge pour dépasser la tolérance de 5 mm
    this.robot.position.z += 0.035;
    this.robot.syncTransform();
  }

  triggerEmergencyStop(enable = true) {
    this.fsm.triggerEmergencyStop(enable);
  }
}

