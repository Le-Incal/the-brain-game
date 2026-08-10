import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { execFileSync } from 'node:child_process';
import {
  configureColorMap,
  configureRegionIdMap,
  computeHighlightPulse,
  computeLabelLeaderWidth,
  createRegionPaletteUniforms,
  getAtlasViewForDirection,
  getResponsiveSpecimenScale,
  getResponsiveSpecimenVerticalOffset,
  matchRegionColorSrgb,
  resolveHitRegionId,
  sampleRegionIdPixelsAtUv,
} from './brainScene.js';
import { REGION_IDS, REGIONS } from '../data/regions.js';

describe('BrainScene startup data', () => {
  it('creates sparse atlas shader uniforms without runtime globals', () => {
    const { regionColors, regionIds } = createRegionPaletteUniforms();

    expect(regionIds).toEqual(REGION_IDS);
    expect(regionIds).not.toBe(REGION_IDS);
    expect(regionColors).toHaveLength(REGIONS.length);
    expect(regionColors.every((color) => color.isColor)).toBe(true);
  });
});

describe('computeHighlightPulse', () => {
  it('keeps the target colour visible while oscillating', () => {
    const samples = [0, 200, 400, 600, 800].map(computeHighlightPulse);

    expect(Math.min(...samples)).toBeGreaterThanOrEqual(0.35);
    expect(Math.max(...samples)).toBeLessThanOrEqual(1);
    expect(new Set(samples.map((value) => value.toFixed(3))).size).toBeGreaterThan(1);
  });
});

describe('computeLabelLeaderWidth', () => {
  it('places annotation text beyond the brain with a generous gutter', () => {
    expect(computeLabelLeaderWidth('left', 420, 360, 640, 180)).toBe(100);
    expect(computeLabelLeaderWidth('right', 580, 360, 640, 180)).toBe(100);
  });
});

describe('getResponsiveSpecimenScale', () => {
  it('reduces the specimen on phone screens', () => {
    expect(getResponsiveSpecimenScale(375)).toBe(0.73);
  });

  it('steps up cleanly across phone and tablet breakpoints', () => {
    expect(getResponsiveSpecimenScale(480)).toBe(0.73);
    expect(getResponsiveSpecimenScale(481)).toBe(0.8);
    expect(getResponsiveSpecimenScale(640)).toBe(0.8);
    expect(getResponsiveSpecimenScale(641)).toBe(1);
  });

  it('preserves the desktop specimen scale', () => {
    expect(getResponsiveSpecimenScale(1200)).toBe(1);
  });

  it('moves the phone specimen below the description panel', () => {
    expect(getResponsiveSpecimenVerticalOffset(375)).toBe(-0.2);
    expect(getResponsiveSpecimenVerticalOffset(1200)).toBe(0);
  });
});

describe('configureColorMap', () => {
  it('linearly filters display colours for smooth visual boundaries', () => {
    const texture = {};

    configureColorMap(texture, 8);

    expect(texture.colorSpace).toBe(THREE.SRGBColorSpace);
    expect(texture.flipY).toBe(false);
    expect(texture.generateMipmaps).toBe(false);
    expect(texture.minFilter).toBe(THREE.LinearFilter);
    expect(texture.magFilter).toBe(THREE.LinearFilter);
    expect(texture.anisotropy).toBe(1);
  });
});

describe('configureRegionIdMap', () => {
  it('keeps sparse atlas IDs discrete and outside colour management', () => {
    const texture = {};

    configureRegionIdMap(texture);

    expect(texture.colorSpace).toBe(THREE.NoColorSpace);
    expect(texture.flipY).toBe(false);
    expect(texture.generateMipmaps).toBe(false);
    expect(texture.minFilter).toBe(THREE.NearestFilter);
    expect(texture.magFilter).toBe(THREE.NearestFilter);
    expect(texture.anisotropy).toBe(1);
  });
});

describe('atlas palette matching', () => {
  it('maps canonical and nearby mask pixels to sparse atlas IDs', () => {
    expect(matchRegionColorSrgb([210, 100, 119])).toBe(1);
    expect(matchRegionColorSrgb([211, 101, 120])).toBe(1);
    expect(matchRegionColorSrgb([210, 190, 210])).toBe(15);
  });

  it('keeps black UV gutters unclassified', () => {
    expect(matchRegionColorSrgb([0, 0, 0])).toBeNull();
    expect(matchRegionColorSrgb([10, 3, 6])).toBeNull();
  });
});

describe('categorical atlas picking', () => {
  it('samples the same nearest UV texel used by the region shader', () => {
    const pixels = new Uint8ClampedArray([
      1, 0, 0, 255,
      2, 0, 0, 255,
      0, 0, 0, 255,
      19, 0, 0, 255,
    ]);

    expect(
      sampleRegionIdPixelsAtUv(pixels, 2, 2, new THREE.Vector2(0.1, 0.1))
    ).toBe(1);
    expect(
      sampleRegionIdPixelsAtUv(pixels, 2, 2, new THREE.Vector2(0.9, 0.9))
    ).toBe(19);
    expect(
      sampleRegionIdPixelsAtUv(pixels, 2, 2, new THREE.Vector2(0.1, 0.9))
    ).toBeNull();
  });
});

