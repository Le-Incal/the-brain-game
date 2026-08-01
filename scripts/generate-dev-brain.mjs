/**
 * Generates a procedural stand-in brain.glb for local development
 * when the Meshy anatomical model is not yet available.
 *
 * Coordinate system (matches classifyVertex):
 *   x: left(-) / right(+)
 *   y: inferior(-) / superior(+)
 *   z: posterior(-) / anterior(+)
 */
import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { Blob } from 'buffer';

// Minimal polyfills for three's GLTFExporter in Node
if (!globalThis.Blob) globalThis.Blob = Blob;
if (!globalThis.FileReader) {
  globalThis.FileReader = class FileReader {
    result = null;
    onloadend = null;
    onerror = null;
    readAsArrayBuffer(blob) {
      Promise.resolve(blob.arrayBuffer ? blob.arrayBuffer() : blob)
        .then((buf) => {
          this.result = buf;
          this.onloadend?.({ target: this });
        })
        .catch((err) => this.onerror?.(err));
    }
    readAsDataURL() {
      this.result = 'data:,';
      this.onloadend?.({ target: this });
    }
  };
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const outPath = join(__dirname, '../public/brain.glb');

function lobe(name, { sx, sy, sz, px, py, pz, segs = 28 }) {
  const geo = new THREE.SphereGeometry(1, segs, segs);
  geo.scale(sx, sy, sz);
  geo.translate(px, py, pz);
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0xcccccc }));
  mesh.name = name;
  return mesh;
}

const group = new THREE.Group();
group.name = 'Brain';

group.add(lobe('LeftFrontal', { sx: 0.28, sy: 0.32, sz: 0.34, px: -0.22, py: 0.18, pz: 0.28 }));
group.add(lobe('RightFrontal', { sx: 0.28, sy: 0.32, sz: 0.34, px: 0.22, py: 0.18, pz: 0.28 }));
group.add(lobe('LeftParietal', { sx: 0.26, sy: 0.28, sz: 0.26, px: -0.24, py: 0.22, pz: -0.08 }));
group.add(lobe('RightParietal', { sx: 0.26, sy: 0.28, sz: 0.26, px: 0.24, py: 0.22, pz: -0.08 }));
group.add(lobe('LeftTemporal', { sx: 0.22, sy: 0.18, sz: 0.30, px: -0.38, py: -0.08, pz: 0.08 }));
group.add(lobe('RightTemporal', { sx: 0.22, sy: 0.18, sz: 0.30, px: 0.38, py: -0.08, pz: 0.08 }));
group.add(lobe('Occipital', { sx: 0.30, sy: 0.26, sz: 0.22, px: 0, py: 0.08, pz: -0.42 }));
group.add(lobe('Cerebellum', { sx: 0.28, sy: 0.18, sz: 0.20, px: 0, py: -0.32, pz: -0.28, segs: 24 }));
group.add(lobe('BrainStem', { sx: 0.08, sy: 0.22, sz: 0.08, px: 0, py: -0.48, pz: -0.05, segs: 16 }));

const exporter = new GLTFExporter();

exporter.parse(
  group,
  (result) => {
    mkdirSync(dirname(outPath), { recursive: true });
    const buf = Buffer.from(result);
    writeFileSync(outPath, buf);
    console.log(`Wrote ${outPath} (${buf.length} bytes)`);
  },
  (err) => {
    console.error(err);
    process.exit(1);
  },
  { binary: true }
);
