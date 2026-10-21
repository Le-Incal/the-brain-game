/**
 * Where the site loads the brain from (Kyle, 2026-10-20: "the internet is slow
 * where I am, and the brain doesn't load"). Slim copies made by
 * scripts/build-web-assets.py, identical for everything the shader reads; the
 * masters in public/brain.glb and public/maps/ stay for the artwork scripts.
 */
export const BRAIN_MODEL_URL = '/web/brain.glb';

export const MAP_URLS = Object.freeze({
  ao: '/web/maps/brain_ao.png',
  cavity: '/web/maps/brain_cavity.png',
  curvature: '/web/maps/brain_curvature.png',
  etching: '/web/maps/brain_etching.png',
});