describe('resolveHitRegionId', () => {
  // A triangle whose corners carry painted COLOR_1 identity, with the id
  // texture unwrapped on TEXCOORD_3 rather than the engraving UVs.
  function buildHit({ regionIds, point }) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3)
    );
    geometry.setAttribute(
      'atlasRegionId',
      new THREE.Float32BufferAttribute(regionIds, 1)
    );
    geometry.setAttribute(
      'uv3',
      new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1], 2)
    );
    const mesh = new THREE.Mesh(geometry);
    mesh.updateMatrixWorld(true);
    return {
      object: mesh,
      face: { a: 0, b: 1, c: 2 },
      point: new THREE.Vector3(...point),
    };
  }

  it('reads the painted identity of the nearest triangle corner', () => {
    const hit = buildHit({ regionIds: [6, 13, 13], point: [0.05, 0.05, 0] });

    expect(resolveHitRegionId(hit)).toBe(6);
    expect(
      resolveHitRegionId(buildHit({ regionIds: [6, 13, 13], point: [0.9, 0.05, 0] }))
    ).toBe(13);
  });

  it('prefers the id texture when it agrees with the painted triangle', () => {
    const hit = buildHit({ regionIds: [6, 13, 13], point: [0.05, 0.05, 0] });

    // The texture is the visual authority, so a click must select what the
    // player can actually see at that texel.
    expect(resolveHitRegionId(hit, () => 13)).toBe(13);
  });

  it('ignores an id texture reading the triangle cannot show', () => {
    const hit = buildHit({ regionIds: [6, 13, 13], point: [0.05, 0.05, 0] });

    // Atlas charts abut without a gutter, so a lookup near a chart border can
    // return unrelated cortex. Picking must not follow it.
    expect(resolveHitRegionId(hit, () => 19)).toBe(6);
  });

  it('returns null when the mesh carries no painted identity', () => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3)
    );
    const mesh = new THREE.Mesh(geometry);
    mesh.updateMatrixWorld(true);

    expect(
      resolveHitRegionId({
        object: mesh,
        face: { a: 0, b: 1, c: 2 },
        point: new THREE.Vector3(0.1, 0.1, 0),
      })
    ).toBeNull();
  });
});

describe('painted atlas integrity', () => {
  it('agrees with the painted master on every region it can display', () => {
    const report = JSON.parse(
      execFileSync('python3', ['scripts/audit-atlas.py'], {
        cwd: process.cwd(),
        encoding: 'utf8',
      })
    );

    // COLOR_1 is the artist's paint and the taxonomy must match it exactly.
    expect(report.paint.undeclaredRegions).toEqual([]);
    expect(report.paint.unpaintedRegions).toEqual([]);
    expect(report.paint.unpaintedVertices).toBe(0);
    expect(report.paint.divisionMismatches).toBe(0);

    // A region is anatomy, so it occupies whole patches of cortex: one, or one
    // per hemisphere. A few vertices stranded inside a neighbour render as a
    // speck of colour far from the region that names them, or as a pinhole
    // inside it, which is exactly what the artist reported on the cingulate.
    Object.entries(report.patches).forEach(([id, sizes]) => {
      expect(sizes.length, `region ${id}`).toBeLessThanOrEqual(3);
      sizes.forEach((size) => expect(size, `region ${id}`).toBeGreaterThan(48));
    });
    expect(report.patches['16']).toHaveLength(1);

    // Language regions are painted on the anatomical left only.
    Object.values(report.lateralization).forEach((region) => {
      expect(region.wrongHemisphereVertices).toBe(0);
      expect(region.meanX).toBeGreaterThan(0);
    });

    expect(report.idTexture.size).toEqual([4096, 4096]);
    expect(report.idTexture.undeclaredValues).toEqual([]);
    expect(report.idTexture.missingRegions).toEqual([]);
    expect(report.model.idUvAttribute).toBe('TEXCOORD_3');

    expect(report.identity.vertexCountMatches).toBe(true);
    expect(report.identity.triangleCountMatches).toBe(true);
    expect(report.identity.maxCandidatesPerTriangle).toBeLessThanOrEqual(4);

    // Every fragment finds a label: the texture carries no unpadded gutter.
    expect(report.fragments.unlabeled).toBe(0);
    // Charts abut without a gutter, so a lookup near a chart border can still
    // read unrelated cortex. What matters is that the renderer rejects those:
    // no fragment may display a region its own triangle does not touch, which
    // is what produced isolated colour flecks.
    expect(report.fragments.effectiveForeign).toBe(0);
    // Where a triangle's three corners name one region there is no border to
    // draw, so the texture must agree with the paint. Anything else renders as
    // a pinhole inside the region or a speck of it stranded outside.
    expect(report.fragments.insideRegionDisagreements).toBe(0);

    expect(report.errors).toEqual([]);
  });
});

describe('atlas view labels', () => {
  it('selects canonical views from model-space camera direction', () => {
    expect(getAtlasViewForDirection(new THREE.Vector3(1, 0, 0))).toBe('left_lateral');
    expect(getAtlasViewForDirection(new THREE.Vector3(-1, 0, 0))).toBe('right_lateral');
    expect(getAtlasViewForDirection(new THREE.Vector3(0, 1, 0))).toBe('superior');
    expect(getAtlasViewForDirection(new THREE.Vector3(0, -1, 0))).toBe('inferior');
    expect(getAtlasViewForDirection(new THREE.Vector3(0, 0, 1))).toBe('anterior');
    expect(getAtlasViewForDirection(new THREE.Vector3(0, 0, -1))).toBe('posterior');
  });
});
