import * as THREE from 'three';
import { CONFIG } from '../config.js';

/**
 * Système de navigation autonome 2D :
 * - Grille d'occupation 2D haute résolution (0.10 m)
 * - Algorithme de recherche A* avec inflation des obstacles
 * - Contrôleur Pure Pursuit holonome (vx, vy, omega)
 * - Navigation spécifique dans l'allée étroite de 90 cm et évitement dynamique
 */
export class Navigation {
  constructor(robot) {
    this.robot = robot;

    // Dimensions de l'environnement (18 m x 14 m)
    this.originX = -9.0;
    this.originZ = -7.0;
    this.resolution = 0.10; // 10 cm par case
    this.gridWidth = Math.round(18.0 / this.resolution);  // 180 colonnes
    this.gridHeight = Math.round(14.0 / this.resolution); // 140 lignes

    // Grille binaire : 0 = libre, 1 = obstacle
    this.grid = new Uint8Array(this.gridWidth * this.gridHeight);

    // Chemin courant calculé (points mondiaux [ {x, z}, ... ])
    this.currentPath = [];
    this.pathIndex = 0;
    this.lookaheadDist = 0.45; // m
    this.goalTolerance = 0.08; // 8 cm
    this.isNavigating = false;
    this.targetGoal = null;
    this.useLateralCrabbing = true; // Déplacement latéral Mecanum

    this.initStaticObstacles();
  }

  /**
   * Convertit coordonnées métriques en indices de grille
   */
  worldToGrid(x, z) {
    const gx = Math.floor((x - this.originX) / this.resolution + 1e-6);
    const gz = Math.floor((z - this.originZ) / this.resolution + 1e-6);
    return { gx, gz };
  }

  gridToWorld(gx, gz) {
    const x = this.originX + (gx + 0.5) * this.resolution;
    const z = this.originZ + (gz + 0.5) * this.resolution;
    return { x, z };
  }

  isCellValid(gx, gz) {
    return gx >= 0 && gx < this.gridWidth && gz >= 0 && gz < this.gridHeight;
  }

  setObstacleRect(x1, z1, x2, z2) {
    const minG = this.worldToGrid(Math.min(x1, x2), Math.min(z1, z2));
    const maxG = this.worldToGrid(Math.max(x1, x2), Math.max(z1, z2));

    for (let gz = Math.max(0, minG.gz); gz <= Math.min(this.gridHeight - 1, maxG.gz); gz++) {
      for (let gx = Math.max(0, minG.gx); gx <= Math.min(this.gridWidth - 1, maxG.gx); gx++) {
        this.grid[gz * this.gridWidth + gx] = 1;
      }
    }
  }

  initStaticObstacles() {
    this.grid.fill(0);

    // Murs périphériques
    this.setObstacleRect(-9.0, -7.0, -8.6, 7.0); // Mur gauche
    this.setObstacleRect(8.6, -7.0, 9.0, 7.0);   // Mur droit
    this.setObstacleRect(-9.0, -7.0, 9.0, -6.6); // Mur fond
    this.setObstacleRect(-9.0, 6.6, 9.0, 7.0);   // Mur face

    // Zone A : Convoyeur
    this.setObstacleRect(-5.8, -3.8, -4.3, -1.3);

    // Zone Charge : Station Hot-Swap
    this.setObstacleRect(-4.8, 1.8, -3.8, 3.2);

    // Zone B : Rayonnages
    // Étagères 1 & 2 (X de 3.95 à 4.55 m, de Z = -2.2 à +2.2 m)
    this.setObstacleRect(3.95, -2.2, 4.55, 2.2);
    // Étagère 3 (X de 2.45 à 3.05 m, de Z = -1.2 à +1.2 m)
    this.setObstacleRect(2.45, -1.2, 3.05, 1.2);
    // Noter que l'allée centrale reste libre : X de 3.05 à 3.95 m (exactement 90 cm de large !)

    // Barrières de protection
    this.setObstacleRect(-6.5, -3.8, -2.5, -3.6);
    this.setObstacleRect(-6.5, 3.6, -2.5, 3.8);
  }

