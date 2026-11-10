/**
 * HUMA-LOG Configuration Module
 * Unités SI : mètres (m), secondes (s), kilogrammes (kg), radians (rad), kPa, Volts (V), Watts (W).
 */
export const DEFAULT_CONFIG = {
  system: {
    name: "HUMA-LOG Digital Twin",
    version: "1.0.0",
    targetCycleTimeSec: 55.0,
    fixedTimeStepSec: 1 / 60,
    aisleWidthM: 0.90,
    distanceAtoBM: 8.0
  },
  agv: {
    lengthM: 0.60,
    widthM: 0.45,
    heightM: 0.25,
    wheelRadiusM: 0.04,
    lxM: 0.25,
    lyM: 0.20,
    maxLinearSpeedMs: 0.8,
    maxAngularSpeedRadS: 1.2,
    maxAccelMs2: 0.6,
    safetyZoneSpeedMs: 0.3,
    positionNoiseStdDevM: 0.005,
    orientationNoiseStdDevRad: 0.008
  },
  zAxis: {
    strokeM: 0.40,
    carriageHeightMinM: 0.35,
    carriageHeightMaxM: 0.75,
    minSpeedMs: 0.02,
    defaultSpeedMs: 0.06,
    maxSpeedMs: 0.12,
    accelMs2: 0.15,
    carriageMassKg: 3.2,
    efficiency: 0.65
  },
  arms: {
    link1LengthM: 0.18,
    link2LengthM: 0.17,
    link3LengthM: 0.06,
    reachM: 0.35,
    maxServoSpeedRadS: 3.0,
    servoTorqueNm: 1.9,
    defaultMode: "alternate" // "alternate" ou "parallel"
  },
  suction: {
    targetPressureKPa: -45.0,
    thresholdPressureKPa: -35.0,
    dropPressureKPa: -20.0,
    cupDiameterM: 0.035,
    pressureRiseTimeS: 0.35,
    blowOffTimeS: 0.08,
    nominalMassKg: 0.8,
    minMassKg: 0.5,
    maxMassKg: 1.2
  },
  battery: {
    nominalVoltageV: 11.1,
    maxVoltageV: 12.6,
    minVoltageV: 9.6,
    capacityAh: 20.0,
    nominalEnergyWh: 222.0,
    internalResistanceOhm: 0.025,
    lowThresholdPercent: 25.0,
    criticalThresholdPercent: 10.0,
    bufferCapacityAh: 1.5,
    bufferVoltageV: 12.0,
    rackChargeCurrentA: 10.0,
    swapNominalDurationS: 30.0,
    dockingToleranceM: 0.005,
    dockingToleranceDeg: 2.0,
    maxAlignmentRetries: 3
  },
  power: {
    jetsonIdleW: 15.0,
    lidarW: 3.5,
    auxLogicW: 4.0,
    vacuumPumpW: 18.0,
    mecanumBaseIdleW: 8.0,
    mecanumMaxW: 90.0,
    zAxisHoldingW: 5.0,
    zAxisMovingW: 35.0,
    servoIdleW: 1.0,
    servoMovingW: 4.5
  },
  sensors: {
    lidarRangeM: 12.0,
    lidarScanRateHz: 10,
    lidarSamples: 180,
    obstacleStopDistM: 0.55,
    obstacleSlowDistM: 1.20,
    cameraFovDeg: 65,
    cameraMaxDetectDistM: 1.4,
    cameraMaxAngleDeg: 45
  },
  boxes: {
    lengthM: 0.20,
    widthM: 0.15,
    heightM: 0.10,
    conveyorCadenceS: 12.0,
    conveyorSpeedMs: 0.15
  },
  shelves: {
    count: 3,
    levelHeightsM: [0.30, 0.70, 1.10],
    slotsPerLevel: 3
  }
};

export const CONFIG = JSON.parse(JSON.stringify(DEFAULT_CONFIG));

export function updateConfigParam(path, value) {
  const keys = path.split('.');
  let current = CONFIG;
  for (let i = 0; i < keys.length - 1; i++) {
    if (!current[keys[i]]) current[keys[i]] = {};
    current = current[keys[i]];
  }
  current[keys[keys.length - 1]] = value;
}

export function resetConfig() {
  Object.assign(CONFIG, JSON.parse(JSON.stringify(DEFAULT_CONFIG)));
}

