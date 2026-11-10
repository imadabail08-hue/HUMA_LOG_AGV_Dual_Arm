import { CONFIG, updateConfigParam } from '../config.js';

/**
 * Panneau de commande, supervision et réglages dynamiques HUMA-LOG (en français)
 */
export class ControlPanel {
  constructor(containerElement, fsm, robot, faultInjector, kpiManager, armCoordinator) {
    this.container = containerElement;
    this.fsm = fsm;
    this.robot = robot;
    this.faultInjector = faultInjector;
    this.kpiManager = kpiManager;
    this.armCoordinator = armCoordinator;

    this.simSpeed = 1.0;
    this.activeTab = 'supervision'; // 'supervision', 'controls', 'scenarios', 'kpi'

    this.render();
  }

  render() {
    this.container.innerHTML = `
      <!-- En-tête HMI HUMA-LOG -->
      <header class="hmi-header">
        <div class="hmi-brand">
          <div class="logo-badge">HL</div>
          <div>
            <div class="brand-title">HUMA-LOG <span class="brand-sub">DIGITAL TWIN</span></div>
            <div class="brand-desc">AGV Holonome Bi-Bras & Station Hot-Swap Walker S2</div>
          </div>
        </div>
        <div class="header-status">
          <div class="status-indicator">
            <span class="status-dot dot-green" id="hmi-status-dot"></span>
            <span id="hmi-status-text">OPÉRATIONNEL</span>
          </div>
          <button id="btn-global-estop" class="btn-estop">ARRÊT D'URGENCE</button>
        </div>
      </header>

      <!-- Barre de navigation des vues et caméra -->
      <div class="cam-bar">
        <span class="bar-label">Caméra :</span>
        <button class="btn-cam active" data-cam="global">🌐 Globale</button>
        <button class="btn-cam" data-cam="follow">🚗 Suivi Robot</button>
        <button class="btn-cam" data-cam="onboard">📷 Vue Embarquée</button>
        <button class="btn-cam" data-cam="top">🗺️ Vue du Dessus 2D</button>

        <span class="bar-separator"></span>
        <span class="bar-label">Vitesse Simu :</span>
        <button class="btn-speed" data-speed="0.5">0.5x</button>
        <button class="btn-speed active" data-speed="1.0">1x</button>
        <button class="btn-speed" data-speed="2.0">2x</button>
        <button class="btn-speed" data-speed="5.0">5x</button>
        <button class="btn-speed" data-speed="10.0">10x</button>
        <button class="btn-speed" data-speed="20.0">20x</button>
      </div>

      <!-- Onglets du panneau latéral -->
      <div class="panel-tabs">
        <button class="tab-btn active" data-tab="supervision">📊 Supervision</button>
        <button class="tab-btn" data-tab="controls">⚙️ Commandes & Fautes</button>
        <button class="tab-btn" data-tab="scenarios">📋 Scénarios (S1-S9)</button>
        <button class="tab-btn" data-tab="kpi">📈 KPIs & Benchmarks</button>
      </div>

      <!-- Contenu des onglets -->
      <div class="tab-content" id="tab-content-area">
        <!-- 1. Onglet Supervision -->
        <div class="tab-pane active" id="pane-supervision">
          <!-- Carte FSM en direct -->
          <div class="card">
            <div class="card-header">
              <span>🤖 Machine à États Finis (FSM)</span>
              <span class="fsm-badge" id="tele-fsm-badge">IDLE</span>
            </div>
            <div class="fsm-timeline">
              <div class="fsm-step" id="step-A">1. Nav Zone A</div>
              <div class="fsm-step" id="step-DETECT">2. Scan ArUco</div>
              <div class="fsm-step" id="step-PICK">3. Prise Colis</div>
              <div class="fsm-step" id="step-B">4. Transit 8m + Z</div>
              <div class="fsm-step" id="step-PLACE">5. Dépose Étagère</div>
              <div class="fsm-step" id="step-RETURN">6. Retour A</div>
            </div>
          </div>

          <!-- Jauge et Télémétrie Électrique -->
          <div class="card">
            <div class="card-header">
              <span>⚡ Énergie & Alimentation Hot-Swap</span>
              <span id="tele-buffer-badge" class="badge-buffer">ALIM PRINCIPALE</span>
            </div>
            <div class="battery-gauge-container">
              <div class="battery-bar-bg">
                <div class="battery-bar-fill" id="battery-fill" style="width:100%;"></div>
              </div>
              <div class="battery-stats">
                <span id="tele-soc">100 %</span>
                <span id="tele-voltage">12.6 V</span>
                <span id="tele-current">0.0 A</span>
                <span id="tele-autonomy">Autonomie : ~4.2 h</span>
              </div>
            </div>
          </div>

          <!-- Télémétrie Cinématique & Organes Robot -->
          <div class="card">
            <div class="card-header">
              <span>🦾 Organes Cinématiques & Vide</span>
            </div>
            <div class="telemetry-grid">
              <div class="tele-item">
                <span class="tele-lbl">Hauteur Torse Z</span>
                <span class="tele-val" id="tele-z-height">0.35 m</span>
              </div>
              <div class="tele-item">
                <span class="tele-lbl">Dépression Vide G</span>
                <span class="tele-val" id="tele-vac-left">0.0 kPa</span>
              </div>
              <div class="tele-item">
                <span class="tele-lbl">Dépression Vide D</span>
                <span class="tele-val" id="tele-vac-right">0.0 kPa</span>
              </div>
              <div class="tele-item">
                <span class="tele-lbl">Vitesse AGV</span>
                <span class="tele-val" id="tele-speed">0.00 m/s</span>
              </div>
              <div class="tele-item">
                <span class="tele-lbl">CPU Jetson Orin</span>
                <span class="tele-val" id="tele-cpu">28 % (41°C)</span>
              </div>
              <div class="tele-item">
                <span class="tele-lbl">Portée LiDAR min</span>
                <span class="tele-val" id="tele-lidar">12.0 m</span>
              </div>
            </div>
          </div>

          <!-- File Colis & Cible courante -->
          <div class="card">
            <div class="card-header">
              <span>📦 Mission en Cours</span>
              <span id="tele-box-count">Colis traités : 0</span>
            </div>
            <div style="font-size:12px; color:#cbd5e1; display:flex; justify-content:space-between; margin-bottom:6px;">
              <span>Alvéole cible : <strong id="tele-target-slot" style="color:#38bdf8;">--</strong></span>
              <span>Masse : <strong id="tele-target-mass" style="color:#f59e0b;">--</strong></span>
            </div>
            <div style="font-size:11px; color:#94a3b8;">
              Dernier QR scanné : <span id="tele-last-qr" style="font-family:monospace; color:#a7f3d0;">En attente...</span>
            </div>
          </div>

          <!-- Graphiques Télémétrie Canvas -->
          <div class="card">
            <div class="card-header">
              <span>📈 Télémétrie Dynamique en Continu</span>
            </div>
            <canvas id="telemetry-canvas" width="380" height="110" style="width:100%; border-radius:4px;"></canvas>
          </div>

          <!-- Journal des transitions d'états FSM -->
          <div class="card">
            <div class="card-header">
              <span>📜 Journal d'Événements FSM</span>
            </div>
            <div class="log-container" id="fsm-log-box"></div>
          </div>
        </div>

        <!-- 2. Onglet Commandes & Fautes -->
        <div class="tab-pane" id="pane-controls">
          <div class="card">
            <div class="card-header">
              <span>🕹️ Contrôle d'Exécution</span>
            </div>
            <div style="display:flex; gap:8px; margin-bottom:12px;">
              <button id="btn-play-pause" class="btn btn-primary" style="flex:1;">⏸ Pause</button>
              <button id="btn-step" class="btn btn-secondary" style="flex:1;">⏭ Pas-à-Pas</button>
              <button id="btn-reset" class="btn btn-secondary" style="flex:1;">🔄 Réinitialiser</button>
            </div>
            <div style="display:flex; gap:8px; align-items:center;">
              <span style="font-size:12px; color:#94a3b8;">Mode des bras :</span>
              <button id="btn-mode-alt" class="btn btn-sm btn-primary">Alterné (1 colis)</button>
              <button id="btn-mode-par" class="btn btn-sm btn-secondary">Parallèle (2 colis)</button>
            </div>
          </div>

          <!-- Injection de pannes -->
          <div class="card">
            <div class="card-header">
              <span>⚠️ Injection de Pannes & Sécurité</span>
            </div>
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:8px;">
              <button id="btn-fault-obstacle" class="btn btn-fault">🚶 Obstacle Allée</button>
              <button id="btn-fault-vacuum" class="btn btn-fault">💨 Perte de Vide</button>
              <button id="btn-fault-battery" class="btn btn-fault">🔋 Forcer Batt. 18%</button>
              <button id="btn-fault-lidar" class="btn btn-fault">📡 Couper LiDAR</button>
              <button id="btn-manual-swap" class="btn btn-primary" style="grid-column: span 2;">🔄 Déclencher Hot-Swap Manuel</button>
            </div>
          </div>

          <!-- Paramètres modifiables à chaud -->
          <div class="card">
            <div class="card-header">
              <span>🎛️ Paramètres Système à Chaud</span>
            </div>
            <div class="slider-group">
              <label>Masse colis nominale : <span id="val-mass">0.8</span> kg</label>
              <input type="range" id="slider-mass" min="0.5" max="1.2" step="0.05" value="0.8">
            </div>
            <div class="slider-group">
              <label>Vitesse max AGV : <span id="val-speed-agv">0.8</span> m/s</label>
              <input type="range" id="slider-speed-agv" min="0.2" max="1.4" step="0.1" value="0.8">
            </div>
            <div class="slider-group">
              <label>Vitesse mât vertical Z : <span id="val-speed-z">0.06</span> m/s</label>
              <input type="range" id="slider-speed-z" min="0.02" max="0.12" step="0.01" value="0.06">
            </div>
            <div class="slider-group">
              <label>Cadence convoyeur entrant : <span id="val-cadence">12</span> s</label>
              <input type="range" id="slider-cadence" min="4" max="25" step="1" value="12">
            </div>
            <div class="slider-group">
              <label>Seuil alerte batterie basse : <span id="val-bat-thresh">25</span> %</label>
              <input type="range" id="slider-bat-thresh" min="15" max="40" step="1" value="25">
            </div>
          </div>
        </div>

        <!-- 3. Onglet Scénarios S1 à S9 -->
        <div class="tab-pane" id="pane-scenarios">
          <div id="scenario-panel-container"></div>
        </div>

        <!-- 4. Onglet KPI & Benchmarks -->
        <div class="tab-pane" id="pane-kpi">
          <div class="card">
            <div class="card-header">
              <span>🎯 Indicateurs Clés de Rendement</span>
            </div>
            <div class="telemetry-grid">
              <div class="tele-item">
                <span class="tele-lbl">Temps de Cycle Moyen</span>
                <span class="tele-val" id="kpi-avg-cycle">-- s (Cible: 55s)</span>
              </div>
              <div class="tele-item">
                <span class="tele-lbl">Débit Réel</span>
                <span class="tele-val" id="kpi-boxes-hour">-- colis / h</span>
              </div>
              <div class="tele-item">
                <span class="tele-lbl">Taux Réussite Prise</span>
                <span class="tele-val" id="kpi-pick-rate">100 %</span>
              </div>
              <div class="tele-item">
                <span class="tele-lbl">Précision Dépose</span>
                <span class="tele-val" id="kpi-accuracy">± 2.2 mm</span>
              </div>
              <div class="tele-item">
                <span class="tele-lbl">Énergie par Colis</span>
                <span class="tele-val" id="kpi-energy">-- Wh / colis</span>
              </div>
              <div class="tele-item">
                <span class="tele-lbl">Disponibilité Robot</span>
                <span class="tele-val" id="kpi-availability">98.5 %</span>
              </div>
            </div>
          </div>

          <!-- Comparatif Hot-Swap vs Charge Fixe -->
          <div class="card">
            <div class="card-header">
              <span>⚖️ Comparatif 8h : Hot-Swap vs Charge Branchée</span>
            </div>
            <table class="benchmark-table">
              <thead>
                <tr>
                  <th>Critère</th>
                  <th>Charge Fixe</th>
                  <th>Hot-Swap HUMA-LOG</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Temps d'arrêt de charge</td>
                  <td style="color:#f87171;">2.5 heures</td>
                  <td style="color:#4ade80;">1.0 minute (2 swaps)</td>
                </tr>
                <tr>
                  <td>Taux d'utilisation effectif</td>
                  <td style="color:#f87171;">68.7 %</td>
                  <td style="color:#4ade80; font-weight:bold;">98.4 %</td>
                </tr>
                <tr>
                  <td>Colis traités sur 8h</td>
                  <td>~360 colis</td>
                  <td style="color:#38bdf8; font-weight:bold;">~515 colis (+43%)</td>
                </tr>
                <tr>
                  <td>Perte carte / Nav2</td>
                  <td>Extinction complète</td>
                  <td style="color:#4ade80;">Zéro coupure (Tampon)</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    this.bindEvents();
  }

  bindEvents() {
    // Navigation onglets
    const tabs = this.container.querySelectorAll('.tab-btn');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        this.activeTab = tab.getAttribute('data-tab');

        const panes = this.container.querySelectorAll('.tab-pane');
        panes.forEach(p => p.classList.remove('active'));
        this.container.querySelector(`#pane-${this.activeTab}`).classList.add('active');
      });
    });

    // Vitesse de simulation
    const speedButtons = this.container.querySelectorAll('.btn-speed');
    speedButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        speedButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.simSpeed = parseFloat(btn.getAttribute('data-speed'));
      });
    });

    // Arrêt d'urgence global
    const estopBtn = this.container.querySelector('#btn-global-estop');
    estopBtn.addEventListener('click', () => {
      const isStopped = this.fsm.isEmergencyStopped;
      this.faultInjector.triggerEmergencyStop(!isStopped);
      estopBtn.textContent = !isStopped ? 'RÉARMER ARRÊT D\'URGENCE' : 'ARRÊT D\'URGENCE';
      estopBtn.classList.toggle('active', !isStopped);
    });

    // Commandes lecture / pause / reset
    const btnPlayPause = this.container.querySelector('#btn-play-pause');
    btnPlayPause.addEventListener('click', () => {
      this.fsm.isPaused = !this.fsm.isPaused;
      btnPlayPause.textContent = this.fsm.isPaused ? '▶ Reprendre' : '⏸ Pause';
    });

    const btnReset = this.container.querySelector('#btn-reset');
    btnReset.addEventListener('click', () => {
      this.fsm.reset();
      this.robot.reset();
      this.kpiManager.reset();
    });

    // Mode alterné / parallèle
    const btnModeAlt = this.container.querySelector('#btn-mode-alt');
    const btnModePar = this.container.querySelector('#btn-mode-par');
    btnModeAlt.addEventListener('click', () => {
      this.armCoordinator.setMode('alternate');
      btnModeAlt.className = 'btn btn-sm btn-primary';
      btnModePar.className = 'btn btn-sm btn-secondary';
    });
    btnModePar.addEventListener('click', () => {
      this.armCoordinator.setMode('parallel');
      btnModePar.className = 'btn btn-sm btn-primary';
      btnModeAlt.className = 'btn btn-sm btn-secondary';
    });

    // Pannes
    this.container.querySelector('#btn-fault-obstacle').addEventListener('click', () => {
      this.faultInjector.injectObstacleInAisle();
    });
    this.container.querySelector('#btn-fault-vacuum').addEventListener('click', () => {
      this.faultInjector.injectVacuumLoss();
    });
    this.container.querySelector('#btn-fault-battery').addEventListener('click', () => {
      this.faultInjector.injectLowBattery(18);
    });
    this.container.querySelector('#btn-fault-lidar').addEventListener('click', () => {
      this.faultInjector.injectLidarCut(!this.robot.sensors.isLidarActive);
    });
    this.container.querySelector('#btn-manual-swap').addEventListener('click', () => {
      this.fsm.requestBatterySwap();
    });

    // Sliders
    this.container.querySelector('#slider-mass').addEventListener('input', (e) => {
      const v = parseFloat(e.target.value);
      this.container.querySelector('#val-mass').textContent = v.toFixed(2);
      updateConfigParam('suction.nominalMassKg', v);
    });
    this.container.querySelector('#slider-speed-agv').addEventListener('input', (e) => {
      const v = parseFloat(e.target.value);
      this.container.querySelector('#val-speed-agv').textContent = v.toFixed(1);
      updateConfigParam('agv.maxLinearSpeedMs', v);
    });
    this.container.querySelector('#slider-speed-z').addEventListener('input', (e) => {
      const v = parseFloat(e.target.value);
      this.container.querySelector('#val-speed-z').textContent = v.toFixed(2);
      this.robot.torso.setSpeed(v);
    });
    this.container.querySelector('#slider-cadence').addEventListener('input', (e) => {
      const v = parseFloat(e.target.value);
      this.container.querySelector('#val-cadence').textContent = v.toFixed(0);
      updateConfigParam('boxes.conveyorCadenceS', v);
    });
    this.container.querySelector('#slider-bat-thresh').addEventListener('input', (e) => {
      const v = parseFloat(e.target.value);
      this.container.querySelector('#val-bat-thresh').textContent = v.toFixed(0);
      updateConfigParam('battery.lowThresholdPercent', v);
    });
  }

  /**
   * Rafraîchissement des valeurs de télémétrie dans le DOM à chaque trame
   */
  updateTelemetry(batteryStats, powerStats, kpiMetrics, bufferStats) {
    // Statut général
    const statusDot = this.container.querySelector('#hmi-status-dot');
    const statusText = this.container.querySelector('#hmi-status-text');
    if (this.fsm.isEmergencyStopped) {
      statusDot.className = 'status-dot dot-red';
      statusText.textContent = 'ARRÊT D\'URGENCE';
    } else if (this.fsm.currentState.includes('CHARGE') || this.fsm.currentState.includes('SWAP')) {
      statusDot.className = 'status-dot dot-orange';
      statusText.textContent = 'HOT-SWAP BATTERIE';
    } else {
      statusDot.className = 'status-dot dot-green';
      statusText.textContent = 'CYCLE NOMINAL';
    }

    // FSM Badge
    const fsmBadge = this.container.querySelector('#tele-fsm-badge');
    if (fsmBadge) fsmBadge.textContent = this.fsm.currentState;

    // Timeline FSM
    const stepIds = ['step-A', 'step-DETECT', 'step-PICK', 'step-B', 'step-PLACE', 'step-RETURN'];
    stepIds.forEach(id => {
      const el = this.container.querySelector(`#${id}`);
      if (el) el.classList.remove('active');
    });

    const stateMap = {
      'NAVIGATE_TO_A': 'step-A',
      'DETECT': 'step-DETECT',
      'PICK': 'step-PICK',
      'PICK_SECOND': 'step-PICK',
      'NAVIGATE_TO_B': 'step-B',
      'PLACE': 'step-PLACE',
      'PLACE_SECOND': 'step-PLACE',
      'RETURN': 'step-RETURN'
    };
    const activeStep = stateMap[this.fsm.currentState];
    if (activeStep) {
      const el = this.container.querySelector(`#${activeStep}`);
      if (el) el.classList.add('active');
    }

    // Batterie & Tampon
    const bufferBadge = this.container.querySelector('#tele-buffer-badge');
    if (bufferBadge) {
      if (bufferStats.isActive) {
        bufferBadge.textContent = 'TAMPON ACTIF (Nav2 100%)';
        bufferBadge.className = 'badge-buffer active';
      } else {
        bufferBadge.textContent = 'ALIM PRINCIPALE';
        bufferBadge.className = 'badge-buffer';
      }
    }

    const fill = this.container.querySelector('#battery-fill');
    if (fill) {
      fill.style.width = `${batteryStats.socPercent.toFixed(0)}%`;
      fill.style.background = batteryStats.isCritical ? '#ef4444' : (batteryStats.isLow ? '#f59e0b' : '#00e676');
    }
    const tSoc = this.container.querySelector('#tele-soc');
    if (tSoc) tSoc.textContent = `${batteryStats.socPercent.toFixed(1)} %`;
    const tV = this.container.querySelector('#tele-voltage');
    if (tV) tV.textContent = `${batteryStats.voltageV.toFixed(2)} V`;
    const tI = this.container.querySelector('#tele-current');
    if (tI) tI.textContent = `${batteryStats.currentA.toFixed(1)} A`;
    const tAuto = this.container.querySelector('#tele-autonomy');
    if (tAuto) tAuto.textContent = `Autonomie : ~${(batteryStats.autonomyMinutes / 60).toFixed(1)} h`;

    // Organes robot
    const tZ = this.container.querySelector('#tele-z-height');
    if (tZ) tZ.textContent = `${this.robot.torso.currentHeightM.toFixed(2)} m`;
    const tVacL = this.container.querySelector('#tele-vac-left');
    if (tVacL) tVacL.textContent = `${this.robot.leftArm.gripper.currentPressureKPa.toFixed(1)} kPa`;
    const tVacR = this.container.querySelector('#tele-vac-right');
    if (tVacR) tVacR.textContent = `${this.robot.rightArm.gripper.currentPressureKPa.toFixed(1)} kPa`;
    const tSpeed = this.container.querySelector('#tele-speed');
    if (tSpeed) tSpeed.textContent = `${Math.hypot(this.robot.vx, this.robot.vy).toFixed(2)} m/s`;
    const tCpu = this.container.querySelector('#tele-cpu');
    if (tCpu) tCpu.textContent = `${this.robot.jetson.cpuLoadPercent.toFixed(0)} % (${this.robot.jetson.tempC.toFixed(0)}°C)`;
    const tLidar = this.container.querySelector('#tele-lidar');
    if (tLidar) {
      const d = this.robot.sensors.closestObstacleDistM;
      tLidar.textContent = d === Infinity ? '> 12 m' : `${d.toFixed(2)} m`;
    }

    // Colis
    const tBoxCnt = this.container.querySelector('#tele-box-count');
    if (tBoxCnt) tBoxCnt.textContent = `Colis traités : ${kpiMetrics.totalBoxesDelivered}`;
    const tSlot = this.container.querySelector('#tele-target-slot');
    if (tSlot) tSlot.textContent = this.fsm.targetSlotInfo ? this.fsm.targetSlotInfo.id : '--';
    const tMass = this.container.querySelector('#tele-target-mass');
    if (tMass) tMass.textContent = this.fsm.currentBox ? `${this.fsm.currentBox.mass.toFixed(2)} kg` : '--';
    const tLastQr = this.container.querySelector('#tele-last-qr');
    if (tLastQr && this.robot.sensors.lastDetectedQR) {
      const qr = this.robot.sensors.lastDetectedQR;
      tLastQr.textContent = `Colis #${qr.boxId} -> ${qr.targetSlot} (${qr.mass.toFixed(2)}kg)`;
    }

    // KPIs
    const kCycle = this.container.querySelector('#kpi-avg-cycle');
    if (kCycle) kCycle.textContent = `${kpiMetrics.avgCycleTimeSec.toFixed(1)} s (Cible: 55s)`;
    const kBoxes = this.container.querySelector('#kpi-boxes-hour');
    if (kBoxes) kBoxes.textContent = `${kpiMetrics.boxesPerHour.toFixed(0)} colis / h`;
    const kEnergy = this.container.querySelector('#kpi-energy');
    if (kEnergy) kEnergy.textContent = `${kpiMetrics.energyPerBoxWh.toFixed(2)} Wh / colis`;
    const kAvail = this.container.querySelector('#kpi-availability');
    if (kAvail) kAvail.textContent = `${kpiMetrics.availabilityPercent.toFixed(1)} %`;

    // Journal FSM (dernières entrées)
    const logBox = this.container.querySelector('#fsm-log-box');
    if (logBox && this.fsm.history.length > 0) {
      logBox.innerHTML = this.fsm.history.slice(0, 10).map(e => `
        <div class="log-line">
          <span class="log-time">[${e.timestamp}s]</span>
          <span class="log-from">${e.from}</span> -> <span class="log-to">${e.to}</span>
          <span class="log-reason">(${e.reason})</span>
        </div>
      `).join('');
    }
  }
}

