import { CONFIG } from '../config.js';

/**
 * Modèle de batterie Lithium-Ion 3S (11.1V nominal / 12.6V max, 20 Ah)
 * Coulomb counting, courbe OCV non-linéaire, résistance interne,
 * modèle thermique et estimation d'autonomie restante.
 */
export class BatteryModel {
  constructor(initialSoC = 1.0) {
    this.capacityAh = CONFIG.battery.capacityAh; // 20.0 Ah
    this.capacityAs = this.capacityAh * 3600;    // 72 000 Coulombs
    this.nominalVoltage = CONFIG.battery.nominalVoltageV; // 11.1 V
    this.maxVoltage = CONFIG.battery.maxVoltageV;         // 12.6 V
    this.minVoltage = CONFIG.battery.minVoltageV;         // 9.6 V
    this.rInt = CONFIG.battery.internalResistanceOhm;     // 0.025 Ohm

    this.soc = initialSoC; // 0.0 à 1.0 (100%)
    this.currentA = 0.0;
    this.voltageV = this.computeOCV(this.soc);
    this.powerW = 0.0;
    this.energyConsumedWh = 0.0;
    this.tempC = 24.0;
    this.cycleCount = 12;

    this.lowThreshold = CONFIG.battery.lowThresholdPercent / 100;       // 0.25 (25%)
    this.criticalThreshold = CONFIG.battery.criticalThresholdPercent / 100; // 0.10 (10%)
  }

  /**
   * Tension en circuit ouvert (OCV) en fonction de l'état de charge (SoC)
   * Modèle empirique 3S Li-ion réaliste
   */
  computeOCV(soc) {
    const s = Math.max(0.0, Math.min(1.0, soc));
    // Courbe 3S : palier à 11.1V-11.4V, descente rapide sous 15%, montée vers 12.6V
    return 9.6 + 1.8 * Math.pow(s, 0.4) + 1.2 * Math.pow(s, 3);
  }

  /**
   * Mise à jour de la décharge sur un pas de temps dt
   * @param {number} powerDemandW Puissance totale demandée par le robot
   * @param {number} dt Pas de temps (secondes)
   * @param {number} speedScale Facteur d'accélération
   */
  update(powerDemandW, dt, speedScale = 1.0) {
    const effectiveDt = dt * speedScale;
    this.powerW = Math.max(0, powerDemandW);

    // Calcul de la tension aux bornes sous charge : V = OCV - I * R_int
    // Avec P = V * I -> I² * R_int - OCV * I + P = 0
    const ocv = this.computeOCV(this.soc);
    const discr = ocv * ocv - 4 * this.rInt * this.powerW;

    if (discr >= 0) {
      this.currentA = (ocv - Math.sqrt(discr)) / (2 * this.rInt);
      this.voltageV = ocv - this.currentA * this.rInt;
    } else {
      // Saturation courant max
      this.currentA = ocv / (2 * this.rInt);
      this.voltageV = ocv / 2;
    }

    // Décharge (Coulomb counting)
    const deltaChargeAs = this.currentA * effectiveDt;
    const deltaSoC = deltaChargeAs / this.capacityAs;
    this.soc = Math.max(0.0, this.soc - deltaSoC);

    // Énergie consommée en Watt-heures (Wh)
    const deltaEnergyWh = (this.powerW * effectiveDt) / 3600;
    this.energyConsumedWh += deltaEnergyWh;

    // Modèle thermique simplifié : échauffement par effet Joule I² * R + convection
    const heatPower = this.currentA * this.currentA * this.rInt;
    const coolingPower = (this.tempC - 22.0) * 0.45;
    this.tempC += ((heatPower - coolingPower) / 80.0) * effectiveDt;

    // Détection de seuils
    return {
      soc: this.soc,
      socPercent: (this.soc * 100),
      voltageV: this.voltageV,
      currentA: this.currentA,
      powerW: this.powerW,
      tempC: this.tempC,
      isLow: this.soc <= this.lowThreshold,
      isCritical: this.soc <= this.criticalThreshold,
      autonomyMinutes: this.getRemainingAutonomyMinutes()
    };
  }

  getRemainingAutonomyMinutes() {
    if (this.currentA <= 0.05) return 999;
    const remainingAh = this.soc * this.capacityAh;
    return (remainingAh / this.currentA) * 60;
  }

  /**
   * Recharge instantanée ou remplacement complet par une batterie neuve
   */
  swapToFreshPack(soc = 1.0) {
    this.soc = soc;
    this.voltageV = this.computeOCV(this.soc);
    this.tempC = 23.0;
    this.cycleCount++;
  }

  setSoC(socPercent) {
    this.soc = Math.max(0.01, Math.min(1.0, socPercent / 100));
    this.voltageV = this.computeOCV(this.soc);
  }
}