  /**
   * Planification de trajectoire A*
   */
  planPath(startX, startZ, targetX, targetZ, dynamicObstacles = []) {
    const start = this.worldToGrid(startX, startZ);
    const goal = this.worldToGrid(targetX, targetZ);

    if (!this.isCellValid(start.gx, start.gz) || !this.isCellValid(goal.gx, goal.gz)) {
      return null;
    }

    // Grille de coût temporaire avec inflation des obstacles dynamiques
    const costGrid = new Uint8Array(this.grid);

    // Inflation des obstacles dynamiques (ex: ouvrier en allée)
    dynamicObstacles.forEach(obs => {
      if (obs && obs.position) {
        const radiusG = Math.ceil((obs.radius || 0.45) / this.resolution);
        const center = this.worldToGrid(obs.position.x, obs.position.z);
        for (let dz = -radiusG; dz <= radiusG; dz++) {
          for (let dx = -radiusG; dx <= radiusG; dx++) {
            if (dx * dx + dz * dz <= radiusG * radiusG) {
              const cgx = center.gx + dx;
              const cgz = center.gz + dz;
              if (this.isCellValid(cgx, cgz)) {
                costGrid[cgz * this.gridWidth + cgx] = 1;
              }
            }
          }
        }
      }
    });

    // Si la cible ou le départ est sur un obstacle gonflé, trouver la cellule libre la plus proche
    let actualGoal = goal;
    if (costGrid[goal.gz * this.gridWidth + goal.gx] === 1) {
      let found = false;
      for (let r = 1; r < 8; r++) {
        for (let dz = -r; dz <= r; dz++) {
          for (let dx = -r; dx <= r; dx++) {
            const ngx = goal.gx + dx;
            const ngz = goal.gz + dz;
            if (this.isCellValid(ngx, ngz) && costGrid[ngz * this.gridWidth + ngx] === 0) {
              actualGoal = { gx: ngx, gz: ngz };
              found = true;
              break;
            }
          }
          if (found) break;
        }
        if (found) break;
      }
    }

    // A* standard avec 8 connexions
    const openSet = new Set();
    const startIndex = start.gz * this.gridWidth + start.gx;
    const goalIndex = actualGoal.gz * this.gridWidth + actualGoal.gx;

    const gScore = new Float32Array(this.gridWidth * this.gridHeight).fill(Infinity);
    const fScore = new Float32Array(this.gridWidth * this.gridHeight).fill(Infinity);
    const cameFrom = new Int32Array(this.gridWidth * this.gridHeight).fill(-1);

    gScore[startIndex] = 0;
    const heuristic = (gx, gz) => Math.hypot(gx - actualGoal.gx, gz - actualGoal.gz);
    fScore[startIndex] = heuristic(start.gx, start.gz);
    openSet.add(startIndex);

    const neighbors = [
      { dx: 1, dz: 0, cost: 1.0 },
      { dx: -1, dz: 0, cost: 1.0 },
      { dx: 0, dz: 1, cost: 1.0 },
      { dx: 0, dz: -1, cost: 1.0 },
      { dx: 1, dz: 1, cost: 1.414 },
      { dx: 1, dz: -1, cost: 1.414 },
      { dx: -1, dz: 1, cost: 1.414 },
      { dx: -1, dz: -1, cost: 1.414 }
    ];

    let iterations = 0;
    const maxIter = 8000;

    while (openSet.size > 0 && iterations++ < maxIter) {
      // Trouver le noeud de plus petit fScore
      let current = -1;
      let minF = Infinity;
      for (const idx of openSet) {
        if (fScore[idx] < minF) {
          minF = fScore[idx];
          current = idx;
        }
      }

      if (current === goalIndex) {
        // Chemin reconstitué
        const path = [];
        let curr = current;
        while (curr !== -1) {
          const gz = Math.floor(curr / this.gridWidth);
          const gx = curr % this.gridWidth;
          path.push(this.gridToWorld(gx, gz));
          curr = cameFrom[curr];
        }
        path.reverse();

        // Lissage du chemin
        return this.smoothPath(path);
      }

      openSet.delete(current);
      const curGz = Math.floor(current / this.gridWidth);
      const curGx = current % this.gridWidth;

      for (const nb of neighbors) {
        const ngx = curGx + nb.dx;
        const ngz = curGz + nb.dz;

        if (!this.isCellValid(ngx, ngz)) continue;
        const nIndex = ngz * this.gridWidth + ngx;
        if (costGrid[nIndex] === 1) continue;

        const tentativeG = gScore[current] + nb.cost;
        if (tentativeG < gScore[nIndex]) {
          cameFrom[nIndex] = current;
          gScore[nIndex] = tentativeG;
          fScore[nIndex] = tentativeG + heuristic(ngx, ngz);
          openSet.add(nIndex);
        }
      }
    }

    // Aucun chemin trouvé ou max iterations atteint : fallback direct
    return [
      { x: startX, z: startZ },
      { x: targetX, z: targetZ }
    ];
  }

