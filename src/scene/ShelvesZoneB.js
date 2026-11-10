import * as THREE from 'three';
import { CONFIG } from '../config.js';

/**
 * Zone B : Rayonnage industriel multi-niveaux (3 étagères, 3 niveaux : 30/70/110 cm),
 * allée de 90 cm de largeur libre, étiquettes industrielles d'alvéoles.
 */
export class ShelvesZoneB {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'ShelvesZoneB';
    this.scene.add(this.group);

    // Position centrale de la Zone B
    this.centerPosition = new THREE.Vector3(3.5, 0, 0);
    this.aisleWidth = CONFIG.system.aisleWidthM; // 0.90 m

    // Niveaux d'étagères : 30 cm, 70 cm, 110 cm
    this.levelHeights = CONFIG.shelves.levelHeightsM; // [0.30, 0.70, 1.10]
    this.shelvesCount = CONFIG.shelves.count; // 3 étagères

    // Structure des alvéoles : map id -> info
    this.slots = new Map();
    this.placedBoxes = [];

    this.initShelves();
  }

  initShelves() {
    // Matériaux industriels
    const uprightMat = new THREE.MeshStandardMaterial({
      color: 0x0284c7, // Bleu industriel rayonnage
      metalness: 0.6,
      roughness: 0.4
    });

    const beamMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b, // Orange de sécurité pour les lisses
      metalness: 0.5,
      roughness: 0.4
    });

    const shelfDeckMat = new THREE.MeshStandardMaterial({
      color: 0xd1d5db, // Plateaux caillebotis zingués
      metalness: 0.8,
      roughness: 0.3
    });

    // Dimensions d'une baie d'étagère
    const shelfWidth = 1.4; // Largeur utile en Z
    const shelfDepth = 0.50; // Profondeur en X
    const shelfTotalHeight = 1.45; // Hauteur totale des montants

    // Configuration des étagères :
    // Étagère 1 & 2 d'un côté de l'allée (X = 3.5 + 0.45 + shelfDepth/2 = 4.20 m)
    // Étagère 3 de l'autre côté de l'allée (X = 3.5 - 0.45 - shelfDepth/2 = 2.80 m)
    // Ce qui crée une allée centrale exacte de 90 cm de large où navigue l'AGV !
    const shelfConfigs = [
      { id: 1, name: 'Étagère 1', x: 3.5 + this.aisleWidth / 2 + shelfDepth / 2, z: -1.0, faceSign: -1 },
      { id: 2, name: 'Étagère 2', x: 3.5 + this.aisleWidth / 2 + shelfDepth / 2, z: 1.0, faceSign: -1 },
      { id: 3, name: 'Étagère 3', x: 3.5 - this.aisleWidth / 2 - shelfDepth / 2, z: 0.0, faceSign: 1 }
    ];

    shelfConfigs.forEach(cfg => {
      const shelfGroup = new THREE.Group();
      shelfGroup.position.set(cfg.x, 0, cfg.z);

      // 4 montants verticaux perforés (profilés oméga)
      const postGeo = new THREE.BoxGeometry(0.04, shelfTotalHeight, 0.04);
      const postOffsets = [
        [-shelfDepth / 2 + 0.02, -shelfWidth / 2 + 0.02],
        [-shelfDepth / 2 + 0.02,  shelfWidth / 2 - 0.02],
        [ shelfDepth / 2 - 0.02, -shelfWidth / 2 + 0.02],
        [ shelfDepth / 2 - 0.02,  shelfWidth / 2 - 0.02]
      ];

      postOffsets.forEach(po => {
        const post = new THREE.Mesh(postGeo, uprightMat);
        post.position.set(po[0], shelfTotalHeight / 2, po[1]);
        post.castShadow = true;
        post.receiveShadow = true;
        shelfGroup.add(post);

        // Platine de fixation au sol
        const plateGeo = new THREE.BoxGeometry(0.08, 0.008, 0.08);
        const plate = new THREE.Mesh(plateGeo, uprightMat);
        plate.position.set(po[0], 0.004, po[1]);
        shelfGroup.add(plate);
      });

      // Croisillons de contreventement arrière
      const braceMat = new THREE.MeshBasicMaterial({ color: 0x64748b });
      const braceGeo = new THREE.CylinderGeometry(0.006, 0.006, Math.hypot(shelfTotalHeight, shelfWidth), 6);
      const brace1 = new THREE.Mesh(braceGeo, braceMat);
      brace1.position.set(-cfg.faceSign * (shelfDepth / 2 - 0.02), shelfTotalHeight / 2, 0);
      brace1.rotation.x = Math.atan2(shelfWidth, shelfTotalHeight);
      shelfGroup.add(brace1);

      // Construction des 3 niveaux (30 cm, 70 cm, 110 cm)
      this.levelHeights.forEach((h, levelIdx) => {
        const levelNum = levelIdx + 1; // 1, 2, 3

        // Lisses horizontales avant et arrière
        const beamGeo = new THREE.BoxGeometry(shelfDepth, 0.04, 0.03);
        const beamLeft = new THREE.Mesh(beamGeo, beamMat);
        beamLeft.position.set(0, h - 0.02, -shelfWidth / 2 + 0.02);
        shelfGroup.add(beamLeft);

        const beamRight = new THREE.Mesh(beamGeo, beamMat);
        beamRight.position.set(0, h - 0.02, shelfWidth / 2 - 0.02);
        shelfGroup.add(beamRight);

        // Lisses longitudinales
        const longBeamGeo = new THREE.BoxGeometry(0.03, 0.04, shelfWidth);
        const frontLongBeam = new THREE.Mesh(longBeamGeo, beamMat);
        frontLongBeam.position.set(cfg.faceSign * (shelfDepth / 2 - 0.015), h - 0.02, 0);
        shelfGroup.add(frontLongBeam);

        const backLongBeam = new THREE.Mesh(longBeamGeo, beamMat);
        backLongBeam.position.set(-cfg.faceSign * (shelfDepth / 2 - 0.015), h - 0.02, 0);
        shelfGroup.add(backLongBeam);

        // Plateau caillebotis galvanisé
        const deckGeo = new THREE.BoxGeometry(shelfDepth - 0.04, 0.015, shelfWidth - 0.04);
        const deck = new THREE.Mesh(deckGeo, shelfDeckMat);
        deck.position.set(0, h, 0);
        deck.receiveShadow = true;
        shelfGroup.add(deck);

        // 3 Alvéoles par niveau (A, B, C)
        const slotsLetters = ['A', 'B', 'C'];
        const slotSpacingZ = (shelfWidth - 0.2) / 3;

        slotsLetters.forEach((letter, sIdx) => {
          const slotZ = -shelfWidth / 2 + 0.15 + sIdx * slotSpacingZ;
          const slotId = `E${cfg.id}-N${levelNum}-${letter}`;

          // Coordonnées absolues du centre de l'alvéole
          const absPosition = new THREE.Vector3(
            cfg.x,
            h + 0.01,
            cfg.z + slotZ
          );

          // Position d'approche robot dans l'allée pour desservir cette alvéole
          const approachPosition = new THREE.Vector3(
            3.5, // Centre de l'allée
            0,
            cfg.z + slotZ
          );

          // Décalage pour le bras robot pour déposer au centre de l'alvéole
          const dropPosition = new THREE.Vector3(
            cfg.x - cfg.faceSign * 0.08,
            h + CONFIG.boxes.heightM / 2 + 0.01,
            cfg.z + slotZ
          );

          this.slots.set(slotId, {
            id: slotId,
            shelfId: cfg.id,
            levelNum: levelNum,
            slotLetter: letter,
            height: h,
            absPosition: absPosition,
            approachPosition: approachPosition,
            dropPosition: dropPosition,
            occupied: false,
            boxData: null,
            faceSign: cfg.faceSign
          });

          // Marquage au sol de délimitation de l'alvéole sur le plateau
          const slotMarkGeo = new THREE.PlaneGeometry(0.24, 0.18);
          const slotMarkMat = new THREE.MeshBasicMaterial({
            color: 0x0284c7,
            transparent: true,
            opacity: 0.25
          });
          const slotMark = new THREE.Mesh(slotMarkGeo, slotMarkMat);
          slotMark.rotation.x = -Math.PI / 2;
          slotMark.position.set(0, h + 0.009, slotZ);
          shelfGroup.add(slotMark);

          // Étiquette industrielle avec texte lisible
          const labelCanvas = document.createElement('canvas');
          labelCanvas.width = 256;
          labelCanvas.height = 64;
          const ctx = labelCanvas.getContext('2d');
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, 256, 64);
          ctx.strokeStyle = '#0284c7';
          ctx.lineWidth = 4;
          ctx.strokeRect(2, 2, 252, 60);

          ctx.fillStyle = '#111827';
          ctx.font = 'bold 26px "Segoe UI", Arial, sans-serif';
          ctx.fillText(slotId, 16, 42);

          ctx.fillStyle = '#64748b';
          ctx.font = 'bold 16px "Segoe UI", Arial, sans-serif';
          ctx.fillText(`h=${Math.round(h * 100)}cm`, 160, 42);

          const labelTex = new THREE.CanvasTexture(labelCanvas);
          const labelGeo = new THREE.PlaneGeometry(0.16, 0.04);
          const labelMat = new THREE.MeshBasicMaterial({ map: labelTex });
          const labelMesh = new THREE.Mesh(labelGeo, labelMat);

          labelMesh.position.set(
            cfg.faceSign * (shelfDepth / 2 + 0.005),
            h - 0.02,
            slotZ
          );
          labelMesh.rotation.y = cfg.faceSign === 1 ? -Math.PI / 2 : Math.PI / 2;
          shelfGroup.add(labelMesh);
        });
      });

      // Panneau supérieur d'étagère
      const topSignCanvas = document.createElement('canvas');
      topSignCanvas.width = 512;
      topSignCanvas.height = 128;
      const tctx = topSignCanvas.getContext('2d');
      tctx.fillStyle = '#0f172a';
      tctx.fillRect(0, 0, 512, 128);
      tctx.fillStyle = '#38bdf8';
      tctx.font = 'bold 36px "Segoe UI", Arial, sans-serif';
      tctx.fillText(`ÉTAGÈRE ${cfg.id}`, 30, 60);
      tctx.fillStyle = '#94a3b8';
      tctx.font = '22px "Segoe UI", Arial, sans-serif';
      tctx.fillText(`Niveaux 30 / 70 / 110 cm`, 30, 100);

      const topSignTex = new THREE.CanvasTexture(topSignCanvas);
      const topSignGeo = new THREE.PlaneGeometry(0.6, 0.16);
      const topSignMat = new THREE.MeshBasicMaterial({ map: topSignTex });
      const topSign = new THREE.Mesh(topSignGeo, topSignMat);
      topSign.position.set(0, shelfTotalHeight + 0.09, 0);
      topSign.rotation.y = cfg.faceSign === 1 ? -Math.PI / 2 : Math.PI / 2;
      shelfGroup.add(topSign);

      this.group.add(shelfGroup);
    });
  }

  getSlotInfo(slotId) {
    if (!slotId) return null;
    return this.slots.get(slotId) || null;
  }

  getAvailableSlot(shelfId, levelNum) {
    for (const [id, slot] of this.slots.entries()) {
      if (!slot.occupied) {
        if (shelfId && slot.shelfId !== shelfId) continue;
        if (levelNum && slot.levelNum !== levelNum) continue;
        return slot;
      }
    }
    // Si aucun filtre spécifique ne correspond, retourner le premier libre
    for (const slot of this.slots.values()) {
      if (!slot.occupied) return slot;
    }
    return null;
  }

  /**
   * Enregistre le dépôt d'un colis dans une alvéole
   */
  depositBox(slotId, boxData) {
    const slot = this.slots.get(slotId);
    if (!slot) return false;

    slot.occupied = true;
    slot.boxData = boxData;

    // Positionner le mesh du colis sur l'étagère
    boxData.mesh.position.copy(slot.dropPosition);
    boxData.mesh.rotation.set(0, slot.faceSign === 1 ? 0 : Math.PI, 0);
    this.scene.add(boxData.mesh);
    this.placedBoxes.push(boxData);

    return true;
  }

  reset() {
    this.placedBoxes.forEach(b => {
      this.scene.remove(b.mesh);
      if (b.mesh.geometry) b.mesh.geometry.dispose();
    });
    this.placedBoxes = [];
    for (const slot of this.slots.values()) {
      slot.occupied = false;
      slot.boxData = null;
    }
  }
}

