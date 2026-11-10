/**
 * Graphiques de télémétrie en temps réel HUMA-LOG (Canvas 2D haute performance)
 * Affiche simultanément :
 *  - Courbe SoC Batterie (%)
 *  - Puissance absorbée totale (W)
 *  - Vitesse linéaire AGV (m/s)
 *  - Dépression du circuit de vide (kPa)
 */
export class TelemetryCharts {
  constructor(canvasElement) {
    this.canvas = canvasElement;
    this.ctx = canvasElement.getContext('2d');
    this.historyLength = 80;

    this.socHistory = [];
    this.powerHistory = [];
    this.speedHistory = [];
    this.vacuumHistory = [];

    this.sampleTimer = 0;
    this.sampleInterval = 0.1; // 10 Hz
  }

  addDataPoint(socPercent, powerW, speedMs, vacuumKPa) {
    this.socHistory.push(socPercent);
    this.powerHistory.push(powerW);
    this.speedHistory.push(speedMs);
    this.vacuumHistory.push(Math.abs(vacuumKPa));

    if (this.socHistory.length > this.historyLength) {
      this.socHistory.shift();
      this.powerHistory.shift();
      this.speedHistory.shift();
      this.vacuumHistory.shift();
    }
  }

  update(dt, socPercent, powerW, speedMs, vacuumKPa) {
    this.sampleTimer += dt;
    if (this.sampleTimer >= this.sampleInterval) {
      this.sampleTimer = 0;
      this.addDataPoint(socPercent, powerW, speedMs, vacuumKPa);
      this.render();
    }
  }

  render() {
    const w = this.canvas.width;
    const h = this.canvas.height;
    const ctx = this.ctx;

    // Fond noir technique
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, w, h);

    // Grille industrielle
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    for (let x = 0; x < w; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 0; y < h; y += 30) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    if (this.socHistory.length < 2) return;

    // Helper pour tracer une courbe
    const drawCurve = (data, minVal, maxVal, colorHex, lineWidth = 2) => {
      ctx.strokeStyle = colorHex;
      ctx.lineWidth = lineWidth;
      ctx.beginPath();
      const stepX = w / (this.historyLength - 1);

      for (let i = 0; i < data.length; i++) {
        const val = data[i];
        const norm = (val - minVal) / (maxVal - minVal || 1);
        const y = h - (norm * (h - 20) + 10);
        const x = i * stepX;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    };

    // 1. SoC (Vert / 0 à 100%)
    drawCurve(this.socHistory, 0, 100, '#00e676', 2);

    // 2. Puissance (Orange / 0 à 180W)
    drawCurve(this.powerHistory, 0, 180, '#f59e0b', 2);

    // 3. Vitesse (Bleu ciel / 0 à 1.2 m/s)
    drawCurve(this.speedHistory, 0, 1.2, '#38bdf8', 1.5);

    // 4. Vide (Rose magenta / 0 à 60 kPa)
    drawCurve(this.vacuumHistory, 0, 60, '#f43f5e', 1.5);

    // Légende compacte en haut
    ctx.font = '11px monospace';
    ctx.fillStyle = '#00e676';
    const lastSoC = this.socHistory[this.socHistory.length - 1] || 0;
    ctx.fillText(`SoC: ${lastSoC.toFixed(0)}%`, 10, 16);

    ctx.fillStyle = '#f59e0b';
    const lastP = this.powerHistory[this.powerHistory.length - 1] || 0;
    ctx.fillText(`P: ${lastP.toFixed(0)}W`, 90, 16);

    ctx.fillStyle = '#38bdf8';
    const lastV = this.speedHistory[this.speedHistory.length - 1] || 0;
    ctx.fillText(`V: ${lastV.toFixed(2)}m/s`, 160, 16);

    ctx.fillStyle = '#f43f5e';
    const lastVac = this.vacuumHistory[this.vacuumHistory.length - 1] || 0;
    ctx.fillText(`Vac: -${lastVac.toFixed(0)}kPa`, 245, 16);
  }
}

