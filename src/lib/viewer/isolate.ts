import * as THREE from 'three';
import type { IsolationFrame, LandmarkAnchor } from './types';

const LIN_TOKEN = '-lin';
const LABELS_TOKEN_SANITIZED = 'labels';

export function sanitizeNodeName(name: string): string {
  return THREE.PropertyBinding.sanitizeNodeName(name);
}

export function isLeafPart(o: THREE.Object3D): boolean {
  if (!(o as THREE.Mesh).isMesh) return false;
  if (o.name.includes(LIN_TOKEN)) return false;
  if (o.name.includes(LABELS_TOKEN_SANITIZED)) return false;
  return true;
}

export function findPartByName(root: THREE.Object3D, id: string): THREE.Object3D | null {
  const target = sanitizeNodeName(id);
  let found: THREE.Object3D | null = null;
  root.traverse((o) => {
    if (!found && o.name === target) found = o;
  });
  return found;
}

export function applyIsolation(root: THREE.Object3D, partId: string): IsolationFrame {
  const target = findPartByName(root, partId);
  if (!target) return { hidden: [], anchors: [] };

  const targetSet = new Set<THREE.Object3D>();
  target.traverse((o) => targetSet.add(o));

  const hidden: THREE.Object3D[] = [];
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const isConnector = o.name.includes(LIN_TOKEN) || o.name.includes(LABELS_TOKEN_SANITIZED);
    if (isConnector && !targetSet.has(o)) {
      // Connector lines / leftover label meshes outside the target subtree -
      // hide. Inside the target subtree they stay visible so each label has a
      // 3D line drawn from the bone surface to its anchor position.
      if (o.visible) {
        hidden.push(o);
        o.visible = false;
      }
      return;
    }
    if (targetSet.has(o)) return;
    if (o.visible) {
      hidden.push(o);
      o.visible = false;
    }
  });

  for (let p: THREE.Object3D | null = target; p; p = p.parent) p.visible = true;

  const anchors = collectAnchors(target, 'active', partId);

  return { hidden, anchors };
}

export function collectAnchors(
  target: THREE.Object3D,
  origin: LandmarkAnchor['origin'],
  partId: string,
): LandmarkAnchor[] {
  // Walk to the scene root and force a full matrixWorld refresh from there so
  // every ancestor transform is current - getWorldPosition relies on the
  // accumulated parent chain, not just the target's local matrix.
  let root: THREE.Object3D = target;
  while (root.parent) root = root.parent;
  root.updateMatrixWorld(true);
  const out: LandmarkAnchor[] = [];
  target.traverse((o) => {
    const ud = o.userData as { labelText?: unknown } | undefined;
    const text = ud?.labelText;
    if (typeof text !== 'string' || text.length === 0) return;
    const pos = new THREE.Vector3();
    o.getWorldPosition(pos);
    out.push({ key: o.uuid, text, position: pos, surface: surfacePoint(o, pos), origin, partId });
  });
  return out;
}

/** The landmark's point on the bone surface = the far end of its `-line`
 *  connector (the `.t` anchor sits off the bone at the label; the connector
 *  runs from there to the surface). Returns the connector vertex farthest from
 *  the label anchor; falls back to the anchor itself if there's no connector. */
function surfacePoint(anchorNode: THREE.Object3D, anchorWorld: THREE.Vector3): THREE.Vector3 {
  let best = anchorWorld.clone();
  let bestD = -1;
  const v = new THREE.Vector3();
  anchorNode.traverse((c) => {
    const m = c as THREE.Mesh;
    if (!m.isMesh || !c.name.includes(LIN_TOKEN)) return;
    const pos = m.geometry.attributes.position as THREE.BufferAttribute | undefined;
    if (!pos) return;
    m.updateWorldMatrix(true, false);
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
      const d = v.distanceToSquared(anchorWorld);
      if (d > bestD) {
        bestD = d;
        best.copy(v);
      }
    }
  });
  return best;
}

export function applyMultiIsolation(
  root: THREE.Object3D,
  partIds: string[],
): IsolationFrame {
  const targetSet = new Set<THREE.Object3D>();
  const targetRoots: THREE.Object3D[] = [];
  for (const id of partIds) {
    const t = findPartByName(root, id);
    if (!t) continue;
    targetRoots.push(t);
    t.traverse((o) => targetSet.add(o));
  }
  if (targetRoots.length === 0) return { hidden: [], anchors: [] };

  const hidden: THREE.Object3D[] = [];
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const isConnector =
      o.name.includes(LIN_TOKEN) || o.name.includes(LABELS_TOKEN_SANITIZED);
    if (isConnector && !targetSet.has(o)) {
      if (o.visible) {
        hidden.push(o);
        o.visible = false;
      }
      return;
    }
    if (targetSet.has(o)) return;
    if (o.visible) {
      hidden.push(o);
      o.visible = false;
    }
  });

  for (const t of targetRoots) {
    for (let p: THREE.Object3D | null = t; p; p = p.parent) p.visible = true;
  }

  return { hidden, anchors: [] };
}

export function clearIsolation(frame: IsolationFrame, root: THREE.Object3D): void {
  for (const o of frame.hidden) o.visible = true;
  root.traverse((o) => {
    if (o.name.includes(LIN_TOKEN) || o.name.includes(LABELS_TOKEN_SANITIZED)) {
      o.visible = false;
    }
  });
}

export function computePartCenter(root: THREE.Object3D, partId: string): THREE.Vector3 | null {
  const target = findPartByName(root, partId);
  if (!target) return null;
  const box = new THREE.Box3().setFromObject(target);
  if (box.isEmpty()) return null;
  return box.getCenter(new THREE.Vector3());
}
