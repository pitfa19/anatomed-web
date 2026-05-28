import * as THREE from 'three';
import { sanitizeNodeName } from './isolate';

const LIN_TOKEN = '-lin';
const LABELS_TOKEN = 'labels';

export interface SceneIndex {
  /** sanitized partId → its node in the scene */
  partNode: Map<string, THREE.Object3D>;
  /** sanitized partId → leaf (renderable, non-line, non-label) meshes in subtree */
  partMeshes: Map<string, THREE.Mesh[]>;
  /** sanitized partId → `-line` connector meshes in subtree */
  partLineMeshes: Map<string, THREE.Mesh[]>;
  /** sanitized partId → ancestor chain (node → … → root) for visibility cascade */
  partAncestors: Map<string, THREE.Object3D[]>;
  /** every leaf mesh in the scene */
  allLeaves: THREE.Mesh[];
  /** every `-line` connector mesh in the scene */
  allLines: THREE.Mesh[];
}

function isLine(o: THREE.Object3D): boolean {
  return o.name.includes(LIN_TOKEN);
}
function isLabelMesh(o: THREE.Object3D): boolean {
  return o.name.includes(LABELS_TOKEN);
}

/** Build (and cache on `scene.userData`) an index that maps each catalog part
 *  of this system to the meshes/lines/ancestors needed to flip its visibility
 *  in O(visibleParts) rather than re-traversing the whole scene. Built once
 *  per cached GLTF scene instance. */
export function buildSceneIndex(scene: THREE.Object3D, partIds: string[]): SceneIndex {
  const cached = (scene.userData as { __anatomedIndex?: SceneIndex }).__anatomedIndex;
  if (cached) return cached;

  // One pass: collect all leaves/lines and a name→node lookup.
  const nodesByName = new Map<string, THREE.Object3D>();
  const allLeaves: THREE.Mesh[] = [];
  const allLines: THREE.Mesh[] = [];
  scene.traverse((o) => {
    if (!nodesByName.has(o.name)) nodesByName.set(o.name, o);
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    if (isLine(o)) allLines.push(m);
    else if (!isLabelMesh(o)) allLeaves.push(m);
  });

  const partNode = new Map<string, THREE.Object3D>();
  const partMeshes = new Map<string, THREE.Mesh[]>();
  const partLineMeshes = new Map<string, THREE.Mesh[]>();
  const partAncestors = new Map<string, THREE.Object3D[]>();

  for (const id of partIds) {
    const key = sanitizeNodeName(id);
    const node = nodesByName.get(key);
    if (!node) continue;
    partNode.set(key, node);
    const meshes: THREE.Mesh[] = [];
    const lines: THREE.Mesh[] = [];
    node.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      if (isLine(o)) lines.push(m);
      else if (!isLabelMesh(o)) meshes.push(m);
    });
    partMeshes.set(key, meshes);
    partLineMeshes.set(key, lines);
    const anc: THREE.Object3D[] = [];
    for (let p: THREE.Object3D | null = node; p; p = p.parent) anc.push(p);
    partAncestors.set(key, anc);
  }

  const index: SceneIndex = {
    partNode,
    partMeshes,
    partLineMeshes,
    partAncestors,
    allLeaves,
    allLines,
  };
  (scene.userData as { __anatomedIndex?: SceneIndex }).__anatomedIndex = index;
  return index;
}
