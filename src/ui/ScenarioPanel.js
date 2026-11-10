/**
 * Panneau d'interface utilisateur pour la qualification des scénarios S1 à S9
 */
export class ScenarioPanel {
  constructor(containerElement, scenarioRunner) {
    this.container = containerElement;
    this.runner = scenarioRunner;

    this.render();
  }

  render() {
    this.container.innerHTML = `
      <div class="panel-section">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 12px;">
          <h3 style="margin:0; font-size:15px; color:#38bdf8;">📋 Scénarios de Test Jumeau Numérique (S1 à S9)</h3>
          <div>
            <button id="btn-run-all" class="btn btn-primary" style="padding:4px 10px; font-size:12px;">▶ Lancer Tout</button>
            <button id="btn-export-json" class="btn btn-secondary" style="padding:4px 8px; font-size:12px;">JSON</button>
            <button id="btn-export-csv" class="btn btn-secondary" style="padding:4px 8px; font-size:12px;">CSV</button>
          </div>
        </div>
        <div class="scenario-list" style="display:flex; flex-direction:column; gap:8px; max-height:360px; overflow-y:auto; padding-right:4px;">
          ${this.runner.catalog.map(s => `
            <div class="scenario-card" id="card-${s.id}" style="background:#1e293b; border-radius:6px; padding:10px; border-left:4px solid #64748b;">
              <div style="display:flex; justify-content:space-between; align-items:center;">
                <span style="font-weight:bold; font-size:13px; color:#f8fafc;">${s.title}</span>
                <span class="badge" id="badge-${s.id}" style="background:#334155; color:#cbd5e1; font-size:11px; padding:2px 8px; border-radius:4px;">NON TESTÉ</span>
              </div>
              <p style="margin:4px 0 6px 0; font-size:11px; color:#94a3b8;">${s.desc}</p>
              <div style="display:flex; justify-content:space-between; align-items:center;">
                <span style="font-size:10px; color:#38bdf8;">🎯 Cible : ${s.target}</span>
                <button class="btn btn-sm btn-run-single" data-id="${s.id}" style="padding:2px 8px; font-size:11px; background:#0284c7; color:#fff; border:none; border-radius:3px; cursor:pointer;">Tester</button>
              </div>
              <div class="test-details" id="details-${s.id}" style="display:none; margin-top:8px; padding-top:6px; border-top:1px dashed #334155; font-size:11px; color:#e2e8f0;"></div>
            </div>
          `).join('')}
        </div>
      </div>
    `;

    this.bindEvents();
  }

  bindEvents() {
    // Boutons de tests unitaires
    const buttons = this.container.querySelectorAll('.btn-run-single');
    buttons.forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        btn.disabled = true;
        btn.textContent = 'En cours...';
        const badge = this.container.querySelector(`#badge-${id}`);
        badge.textContent = 'TEST...';
        badge.style.background = '#f59e0b';

        const res = await this.runner.runScenario(id);
        this.updateCardResult(id, res);
        btn.disabled = false;
        btn.textContent = 'Re-tester';
      });
    });

    // Lancer tous les tests
    const btnAll = this.container.querySelector('#btn-run-all');
    btnAll.addEventListener('click', async () => {
      btnAll.disabled = true;
      btnAll.textContent = 'Exécution en cours...';
      for (const item of this.runner.catalog) {
        const badge = this.container.querySelector(`#badge-${item.id}`);
        badge.textContent = 'TEST...';
        badge.style.background = '#f59e0b';
        const res = await this.runner.runScenario(item.id);
        this.updateCardResult(item.id, res);
      }
      btnAll.disabled = false;
      btnAll.textContent = '▶ Lancer Tout';
    });

    // Exports
    this.container.querySelector('#btn-export-json').addEventListener('click', () => this.runner.exportJSON());
    this.container.querySelector('#btn-export-csv').addEventListener('click', () => this.runner.exportCSV());
  }

  updateCardResult(id, res) {
    const card = this.container.querySelector(`#card-${id}`);
    const badge = this.container.querySelector(`#badge-${id}`);
    const details = this.container.querySelector(`#details-${id}`);

    if (res.status === 'PASS') {
      badge.textContent = 'PASS';
      badge.style.background = '#16a34a';
      badge.style.color = '#fff';
      card.style.borderLeftColor = '#16a34a';
    } else {
      badge.textContent = 'FAIL';
      badge.style.background = '#dc2626';
      badge.style.color = '#fff';
      card.style.borderLeftColor = '#dc2626';
    }

    details.style.display = 'block';
    details.innerHTML = `
      <div style="color:${res.status === 'PASS' ? '#4ade80' : '#f87171'}; font-weight:bold; margin-bottom:4px;">${res.message}</div>
      <div style="font-family:monospace; font-size:10px; color:#cbd5e1; background:#0f172a; padding:6px; border-radius:4px;">
        ${Object.entries(res.metrics).map(([k, v]) => `<div><strong>${k}:</strong> ${v}</div>`).join('')}
      </div>
    `;
  }
}

