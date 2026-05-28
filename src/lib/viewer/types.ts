import type * as THREE from 'three';

export type SystemId =
  | 'skeleton'
  | 'muscles'
  | 'nerves'
  | 'vessels'
  | 'organs'
  | 'joints'
  | 'insertions'
  | 'regions';

export interface SystemMeta {
  id: SystemId;
  label_en: string;
  label_hr: string;
  glb: string;
  tint: string;
}

export interface Part {
  id: string;
  system: SystemId;
  name_en: string;
  name_lat: string;
  side?: 'l' | 'r';
}

export interface PartsCatalog {
  systems: SystemMeta[];
  parts: Part[];
}

export interface LandmarkAnchor {
  key: string;
  text: string;
  /** The `.t` label-anchor world position (off the bone, where a chip sits). */
  position: THREE.Vector3;
  /** The landmark's point ON the bone surface (far end of its `-line`
   *  connector). Used to snap the hover region-highlight to the actual spot. */
  surface: THREE.Vector3;
  /** 'active' = belongs to the centered/isolated part. 'extra' = belongs to a
   *  part the user ticked in the neighbors panel. Kept for cleanup tracking,
   *  but per-part visibility is now driven by `partId` matched against
   *  `labelsByPartId` in `Viewer`. */
  origin: 'active' | 'extra';
  /** Owning part's catalog id, used to filter labels on/off per part. */
  partId: string;
}

export interface IsolationFrame {
  hidden: THREE.Object3D[];
  anchors: LandmarkAnchor[];
}

export interface Neighbor {
  id: string;
  system: SystemId;
  dist: number;
}

export type NeighborMap = Record<string, Neighbor[]>;
