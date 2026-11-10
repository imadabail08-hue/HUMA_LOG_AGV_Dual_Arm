import { CONFIG } from '../config.js';

/**
 * Système d'alimentation tampon (Buffer Power Unit)
 * Pack 3S LiFePO4 / Supercondensateur 1.5 Ah monté en bus parallèle
 * avec contrôleur de diode idéale. Assure la continuité électrique absolue
 * du calculateur Jetson Orin, du LiDAR, des capteurs et de la pile Nav2/SLAM
 * pendant l'extraction et l'insertion de la batterie principale (Hot-Swap sans coupure).
 */
export class BufferPower {
  constructor() {
    this.capacityAh = CONFIG.battery.bufferCapacityAh; // 1.5 Ah
    this.nominalVoltage = CONFIG.battery.bufferVoltageV; // 12.0 V
    this.soc = 1.0;
    this.isActive = false;
    this.nav2Maintained = true;
    this.powerSuppliedW = 0.0;
    this.bufferCurrentA = 0.0;
    this.timeOnBufferSec = 0.0;
  }

  /**
   * Active la bascule sur l'alimentation tampon (dégagement de la batterie principale)
   */
  engageBuffer() {
    this.isActive = true;
    this.nav2Maintained = true;
    this.timeOnBufferSec = 0.0;
  }

  /**
   * Rétablit l'alimentation sur la batterie principale neuve
   */
  disengageBuffer() {
    this.isActive = false;
    this.powerSuppliedW = 0.0;
    this.bufferCurrentA = 0.0;
  }

  /**
   * Mise à jour du tampon pendant le swap
   */
  update(criticalPowerDemandW, dt, speedScale = 1.0) {
    const effectiveDt = dt * speedScale;

    if (this.isActive) {
      this.timeOnBufferSec += effectiveDt;
      this.powerSuppliedW = criticalPowerDemandW;
      this.bufferCurrentA = this.powerSuppliedW / this.nominalVoltage;

      // Décharge lente du tampon
      const deltaAs = this.bufferCurrentA * effectiveDt;
      this.soc = Math.max(0.0, this.soc - deltaAs / (this.capacityAh * 3600));

      // Vérification que le tampon ne s'épuise pas (permet > 15 minutes)
      this.nav2Maintained = this.soc > 0.05;
    } else {
      // Rechargement d'entretien lent du tampon depuis la batterie principale
      this.soc = Math.min(1.0, this.soc + (0.1 / 3600) * effectiveDt);
      this.powerSuppliedW = 0.0;
      this.bufferCurrentA = 0.0;
    }

    return {
      isActive: this.isActive,
      nav2Maintained: this.nav2Maintained,
      socPercent: this.soc * 100,
      bufferVoltage: this.nominalVoltage,
      bufferCurrentA: this.bufferCurrentA,
      timeOnBufferSec: this.timeOnBufferSec
    };
  }
}

