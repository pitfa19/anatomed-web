import * as THREE from 'three';
import type { SystemId } from './types';

export interface SystemMaterials {
  /** One shared solid material for every leaf mesh of the system (replaces the
   *  old per-mesh MeshStandardMaterial — ~890 allocations for the skeleton). */
  solid: THREE.MeshStandardMaterial;
  /** Shared connector-line material (kept for the few line meshes; lines are
   *  no longer shown in `/viewer`, but the material assignment is harmless). */
  line: THREE.MeshBasicMaterial;
}

const cache = new Map<string, SystemMaterials>();

/** Cached per `systemId+tint`, so the materials are created once for the app's
 *  lifetime and shared across every mesh of the system. */
export function getSystemMaterials(systemId: SystemId, tint: string): SystemMaterials {
  const key = `${systemId}|${tint}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const color = new THREE.Color(tint);
  const mats: SystemMaterials = {
    solid: new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.05 }),
    line: new THREE.MeshBasicMaterial({
      color: 0x4a4a4a,
      transparent: true,
      opacity: 0.6,
      depthWrite: false,
    }),
  };
  cache.set(key, mats);
  return mats;
}
