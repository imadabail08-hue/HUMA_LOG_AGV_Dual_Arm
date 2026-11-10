import * as THREE from 'three';

/**
 * Gestionnaire d'obstacles dynamiques interactifs (Opérateur traversant l'allée, palette)
 * Permet de tester en direct la réaction du LiDAR, le ralentissement et l'arrêt de sécurité.
 */
export class ObstacleManager {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'DynamicObstacles';
    this.scene.add(this.group);

    this.isActive = false;
    this.position = new THREE.Vector3(0.5, 0, -1.0); // En travers de l'allée centrale
    this.radius = 0.38; // Rayon de détection LiDAR (m)

    this.initMesh();
  }

  initMesh() {
    // Mannequin d'opérateur mobile avec gilet orange et casque
    this.meshGroup = new THREE.Group();

    const suitMat = new THREE.MeshStandardMaterial({ color: 0x1f2937 });
    const vestMat = new THREE.MeshStandardMaterial({ color: 0xf97316 }); // Orange fluo
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xd97706 });
    const helmetMat = new THREE.MeshStandardMaterial({ color: 0xfacc15 });

    // Jambes
    const legGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.85, 12);
    const l1 = new THREE.Mesh(legGeo, suitMat);
    l1.position.set(-0.12, 0.425, 0);
    const l2 = new THREE.Mesh(legGeo, suitMat);
    l2.position.set(0.12, 0.425, 0);
    this.meshGroup.add(l1);
    this.meshGroup.add(l2);

    // Torse
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.55, 0.22), vestMat);
    torso.position.set(0, 1.15, 0);
    this.meshGroup.add(torso);

    // Tête + Casque
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.11, 16, 16), skinMat);
    head.position.set(0, 1.55, 0);
    this.meshGroup.add(head);

    const helmet = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.08, 16), helmetMat);
    helmet.position.set(0, 1.62, 0);
    this.meshGroup.add(helmet);

    // Disque de zone d'encombrement rouge translucide au sol
    const ringGeo = new THREE.RingGeometry(this.radius - 0.04, this.radius, 32);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xef4444, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.005;
    this.meshGroup.add(ring);

    this.meshGroup.position.copy(this.position);
    this.meshGroup.visible = false;
    this.group.add(this.meshGroup);
  }

  toggle(active = null, x = 0.5, z = -1.0) {
    this.isActive = active !== null ? active : !this.isActive;
    this.meshGroup.visible = this.isActive;
    if (this.isActive) {
      this.position.set(x, 0, z);
      this.meshGroup.position.copy(this.position);
    }
    return this.isActive;
  }

  setPosition(x, z) {
    this.position.set(x, 0, z);
    this.meshGroup.position.copy(this.position);
  }

  getObstacleList() {
    if (!this.isActive) return [];
    return [{
      position: this.position,
      radius: this.radius
    }];
  }

  /**
   * Animation facultative de traversée de l'allée
   */
  update(dt, speedScale = 1.0) {
    if (!this.isActive) return;
    // Légère oscillation de marche
    this.meshGroup.position.copy(this.position);
  }
}