  /**
   * Lissage du chemin généré par A* pour éliminer les zigzags
   */
  smoothPath(rawPath) {
    if (rawPath.length <= 2) return rawPath;
    const smoothed = [rawPath[0]];
    let currentIdx = 0;

    while (currentIdx < rawPath.length - 1) {
      let farthestVisible = currentIdx + 1;
      for (let testIdx = rawPath.length - 1; testIdx > currentIdx + 1; testIdx--) {
        if (this.isLineOfSightClear(rawPath[currentIdx], rawPath[testIdx])) {
          farthestVisible = testIdx;
          break;
        }
      }
      smoothed.push(rawPath[farthestVisible]);
      currentIdx = farthestVisible;
    }
    return smoothed;
  }

  isLineOfSightClear(p1, p2) {
    const dist = Math.hypot(p2.x - p1.x, p2.z - p1.z);
    const steps = Math.ceil(dist / 0.08);
    for (let s = 1; s < steps; s++) {
      const t = s / steps;
      const x = p1.x + (p2.x - p1.x) * t;
      const z = p1.z + (p2.z - p1.z) * t;
      const g = this.worldToGrid(x, z);
      if (!this.isCellValid(g.gx, g.gz) || this.grid[g.gz * this.gridWidth + g.gx] === 1) {
        return false;
      }
    }
    return true;
  }

  /**
   * Engage la navigation vers un point cible avec orientation finale facultative
   */
  startNavigation(targetX, targetZ, targetHeading = null, dynamicObstacles = []) {
    this.targetGoal = { x: targetX, z: targetZ, heading: targetHeading };
    const rawPath = this.planPath(this.robot.position.x, this.robot.position.z, targetX, targetZ, dynamicObstacles) || [];
    this.currentPath = rawPath.slice();
    // Toujours s'assurer que la destination finale exacte est le dernier point
    if (this.currentPath.length === 0) {
      this.currentPath.push({ x: targetX, z: targetZ });
    } else {
      const last = this.currentPath[this.currentPath.length - 1];
      if (Math.hypot(last.x - targetX, last.z - targetZ) > 0.02) {
        this.currentPath.push({ x: targetX, z: targetZ });
      } else {
        this.currentPath[this.currentPath.length - 1] = { x: targetX, z: targetZ };
      }
    }
    this.pathIndex = 0;
    this.isNavigating = true;
  }

