import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { computeVisibleUnionBox, fitOrthoToBox, type FitInfo } from '../../lib/viewer/fit';

export interface CameraRigHandle {
  recenter: () => void;
}

interface Props {
  /** Changes whenever the visible-part configuration or viewport changes,
   *  triggering a refit. */
  fitKey: string;
  /** Returns the currently-mounted system scene roots to union for the fit. */
  getRoots: () => THREE.Object3D[];
  onFit: (info: FitInfo | null) => void;
}

/** Owns the orthographic camera fit. Refits to the union bounding box of every
 *  visible mesh across all mounted SystemLayers whenever `fitKey` changes, and
 *  re-runs the fit for the first few frames after (OrbitControls' per-frame
 *  `update()` can drift the camera off a fresh fit before its spherical state
 *  settles — running the fit inside useFrame overrides that drift). */
const CameraRig = forwardRef<CameraRigHandle, Props>(function CameraRig(
  { fitKey, getRoots, onFit },
  ref,
) {
  const { camera, controls, size } = useThree();
  const pendingPostFitFramesRef = useRef(0);

  const doFit = () => {
    const box = computeVisibleUnionBox(getRoots());
    const fit = fitOrthoToBox(camera, controls, box, size);
    onFit(fit);
    return fit;
  };

  useImperativeHandle(ref, () => ({ recenter: () => doFit() }));

  // Refit on configuration / viewport / camera change.
  useEffect(() => {
    doFit();
    pendingPostFitFramesRef.current = 6;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey, camera.uuid, size.width, size.height]);

  useFrame(() => {
    if (pendingPostFitFramesRef.current <= 0) return;
    pendingPostFitFramesRef.current--;
    doFit();
  });

  return null;
});

export default CameraRig;
