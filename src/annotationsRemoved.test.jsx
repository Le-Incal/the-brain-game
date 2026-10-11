import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
import App from './App.jsx';

const brainSceneModule = await import('./utils/brainScene.js');
const brainLoaderModule = await import('./utils/brainLoader.js');
const indexHtml = readFileSync(fileURLToPath(new URL('../index.html', import.meta.url)), 'utf8');

// Kyle, 2026-10-11: remove the Annotations toggle and the annotations feature
// everywhere, game and Study.
describe('The annotations feature is gone', () => {
  it('has no Annotations toggle', () => {
    expect(renderToStaticMarkup(<App />)).not.toContain('Annotations');
  });

  it('draws no floating labels: no label layer on the scene', () => {
    expect(brainSceneModule.BrainScene.prototype.setLabelsVisible).toBeUndefined();
    expect(brainSceneModule.computeLabelLeaderWidth).toBeUndefined();
    expect(brainSceneModule.getAtlasViewForDirection).toBeUndefined();
  });

  it('builds no label anchors when the model loads', () => {
    for (const name of [
      'computeAtlasAnnotationAnchors',
      'createAtlasAnnotationDefinitions',
      'computeRegionLabelAnchors',
      'assignUvMaskRegionIds',
    ]) {
      expect(brainLoaderModule[name], name).toBeUndefined();
    }
  });

  it('leaves no label styles in the page', () => {
    expect(indexHtml).not.toContain('brain-annotation');
  });
});
