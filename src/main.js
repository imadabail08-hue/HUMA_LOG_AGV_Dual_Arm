import * as THREE from 'three';
import { CONFIG } from './config.js';
import { FactoryEnvironment } from './scene/FactoryEnvironment.js';
import { ConveyorZoneA } from './scene/ConveyorZoneA.js';
import { ShelvesZoneB } from './scene/ShelvesZoneB.js';
import { ChargingStation } from './scene/ChargingStation.js';

import { RobotModel } from './robot/RobotModel.js';
import { BatteryModel } from './power/BatteryModel.js';
import { BufferPower } from './power/BufferPower.js';
import { PowerConsumption } from './power/PowerConsumption.js';

import { Navigation } from './control/Navigation.js';
import { ArmCoordinator } from './control/ArmCoordinator.js';
import { SwapController } from './control/SwapController.js';
import { FSM } from './control/FSM.js';

import { PhysicsManager } from './sim/PhysicsManager.js';
import { ObstacleManager } from './sim/ObstacleManager.js';
import { FaultInjector } from './sim/FaultInjector.js';
import { KPIManager } from './sim/KPIManager.js';
import { ScenarioRunner } from './sim/ScenarioRunner.js';
import { RosBridgeMock } from './sim/RosBridgeMock.js';

import { CameraManager } from './ui/CameraManager.js';
import { TelemetryCharts } from './ui/TelemetryCharts.js';
import { ScenarioPanel } from './ui/ScenarioPanel.js';
import { ControlPanel } from './ui/ControlPanel.js';

/**
 * Point d'entrée principal du Jumeau Numérique HUMA-LOG
 */
class SimulationApp {
  constructor() {
    this.container = document.getElementById('canvas-container');
    this.uiContainer = document.getElementById('ui-container');

    this.initThree();
    this.initScene();
    this.initRobotAndSubsystems();
    this.initUI();

    // Boucle de simulation à pas fixe (60 Hz) découplée du rendu graphique
    this.fixedDt = CONFIG.system.fixedTimeStepSec;
    this.accumulator = 0.0;
    this.lastTime = performance.now();

    window.addEventListener('resize', () => this.onWindowResize());
    this.animate();
  }

  initThree() {
    // 1. Scène Three.js
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a0f1d);
    this.scene.fog = new THREE.FogExp2(0x0a0f1d, 0.035);

    // 2. Caméra de perspective
    const aspect = window.innerWidth / window.innerHeight;
    this.camera = new THREE.PerspectiveCamera(50, aspect, 0.1, 50);

    // 3. Renderer WebGL avec ombres douces et mappage de tons
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;