  /**
   * Exécute une itération de suivi Pure Pursuit holonome
   */
  update(dt, dynamicObstacles = []) {
    if (!this.isNavigating || !this.targetGoal || !this.currentPath || this.currentPath.length === 0) {
      this.robot.stop();
      return { isDone: true, isBlocked: false };
    }

    const robX = this.robot.position.x;
    const robZ = this.robot.position.z;
    const robHeading = this.robot.heading;

    // Distance à la cible finale
    const distToGoal = Math.hypot(this.targetGoal.x - robX, this.targetGoal.z - robZ);
    if (distToGoal <= this.goalTolerance) {
      // Ajustement de l'orientation finale si spécifiée
      if (this.targetGoal.heading !== null) {
        let headingError = this.targetGoal.heading - robHeading;
        headingError = Math.atan2(Math.sin(headingError), Math.cos(headingError));

        if (Math.abs(headingError) > 0.05) {
          const omegaCmd = Math.sign(headingError) * Math.min(CONFIG.agv.maxAngularSpeedRadS, Math.max(0.35, Math.abs(headingError) * 2.2));
          this.robot.setSpeeds(0, 0, omegaCmd);
          return { isDone: false, isBlocked: false };
        }
      }

      this.robot.stop();
      this.isNavigating = false;
      return { isDone: true, isBlocked: false };
    }

    // Recherche du point de lookahead sur le chemin
    let lookaheadPoint = this.currentPath[this.currentPath.length - 1];
    for (let i = this.pathIndex; i < this.currentPath.length; i++) {
      const pt = this.currentPath[i];
      const d = Math.hypot(pt.x - robX, pt.z - robZ);
      if (d >= this.lookaheadDist) {
        lookaheadPoint = pt;
        this.pathIndex = i;
        break;
      }
    }

    // Vecteur déplacement vers le lookahead dans le repère global
    const dx = lookaheadPoint.x - robX;
    const dz = lookaheadPoint.z - robZ;
    const angleToTarget = Math.atan2(dz, dx);

    // Transformation en repère local robot
    const cosH = Math.cos(robHeading);
    const sinH = Math.sin(robHeading);
    const localX = dx * cosH + dz * sinH; // Composante avant
    const localY = -dx * sinH + dz * cosH; // Composante latérale gauche (crabbing)

    // Détection d'obstacle sur la trajectoire (LiDAR)
    if (this.robot.sensors.closestObstacleDistM < CONFIG.sensors.obstacleStopDistM) {
      // Obstacle trop proche : Arrêt de sécurité et tentative de replanification
      this.robot.stop();
      return { isDone: false, isBlocked: true };
    }

    // Limitation de vitesse si proche d'un obstacle ou en allée étroite
    let speedLimit = CONFIG.agv.maxLinearSpeedMs;
    if (this.robot.sensors.closestObstacleDistM < CONFIG.sensors.obstacleSlowDistM) {
      speedLimit = CONFIG.agv.safetyZoneSpeedMs; // Vitesse ralentie
    }

    // Contrôleur de vitesse holonome
    const targetDist = Math.hypot(localX, localY);
    let vx = 0;
    let vy = 0;
    if (targetDist > 0.001) {
      vx = (localX / targetDist) * speedLimit;
      vy = (localY / targetDist) * speedLimit;
    }

    // Décélération douce à l'approche de la destination
    if (distToGoal < 0.6) {
      const decel = Math.max(0.15, distToGoal / 0.6);
      vx *= decel;
      vy *= decel;
    }

    // Régulation d'orientation : orienter le robot soit vers la trajectoire soit conserver l'alignement
    let desiredHeading = angleToTarget;
    if (this.targetGoal.heading !== null && distToGoal < 1.0) {
      desiredHeading = this.targetGoal.heading;
    }
    let headingError = desiredHeading - robHeading;
    headingError = Math.atan2(Math.sin(headingError), Math.cos(headingError));

    const omega = Math.sign(headingError) * Math.min(CONFIG.agv.maxAngularSpeedRadS, Math.abs(headingError) * 1.8);

    // Application des commandes Mecanum
    this.robot.setSpeeds(vx, vy, omega);

    return { isDone: false, isBlocked: false };
  }
}

