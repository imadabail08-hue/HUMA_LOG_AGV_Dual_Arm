import * as THREE from 'three';

/**
 * Environnement d'atelier industriel HUMA-LOG
 * Échelle réelle en mètres, repère Three.js (Y vers le haut).
 */
export class FactoryEnvironment {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'FactoryEnvironment';
    this.scene.add(this.group);

    this.initLights();
    this.initFloor();
    this.initWallsAndRoof();
    this.initZoneMarkings();
    this.initGuardRails();
    this.initSignage();
    this.initHumanoidWorker();
  }

  initLights() {
    // Éclairage ambiant industriel doux
    const ambientLight = new THREE.AmbientLight(0xdce7f0, 0.65);
    this.group.add(ambientLight);

    // Lumières zénithales principales (High-Bay LED)
    const dirLight1 = new THREE.DirectionalLight(0xffffff, 0.95);
    dirLight1.position.set(4, 8, 3);
    dirLight1.castShadow = true;
    dirLight1.shadow.mapSize.width = 2048;
    dirLight1.shadow.mapSize.height = 2048;
    dirLight1.shadow.camera.near = 0.5;
    dirLight1.shadow.camera.far = 25;
    dirLight1.shadow.camera.left = -10;
    dirLight1.shadow.camera.right = 10;
    dirLight1.shadow.camera.top = 8;
    dirLight1.shadow.camera.bottom = -8;
    dirLight1.shadow.bias = -0.0005;
    this.group.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0xaad5ff, 0.4);
    dirLight2.position.set(-6, 7, -4);
    this.group.add(dirLight2);

    // Suspensions industrielles au plafond
    const bayPositions = [
      [-4, 5.5, -2], [0, 5.5, -2], [4, 5.5, -2],
      [-4, 5.5, 2],  [0, 5.5, 2],  [4, 5.5, 2]
    ];
    bayPositions.forEach(pos => {
      const lampGeo = new THREE.CylinderGeometry(0.3, 0.45, 0.2, 16);
      const lampMat = new THREE.MeshStandardMaterial({ color: 0x22262c, roughness: 0.4 });
      const lamp = new THREE.Mesh(lampGeo, lampMat);
      lamp.position.set(pos[0], pos[1], pos[2]);

      // Bulbe émissif
      const bulbGeo = new THREE.SphereGeometry(0.18, 16, 8);
      const bulbMat = new THREE.MeshBasicMaterial({ color: 0xfff3d1 });
      const bulb = new THREE.Mesh(bulbGeo, bulbMat);
      bulb.position.set(0, -0.05, 0);
      lamp.add(bulb);

      // Câble de suspension
      const cableGeo = new THREE.CylinderGeometry(0.01, 0.01, 1.2, 8);
      const cableMat = new THREE.MeshBasicMaterial({ color: 0x111111 });
      const cable = new THREE.Mesh(cableGeo, cableMat);
      cable.position.set(0, 0.7, 0);
      lamp.add(cable);

      this.group.add(lamp);
    });
  }

  initFloor() {
    // Sol béton industriel époxy poli avec grille d'expansion
    const floorWidth = 18;
    const floorLength = 14;

    // Création d'une texture de sol procédurale pour béton d'usine avec dalles
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 1024;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#2c3238';
    ctx.fillRect(0, 0, 1024, 1024);

    // Micro-texture béton
    for (let i = 0; i < 60000; i++) {
      const x = Math.random() * 1024;
      const y = Math.random() * 1024;
      const v = Math.floor(40 + Math.random() * 25);
      ctx.fillStyle = `rgb(${v}, ${v + 4}, ${v + 8})`;
      ctx.fillRect(x, y, 1.5, 1.5);
    }

    // Joints de dilatation des dalles béton (dalles 2m x 2m)
    ctx.strokeStyle = '#1b1f23';
    ctx.lineWidth = 4;
    for (let p = 0; p <= 1024; p += 128) {
      ctx.beginPath();
      ctx.moveTo(p, 0);
      ctx.lineTo(p, 1024);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, p);
      ctx.lineTo(1024, p);
      ctx.stroke();
    }

    const floorTexture = new THREE.CanvasTexture(canvas);
    floorTexture.wrapS = THREE.RepeatWrapping;
    floorTexture.wrapT = THREE.RepeatWrapping;
    floorTexture.repeat.set(floorWidth / 4, floorLength / 4);

    const floorGeo = new THREE.PlaneGeometry(floorWidth, floorLength);
    const floorMat = new THREE.MeshStandardMaterial({
      map: floorTexture,
      roughness: 0.45,
      metalness: 0.1
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.group.add(floor);
  }

  initWallsAndRoof() {
    const wallMat = new THREE.MeshStandardMaterial({
      color: 0xd0d7de,
      roughness: 0.8
    });
    const plinthMat = new THREE.MeshStandardMaterial({
      color: 0x1a2634,
      roughness: 0.6
    });

    // Mur du fond (Z = -7m)
    const backWallGeo = new THREE.BoxGeometry(18, 6, 0.2);
    const backWall = new THREE.Mesh(backWallGeo, wallMat);
    backWall.position.set(0, 3, -7);
    backWall.receiveShadow = true;
    this.group.add(backWall);

    // Plinthe industrielle basse mur du fond
    const plinthGeo = new THREE.BoxGeometry(18, 0.4, 0.25);
    const plinth = new THREE.Mesh(plinthGeo, plinthMat);
    plinth.position.set(0, 0.2, -6.95);
    this.group.add(plinth);

    // Mur latéral gauche (X = -9m)
    const leftWallGeo = new THREE.BoxGeometry(0.2, 6, 14);
    const leftWall = new THREE.Mesh(leftWallGeo, wallMat);
    leftWall.position.set(-9, 3, 0);
    leftWall.receiveShadow = true;
    this.group.add(leftWall);

    // Plinthe gauche
    const plinthLeftGeo = new THREE.BoxGeometry(0.25, 0.4, 14);
    const plinthLeft = new THREE.Mesh(plinthLeftGeo, plinthMat);
    plinthLeft.position.set(-8.95, 0.2, 0);
    this.group.add(plinthLeft);
  }

  initZoneMarkings() {
    // Marquage au sol sécurité peinture jaune et zébras noir/jaune
    // Helper pour créer un rectangle zébré
    const createZebraMarking = (w, h) => {
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 256;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffcc00';
      ctx.fillRect(0, 0, 256, 256);
      ctx.fillStyle = '#111111';
      ctx.lineWidth = 28;
      for (let i = -256; i < 512; i += 56) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i + 256, 256);
        ctx.stroke();
      }
      const tex = new THREE.CanvasTexture(canvas);
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(w * 2, h * 2);
      const geo = new THREE.PlaneGeometry(w, h);
      const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.85 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.y = 0.003;
      return mesh;
    };

    // Helper pour tracer une ligne jaune au sol
    const createYellowLine = (w, h, x, z) => {
      const geo = new THREE.PlaneGeometry(w, h);
      const mat = new THREE.MeshBasicMaterial({ color: 0xffcc00 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(x, 0.002, z);
      this.group.add(mesh);
      return mesh;
    };

    // ZONE A : Convoyeur (X = -4.5m, Z = -2.5m)
    const zebraA = createZebraMarking(2.6, 2.2);
    zebraA.position.set(-4.5, 0.003, -2.5);
    this.group.add(zebraA);

    // ZONE B : Étagères et allée centrale 90 cm (X = 3.5m, Z = 0m)
    // Allée de 90 cm de large délimitée au sol
    createYellowLine(0.08, 6.0, 3.5 - 0.45, 0); // Bordure gauche allée
    createYellowLine(0.08, 6.0, 3.5 + 0.45, 0); // Bordure droite allée
    // Traits d'accès transversaux
    for (let z = -2.5; z <= 2.5; z += 1.0) {
      createYellowLine(0.9, 0.04, 3.5, z);
    }

    // ZONE CHARGE : Station Hot-Swap (X = -4.5m, Z = 2.5m)
    const zebraCharge = createZebraMarking(2.4, 2.2);
    zebraCharge.position.set(-4.5, 0.003, 2.5);
    this.group.add(zebraCharge);

    // Cible de docking de haute précision au sol (croix + cercle d'alignement ±5mm)
    const targetGeo = new THREE.RingGeometry(0.12, 0.16, 32);
    const targetMat = new THREE.MeshBasicMaterial({ color: 0x00e676 });
    const targetRing = new THREE.Mesh(targetGeo, targetMat);
    targetRing.rotation.x = -Math.PI / 2;
    targetRing.position.set(-4.0, 0.004, 2.5);
    this.group.add(targetRing);

    createYellowLine(0.4, 0.03, -4.0, 2.5);
    createYellowLine(0.03, 0.4, -4.0, 2.5);

    // Trajectoire nominale guide au sol (flèches pointillées entre Zone A et Zone B)
    const trackLineGeo = new THREE.PlaneGeometry(0.06, 7.5);
    const trackMat = new THREE.MeshBasicMaterial({ color: 0x00d2ff, transparent: true, opacity: 0.35 });
    const trackLine = new THREE.Mesh(trackLineGeo, trackMat);
    trackLine.rotation.x = -Math.PI / 2;
    trackLine.rotation.z = Math.PI / 2;
    trackLine.position.set(-0.5, 0.002, 0);
    this.group.add(trackLine);
  }

  initGuardRails() {
    // Barrières de sécurité jaunes industrielles tubulaires
    const railMat = new THREE.MeshStandardMaterial({ color: 0xffcc00, roughness: 0.3, metalness: 0.4 });
    const postMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.5 });

    const createRailSegment = (x1, z1, x2, z2) => {
      const segGroup = new THREE.Group();
      const dx = x2 - x1;
      const dz = z2 - z1;
      const len = Math.hypot(dx, dz);
      const angle = Math.atan2(dx, dz);

      // 2 poteaux
      const postGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.85, 12);
      const post1 = new THREE.Mesh(postGeo, postMat);
      post1.position.set(x1, 0.425, z1);
      const post2 = new THREE.Mesh(postGeo, postMat);
      post2.position.set(x2, 0.425, z2);
      segGroup.add(post1);
      segGroup.add(post2);

      // Rails horizontaux
      const railGeo = new THREE.CylinderGeometry(0.025, 0.025, len, 12);
      const railTop = new THREE.Mesh(railGeo, railMat);
      railTop.rotation.z = Math.PI / 2;
      railTop.rotation.y = angle - Math.PI / 2;
      railTop.position.set((x1 + x2) / 2, 0.8, (z1 + z2) / 2);

      const railMid = new THREE.Mesh(railGeo, railMat);
      railMid.rotation.z = Math.PI / 2;
      railMid.rotation.y = angle - Math.PI / 2;
      railMid.position.set((x1 + x2) / 2, 0.42, (z1 + z2) / 2);

      segGroup.add(railTop);
      segGroup.add(railMid);
      return segGroup;
    };

    // Barrière délimitant le fond de la Zone A
    this.group.add(createRailSegment(-6.5, -3.8, -2.5, -3.8));
    this.group.add(createRailSegment(-6.5, -3.8, -6.5, -1.2));

    // Barrière délimitant l'extérieur de la Zone Charge
    this.group.add(createRailSegment(-6.5, 3.8, -2.5, 3.8));
    this.group.add(createRailSegment(-6.5, 1.4, -6.5, 3.8));
  }

  initSignage() {
    // Panneau principal « HUMA-LOG »
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#0a192f';
    ctx.fillRect(0, 0, 1024, 256);

    ctx.strokeStyle = '#ffc107';
    ctx.lineWidth = 8;
    ctx.strokeRect(10, 10, 1004, 236);

    ctx.fillStyle = '#00d2ff';
    ctx.font = 'bold 74px "Segoe UI", Arial, sans-serif';
    ctx.fillText('HUMA-LOG', 50, 100);

    ctx.fillStyle = '#ffc107';
    ctx.font = 'bold 32px "Segoe UI", Arial, sans-serif';
    ctx.fillText('JUMEAU NUMÉRIQUE - LOGISTIQUE AGV + DUAL ARM', 50, 155);

    ctx.fillStyle = '#a0aec0';
    ctx.font = '24px "Segoe UI", Arial, sans-serif';
    ctx.fillText('Hub E-Commerce & Pièces Détachées | Station Hot-Swap Walker S2 Inspired', 50, 205);

    const bannerTex = new THREE.CanvasTexture(canvas);
    const bannerGeo = new THREE.PlaneGeometry(6.0, 1.5);
    const bannerMat = new THREE.MeshBasicMaterial({ map: bannerTex });
    const banner = new THREE.Mesh(bannerGeo, bannerMat);
    banner.position.set(0, 4.2, -6.85);
    this.group.add(banner);

    // Panneau Zone A
    this.createZoneSign('ZONE A - CONVOYEUR ENTRANT', -4.5, 2.5, -3.7, 0);
    // Panneau Zone B
    this.createZoneSign('ZONE B - RAYONNAGE ALLÉE 90cm', 3.5, 2.5, -3.7, 0);
    // Panneau Zone Charge
    this.createZoneSign('POSTE DE CHARGE & ÉCHANGE BATTERIE HOT-SWAP', -4.5, 2.5, 3.7, Math.PI);
  }

  createZoneSign(text, x, y, z, rotY) {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#111827';
    ctx.fillRect(0, 0, 512, 128);

    ctx.fillStyle = '#ffc107';
    ctx.fillRect(0, 0, 16, 128);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 24px "Segoe UI", Arial, sans-serif';
    ctx.fillText(text, 30, 72);

    const tex = new THREE.CanvasTexture(canvas);
    const geo = new THREE.PlaneGeometry(2.0, 0.5);
    const mat = new THREE.MeshBasicMaterial({ map: tex });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    mesh.rotation.y = rotY;
    this.group.add(mesh);
  }

  initHumanoidWorker() {
    // Humanoïde statique stylisé / décor d'atelier près de la Zone A
    const worker = new THREE.Group();
    worker.name = 'HumanoidWorker';
    worker.position.set(-2.8, 0, -3.2);
    worker.rotation.y = Math.PI * 0.75;

    const suitMat = new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.7 });
    const vestMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.5 }); // Gilet fluo
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.6 });
    const helmetMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 }); // Casque de chantier

    // Jambes
    const legGeo = new THREE.CylinderGeometry(0.09, 0.08, 0.85, 12);
    const leftLeg = new THREE.Mesh(legGeo, suitMat);
    leftLeg.position.set(-0.14, 0.425, 0);
    const rightLeg = new THREE.Mesh(legGeo, suitMat);
    rightLeg.position.set(0.14, 0.425, 0);
    worker.add(leftLeg);
    worker.add(rightLeg);

    // Chaussures de sécurité
    const shoeGeo = new THREE.BoxGeometry(0.13, 0.1, 0.25);
    const shoeMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
    const leftShoe = new THREE.Mesh(shoeGeo, shoeMat);
    leftShoe.position.set(-0.14, 0.05, 0.05);
    const rightShoe = new THREE.Mesh(shoeGeo, shoeMat);
    rightShoe.position.set(0.14, 0.05, 0.05);
    worker.add(leftShoe);
    worker.add(rightShoe);

    // Torse avec gilet haute visibilité
    const torsoGeo = new THREE.BoxGeometry(0.38, 0.55, 0.22);
    const torso = new THREE.Mesh(torsoGeo, vestMat);
    torso.position.set(0, 1.15, 0);
    worker.add(torso);

    // Bandes réfléchissantes sur le gilet
    const stripeGeo = new THREE.PlaneGeometry(0.385, 0.05);
    const stripeMat = new THREE.MeshBasicMaterial({ color: 0xecfdf5 });
    const stripe1 = new THREE.Mesh(stripeGeo, stripeMat);
    stripe1.position.set(0, 1.25, 0.111);
    const stripe2 = new THREE.Mesh(stripeGeo, stripeMat);
    stripe2.position.set(0, 1.05, 0.111);
    worker.add(stripe1);
    worker.add(stripe2);

    // Tête
    const headGeo = new THREE.SphereGeometry(0.11, 16, 16);
    const head = new THREE.Mesh(headGeo, skinMat);
    head.position.set(0, 1.55, 0);
    worker.add(head);

    // Casque blanc
    const helmetGeo = new THREE.CylinderGeometry(0.14, 0.14, 0.09, 16);
    const helmet = new THREE.Mesh(helmetGeo, helmetMat);
    helmet.position.set(0, 1.62, 0);
    worker.add(helmet);

    // Bras (un bras avec tablette de supervision)
    const armGeo = new THREE.CylinderGeometry(0.06, 0.05, 0.6, 12);
    const leftArm = new THREE.Mesh(armGeo, suitMat);
    leftArm.position.set(-0.25, 1.15, 0);
    leftArm.rotation.z = 0.15;
    worker.add(leftArm);

    // Bras droit tenant une tablette
    const rightArm = new THREE.Mesh(armGeo, suitMat);
    rightArm.position.set(0.25, 1.15, 0.15);
    rightArm.rotation.x = -Math.PI / 4;
    worker.add(rightArm);

    // Tablette
    const tabletGeo = new THREE.BoxGeometry(0.24, 0.16, 0.015);
    const tabletMat = new THREE.MeshStandardMaterial({ color: 0x000000 });
    const tablet = new THREE.Mesh(tabletGeo, tabletMat);
    tablet.position.set(0.25, 1.1, 0.35);
    tablet.rotation.x = -Math.PI / 3;

    // Écran allumé
    const screenGeo = new THREE.PlaneGeometry(0.22, 0.14);
    const screenMat = new THREE.MeshBasicMaterial({ color: 0x00d2ff });
    const screen = new THREE.Mesh(screenGeo, screenMat);
    screen.position.set(0, 0, 0.01);
    tablet.add(screen);
    worker.add(tablet);

    this.group.add(worker);
  }
}

