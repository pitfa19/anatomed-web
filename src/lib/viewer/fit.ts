import * as THREE from 'three';

export interface FitInfo {
  center: THREE.Vector3;
  /** Half-extent used for pan clamping (loose: ~half the smaller frustum). */
  panRadius: number;
}

/** World-space union box of every *visible* renderable mesh across `roots`,
 *  excluding `-line` connector meshes. Returns an empty box if nothing visible. */
export function computeVisibleUnionBox(roots: Iterable<THREE.Object3D>): THREE.Box3 {
  const box = new THREE.Box3();
  const tmp = new THREE.Box3();
  for (const root of roots) {
    // Refresh matrices: on the first frame after a deep-link mount nothing has
    // rendered yet, so matrixWorld is identity and the bbox would land at the
    // origin. After the first frame this is a no-op.
    root.updateMatrixWorld(true);
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      if (!o.visible) return;
      if (o.name.includes('-line')) return;
      // A parent being invisible hides this mesh too; `o.visible` only reflects
      // the local flag. Walk up to confirm the whole chain is visible.
      for (let p: THREE.Object3D | null = o.parent; p; p = p.parent) {
        if (!p.visible) return;
      }
      if (m.geometry.boundingBox === null) m.geometry.computeBoundingBox();
      tmp.copy(m.geometry.boundingBox!).applyMatrix4(o.matrixWorld);
      box.union(tmp);
    });
  }
  return box;
}

/** Aim the orthographic camera at `box` and size the frustum to contain it.
 *  Pure camera/controls mutation; mirrors the original SystemModel math. */
export function fitOrthoToBox(
  camera: THREE.Camera,
  controls: unknown,
  box: THREE.Box3,
  viewport: { width: number; height: number },
  margin = 1.25,
): FitInfo | null {
  if (!(camera as THREE.OrthographicCamera).isOrthographicCamera) return null;
  if (box.isEmpty()) return null;
  if (viewport.width <= 0 || viewport.height <= 0) return null;
  const ortho = camera as THREE.OrthographicCamera;

  const center = box.getCenter(new THREE.Vector3());
  const sizeV = box.getSize(new THREE.Vector3());

  // Same matrix-staleness guard as the bbox: on the first effect after a
  // deep-link mount the camera's matrixWorld may still be identity, so
  // getWorldDirection returns the default −z.
  ortho.updateMatrixWorld(true);
  const dir = new THREE.Vector3();
  ortho.getWorldDirection(dir);
  ortho.position.copy(center).addScaledVector(dir, -Math.max(sizeV.length() * 2, 5));
  ortho.lookAt(center);
  ortho.updateMatrixWorld(true);

  const aspect = viewport.width / viewport.height;
  const fitWidth = Math.max(sizeV.x, sizeV.y * aspect) * margin;
  const fitHeight = fitWidth / aspect;
  ortho.left = -fitWidth / 2;
  ortho.right = fitWidth / 2;
  ortho.top = fitHeight / 2;
  ortho.bottom = -fitHeight / 2;
  ortho.zoom = 1;
  ortho.updateProjectionMatrix();

  const c = controls as { target?: THREE.Vector3; update?: () => void } | null;
  if (c?.target) {
    c.target.copy(center);
    c.update?.();
  }

  return {
    center: center.clone(),
    panRadius: Math.max(Math.min(fitWidth, fitHeight) / 2, 0.5),
  };
}

/** Convenience: fit to a single object (plus extras), preserving the original
 *  SystemModel behaviour. */
export function fitOrthoToObject(
  camera: THREE.Camera,
  controls: unknown,
  target: THREE.Object3D,
  viewport: { width: number; height: number },
  margin = 1.25,
  alsoInclude: THREE.Object3D[] = [],
): FitInfo | null {
  const box = computeVisibleUnionBox([target, ...alsoInclude]);
  return fitOrthoToBox(camera, controls, box, viewport, margin);
}