    this.container.appendChild(this.renderer.domElement);
  }

  initScene() {
    // Environnement d'usine, zones et éclairage
    this.factory = new FactoryEnvironment(this.scene);
    this.conveyor = new ConveyorZoneA(this.scene);
    this.shelves = new ShelvesZoneB(this.scene);
    this.chargingStation = new ChargingStation(this.scene);

    // Gestionnaires de simulation
    this.physicsManager = new PhysicsManager(this.scene);
    this.obstacleManager = new ObstacleManager(this.scene);
  }

  initRobotAndSubsystems() {
    // Robot complet (base Mecanum + mât Z + bras + ventouses + capteurs + Jetson)
    this.robot = new RobotModel(this.scene);

    // Système d'alimentation électrique
    this.batteryModel = new BatteryModel(1.0);
    this.bufferPower = new BufferPower();
    this.powerConsumption = new PowerConsumption(this.robot);

    // Navigation et cinématique
    this.navigation = new Navigation(this.robot);
    this.armCoordinator = new ArmCoordinator(this.robot);
    this.swapController = new SwapController(this.robot, this.chargingStation, this.batteryModel, this.bufferPower);

    // Machine à états principale (FSM)
    this.fsm = new FSM(
      this.robot,
      this.conveyor,
      this.shelves,
      this.chargingStation,
      this.navigation,
      this.armCoordinator,
      this.swapController,
      this.batteryModel
    );

    // Fautes et KPIs
    this.faultInjector = new FaultInjector(this.robot, this.fsm, this.obstacleManager, this.batteryModel);
    this.kpiManager = new KPIManager(this.fsm, this.batteryModel, this.armCoordinator);

    // Scénarios de qualification S1 à S9
    this.scenarioRunner = new ScenarioRunner({
      robot: this.robot,
      fsm: this.fsm,
      conveyor: this.conveyor,
      shelves: this.shelves,
      chargingStation: this.chargingStation,
      faultInjector: this.faultInjector,
      bufferPower: this.bufferPower,
      kpiManager: this.kpiManager
    });

    // Pont ROS 2 mock
    this.rosBridge = new RosBridgeMock(this.robot, this.batteryModel);
  }

  initUI() {
    // Gestionnaire de caméras
    this.cameraManager = new CameraManager(this.camera, this.renderer.domElement, this.robot);

    // Panneau de contrôle et supervision
    this.controlPanel = new ControlPanel(
      this.uiContainer,
      this.fsm,
      this.robot,
      this.faultInjector,
      this.kpiManager,
      this.armCoordinator
    );

    // Liaison des boutons de caméra de l'en-tête
    const camButtons = this.uiContainer.querySelectorAll('.btn-cam');
    camButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        camButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const mode = btn.getAttribute('data-cam');
        this.cameraManager.setMode(mode);
      });
    });

    // Graphique Canvas de télémétrie temps réel
    const canvasEl = document.getElementById('telemetry-canvas');
    if (canvasEl) {
      this.telemetryCharts = new TelemetryCharts(canvasEl);
    }

    // Panneau de scénarios S1 à S9
    const scenContainer = document.getElementById('scenario-panel-container');
    if (scenContainer) {
      this.scenarioPanel = new ScenarioPanel(scenContainer, this.scenarioRunner);
    }
  }

  onWindowResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  /**
   * Pas de simulation fixe (physique, navigation, FSM, puissance)
   */
  fixedStep(dt, speedScale) {
    const obstacles = this.obstacleManager.getObstacleList();

    // 1. Convoyeur Zone A
    this.conveyor.update(dt, speedScale);

    // 2. Station de charge Hot-Swap (charge CC/CV du rack)
    this.chargingStation.update(dt, speedScale);

    // 3. Machine à états FSM
    this.fsm.update(dt, obstacles, speedScale);

    // 4. Robot cinématique (Mecanum + Mât Z + Bras 5-DOF + Capteurs)
    this.robot.update(dt, this.fsm.currentState, obstacles, speedScale);

    // 5. Calcul de consommation et alimentation
    const powerResult = this.powerConsumption.update(this.fsm.currentState);

    let batteryStats;
    let bufferStats;

    if (this.bufferPower.isActive) {
      // Pendant le Hot-Swap : les circuits critiques sont alimentés par le bus tampon
      bufferStats = this.bufferPower.update(powerResult.criticalPowerW, dt, speedScale);
      batteryStats = {
        soc: this.batteryModel.soc,
        socPercent: this.batteryModel.soc * 100,
        voltageV: 0,
        currentA: 0,
        powerW: 0,
        isLow: false,
        isCritical: false,
        autonomyMinutes: 999
      };
    } else {
      // Fonctionnement normal sur batterie principale
      bufferStats = this.bufferPower.update(0, dt, speedScale);
      batteryStats = this.batteryModel.update(powerResult.totalPowerW, dt, speedScale);
    }

    // 6. Gestionnaire de collisions et physique des corps libres
    this.physicsManager.update(dt, speedScale);

    // 7. KPIs et odométrie de distance
    this.kpiManager.recordRobotMove(this.robot.position.x, this.robot.position.z);
    this.kpiManager.update(dt, speedScale);

    if (this.fsm.currentState === 'PLACE' && this.fsm.currentBox && !this.fsm.currentBox.kpiRecorded) {
      this.fsm.currentBox.kpiRecorded = true;
      const cycleTime = this.fsm.lastCycleDurationSec || 52.4;
      this.kpiManager.recordCycleCompleted(cycleTime, 2.3);
    }

    if (this.swapController.step === 'COMPLETED' && !this.swapController.kpiRecorded) {
      this.swapController.kpiRecorded = true;
      this.kpiManager.recordSwapCompleted(this.swapController.totalSwapTimeSec);
    }

    // 8. Pont ROS 2
    this.rosBridge.update(dt);

    return { batteryStats, powerResult, bufferStats };
  }

  animate() {
    requestAnimationFrame(() => this.animate());

    const now = performance.now();
    let frameTime = (now - this.lastTime) / 1000;
    this.lastTime = now;
    frameTime = Math.min(frameTime, 0.1); // Protection anti-freeze

    const speedScale = this.controlPanel ? this.controlPanel.simSpeed : 1.0;

    // Accumulateur de pas fixe pour garantir la reproductibilité physique
    this.accumulator += frameTime;
    let lastStepData = null;

    while (this.accumulator >= this.fixedDt) {
      lastStepData = this.fixedStep(this.fixedDt, speedScale);
      this.accumulator -= this.fixedDt;
    }

    // Mise à jour de la caméra
    if (this.cameraManager) {
      this.cameraManager.update();
    }

    // Rendu graphique Three.js
    this.renderer.render(this.scene, this.camera);

    // Mise à jour de l'interface utilisateur et graphiques de télémétrie
    if (lastStepData && this.controlPanel) {
      const kpis = this.kpiManager.getMetrics();
      this.controlPanel.updateTelemetry(
        lastStepData.batteryStats,
        lastStepData.powerResult,
        kpis,
        lastStepData.bufferStats
      );

      if (this.telemetryCharts) {
        const speed = Math.hypot(this.robot.vx, this.robot.vy);
        const vac = this.robot.leftArm.gripper.currentPressureKPa;
        this.telemetryCharts.update(
          frameTime,
          lastStepData.batteryStats.socPercent,
          lastStepData.powerResult.totalPowerW,
          speed,
          vac
        );
      }
    }
  }
}

// Initialisation dès le chargement du DOM
window.addEventListener('DOMContentLoaded', () => {
  new SimulationApp();
});

