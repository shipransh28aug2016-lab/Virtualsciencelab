/**
 * XI-PHY-A04 — radius of curvature by spherometer. The instrument, the surfaces, the contact, the backlash and the legs on
 * paper are the shared spherometer kit's; this file is the bench's identity and its store.
 */
import { createSpherometer } from '../../../../../shared/measure/createSpherometer.js';
import { SPHEROMETERS } from '../../../../../shared/measure/instruments.js';
import { SURFACES } from '../../../../../shared/measure/spherometer.js';

export const CFG = {
  code: 'XI-PHY-A04',
  title: 'Spherometer: radius of curvature of a spherical surface',
  subtitle: 'CBSE Class XI · Measurement · the sagitta to a hundredth of a millimetre, the legs from a ruler, and R = l²/6h + h/2',
  instruments: SPHEROMETERS, surfaces: SURFACES,
  camera: { position: [1.5, 2.1, 8.5], fov: 34, target: [0, 1.3, 0], min: 2, max: 13, polar: [0.5, Math.PI / 2.05] },
};

export const useSpherometer = createSpherometer();
