import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Kyle, 2026-10-20: "I think the internet is slow where I am, and the brain
// doesn't load on the landing page." The brain needed about 65 MB: the model
// carried three images we never use (17 MB, our shader replaces its material)
// and the four maps stored three or four channels where the shader reads one.
// The site now loads slim copies, identical for everything the shader reads;
// the masters stay where the artwork scripts read them.

const assets = await import('./utils/webAssets.js').catch(() => ({}));
const at = (path) => fileURLToPath(new URL(path, import.meta.url));
const read = (path) => readFileSync(at(path), 'utf8');
const publicFile = (url) => at(`../public${url}`);

function glbJson(path) {
  const data = readFileSync(path);
  const length = data.readUInt32LE(12);
  return JSON.parse(data.subarray(20, 20 + length).toString('utf8'));
}

function pngHeader(path) {
  const data = readFileSync(path);
  return { width: data.readUInt32BE(16), height: data.readUInt32BE(20), bitDepth: data[24], colorType: data[25] };
}

describe('The slim model', () => {
  it('is loaded from /web/brain.glb', () => {
    expect(assets.BRAIN_MODEL_URL).toBe('/web/brain.glb');
    expect(existsSync(publicFile(assets.BRAIN_MODEL_URL))).toBe(true);
  });

  it('carries no images, and keeps every mesh attribute of the master', () => {
    const slim = glbJson(publicFile('/web/brain.glb'));
    const master = glbJson(publicFile('/brain.glb'));
    expect(slim.images ?? []).toHaveLength(0);
    expect(slim.textures ?? []).toHaveLength(0);
    expect(JSON.stringify(slim.materials ?? [])).not.toMatch(/Texture/);
    const attributes = (gltf) => gltf.meshes.map((mesh) => mesh.primitives.map((p) => Object.keys(p.attributes).sort()));
    expect(attributes(slim)).toEqual(attributes(master));
    expect(slim.accessors.map(({ count, type, componentType }) => [count, type, componentType])).toEqual(
      master.accessors.map(({ count, type, componentType }) => [count, type, componentType])
    );
  });

  it('is about a third of the master', () => {
    expect(statSync(publicFile('/web/brain.glb')).size).toBeLessThan(9_000_000);
    // The master keeps its images for the artwork scripts.
    expect(glbJson(publicFile('/brain.glb')).images).toHaveLength(3);
  });
});

describe('The slim maps', () => {
  it.each(['ao', 'cavity', 'curvature', 'etching'])('%s is one grey channel at 4096 px, from /web/maps', (name) => {
    expect(assets.MAP_URLS[name]).toBe(`/web/maps/brain_${name}.png`);
    expect(pngHeader(publicFile(assets.MAP_URLS[name]))).toEqual({ width: 4096, height: 4096, bitDepth: 8, colorType: 0 });
  });

  it('weigh less than half the masters', () => {
    const total = Object.values(assets.MAP_URLS).reduce((sum, url) => sum + statSync(publicFile(url)).size, 0);
    expect(total).toBeLessThan(18_000_000);
  });

  it('are made by one script, which checks every pixel the shader reads', () => {
    const script = read('../scripts/build-web-assets.py');
    expect(script).toMatch(/np\.array_equal/);
    expect(JSON.parse(read('../package.json')).scripts['web-assets']).toBe('python3 scripts/build-web-assets.py');
  });
});

describe('Where the site loads them', () => {
  it('loads the slim model and maps everywhere, and the masters nowhere', () => {
    expect(read('./App.jsx')).toMatch(/loadBrainModel\(BRAIN_MODEL_URL\)/);
    expect(read('./landing/landing.js')).toMatch(/loadBrainModel\(BRAIN_MODEL_URL\)/);
    expect(read('./utils/brainLoader.js')).toMatch(/export async function loadBrainModel\(url = BRAIN_MODEL_URL\)/);
    const scene = read('./utils/brainScene.js');
    for (const name of ['ao', 'cavity', 'curvature', 'etching']) expect(scene).toContain(`textureLoader.load(MAP_URLS.${name})`);
    for (const source of [read('./App.jsx'), read('./landing/landing.js'), scene]) {
      expect(source).not.toMatch(/'\/brain\.glb'|'\/maps\/brain_(ao|cavity|curvature|etching)\.png'/);
    }
  });

  it('tells the page when every map has arrived', () => {
    const scene = read('./utils/brainScene.js');
    expect(scene).toMatch(/const textureManager = new THREE\.LoadingManager\(\);/);
    expect(scene).toMatch(/this\.texturesReady = new Promise\(\(resolve\) => \{\s*textureManager\.onLoad = resolve;/);
    expect(scene).toMatch(/const textureLoader = new THREE\.TextureLoader\(textureManager\);/);
  });
});
