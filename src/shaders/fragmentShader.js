const fragmentShader = /* glsl */ `
  uniform sampler2D uAoMap;
  uniform sampler2D uCavityMap;
  uniform sampler2D uCurvatureMap;
  uniform sampler2D uEtchingMap;
  uniform sampler2D uRegionIdMap;

  uniform vec3 uLightDir1;
  uniform vec3 uLightDir2;

  uniform float uColorMode;
  uniform vec3 uRegionColors[20];
  uniform float uRegionIds[20];
  uniform float uHighlight;
  uniform float uSelectedRegion;

  uniform vec3 uInkColor;
  uniform vec3 uPaperColor;

  // How far each region tint is blended toward parchment: lower is stronger
  // colour. The handoff colour rule asks for 35-45% palette, but that read as
  // washed out on screen, so the artist called for more saturation.
  const float REGION_PARCHMENT_BLEND = 0.45;

  varying vec2 vUv0;
  varying vec2 vUvRegionId;
  varying vec3 vObjectPosition;
  varying vec3 vWorldPosition;
  varying vec3 vWorldNormal;
  varying float vAtlasRegionId;
  varying vec4 vAtlasRegionCandidates;

  float antialiasedStripe(float coordinate, float halfWidth) {
    float cell = fract(coordinate);
    float distanceToCenter = abs(cell - 0.5);
    float pixelWidth = max(fwidth(coordinate), 0.0001);
    float line = 1.0 - smoothstep(halfWidth - pixelWidth, halfWidth + pixelWidth, distanceToCenter);
    float minificationFade = 1.0 - smoothstep(0.12, 0.32, pixelWidth);
    return line * minificationFade;
  }

  float antialiasedThreshold(float value, float threshold) {
    float filterWidth = clamp(fwidth(value) * 0.75, 0.025, 0.12);
    return smoothstep(threshold - filterWidth, threshold + filterWidth, value);
  }

  float hatchPlane(vec2 position, float angle, float density, float halfWidth) {
    vec2 direction = vec2(cos(angle), sin(angle));
    float coordinate = dot(position, direction) * density;
    return antialiasedStripe(coordinate, halfWidth);
  }

  float triplanarHatch(vec3 position, vec3 normal, float angle, float density, float halfWidth) {
    vec3 weights = pow(abs(normal), vec3(7.0));
    weights /= max(weights.x + weights.y + weights.z, 0.0001);
    float hatchX = hatchPlane(position.yz, angle, density, halfWidth);
    float hatchY = hatchPlane(position.xz, angle + 0.35, density, halfWidth);
    float hatchZ = hatchPlane(position.xy, angle - 0.25, density, halfWidth);
    return hatchX * weights.x + hatchY * weights.y + hatchZ * weights.z;
  }

  // Atlas charts abut without a UV gutter, so a lookup within half a texel of a
  // chart border can read a region from unrelated cortex. Each triangle carries
  // the label set of its own one-hop surface neighbourhood, which is the only
  // vocabulary a fragment of that triangle may display.
  bool isRegionCandidate(int regionId) {
    return
      abs(vAtlasRegionCandidates.x - float(regionId)) < 0.5 ||
      abs(vAtlasRegionCandidates.y - float(regionId)) < 0.5 ||
      abs(vAtlasRegionCandidates.z - float(regionId)) < 0.5 ||
      abs(vAtlasRegionCandidates.w - float(regionId)) < 0.5;
  }

  // Interpolated identity is meaningless between two differently labelled
  // corners, so snap to the candidate it lies closest to.
  int nearestCandidateRegion() {
    float best = vAtlasRegionCandidates.x;
    float bestDistance = abs(vAtlasRegionId - vAtlasRegionCandidates.x);
    float others[3];
    others[0] = vAtlasRegionCandidates.y;
    others[1] = vAtlasRegionCandidates.z;
    others[2] = vAtlasRegionCandidates.w;
    for (int i = 0; i < 3; i++) {
      float distance = abs(vAtlasRegionId - others[i]);
      if (others[i] > 0.5 && distance < bestDistance) {
        best = others[i];
        bestDistance = distance;
      }
    }
    return int(floor(best + 0.5));
  }

  vec3 getRegionColor(int regionId) {
    vec3 color = uRegionColors[0];
    for (int i = 0; i < 20; i++) {
      if (int(floor(uRegionIds[i] + 0.5)) == regionId) {
        color = uRegionColors[i];
      }
    }
    return color;
  }

  void main() {
    vec3 normal = normalize(vWorldNormal);
    vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
    vec3 lightDirection1 = normalize(uLightDir1);
    vec3 lightDirection2 = normalize(uLightDir2);
    float light1 = dot(normal, lightDirection1) * 0.5 + 0.5;
    float light2 = dot(normal, lightDirection2) * 0.5 + 0.5;
    float light = clamp(light1 * 0.70 + light2 * 0.20 + 0.10, 0.0, 1.0);

    float ao = texture2D(uAoMap, vUv0).r;
    float cavity = texture2D(uCavityMap, vUv0).r;
    float curvature = texture2D(uCurvatureMap, vUv0).r;
    // Implicit derivatives select and blend mip levels continuously. A forced
    // sharp mip bias makes the 4K strokes glitter as the surface rotates.
    float etching = texture2D(uEtchingMap, vUv0).r;

    float shadow = 1.0 - light;
    float tonalDarkness = shadow * 0.24 + (1.0 - ao) * 0.34;
    tonalDarkness = clamp(tonalDarkness, 0.0, 1.0);

    // Cavity and curvature are sparse positive-detail masks, not grayscale
    // multipliers. Their useful values sit well below the old thresholds.
    float cavityInk = smoothstep(0.05, 0.28, cavity) * 0.78;
    float curvatureInk = smoothstep(0.14, 0.34, curvature) * 0.52;
    float structuralInk = max(cavityInk, curvatureInk);

    float viewFacing = clamp(dot(normal, viewDirection), 0.0, 1.0);
    float silhouette = pow(1.0 - viewFacing, 3.2) * 0.48;
    structuralInk = max(structuralInk, silhouette);

    float hatchMask = smoothstep(0.42, 0.74, tonalDarkness);
    float deepHatchMask = smoothstep(0.62, 0.88, tonalDarkness);

    float hatch1 = triplanarHatch(vWorldPosition, normal, 0.72, 26.0, 0.055) * hatchMask * 0.34;
    float hatch2 = triplanarHatch(vWorldPosition, normal, -0.48, 31.0, 0.045) * deepHatchMask * 0.26;
    float hatchInk = max(hatch1, hatch2);
    // Keep the baked strokes modestly lighter without changing their threshold;
    // derivative filtering preserves sharpness and suppresses subpixel shimmer.
    float etchedLine = antialiasedThreshold(etching, 0.80);
    float bakedEtching = etchedLine * 0.54;
    float engravedInk = max(hatchInk, bakedEtching);

    // The painted id texture is the visual authority. It is baked against
    // TEXCOORD_3 and read with NEAREST, so a region id is never interpolated
    // into an id that does not exist.
    int atlasRegionId = int(floor(texture2D(uRegionIdMap, vUvRegionId).r * 255.0 + 0.5));
    bool atlasRegionAllowed = atlasRegionId > 0 && isRegionCandidate(atlasRegionId);
    int regionId = atlasRegionAllowed ? atlasRegionId : nearestCandidateRegion();
    bool validRegion = regionId > 0;
    vec3 regionColor = getRegionColor(regionId);
    vec3 tintedRegionColor = mix(regionColor, uPaperColor, REGION_PARCHMENT_BLEND);

    bool selectionActive = uSelectedRegion > -0.5;
    int selectedRegionId = int(floor(uSelectedRegion + 0.5));
    bool selectedRegion = selectionActive && regionId == selectedRegionId;
    bool feedbackActive =
      uHighlight > -0.5 &&
      abs(float(regionId) - uHighlight) < 0.5;
    bool colourRegionsActive = uColorMode > 0.5 && !selectionActive && validRegion;

    vec3 shadedPaper = uPaperColor * (1.0 - tonalDarkness * 0.10);
    // Ink is the top layer. Max-composition preserves line contrast and avoids
    // several translucent masks summing into a broad gray cast.
    float totalInk = max(structuralInk, engravedInk);
    vec3 finalColor = mix(shadedPaper, uInkColor, totalInk);

    // Colour Regions: the authored palette under the engraving. The linework
    // is composited last and is never changed by colour.
    if (colourRegionsActive) {
      finalColor = mix(tintedRegionColor, uInkColor, totalInk);
    }

    // Selection tints the chosen region only. Every other region keeps the
    // engraving it already had, so the specimen never flattens into tone.
    if (selectedRegion) {
      finalColor = mix(tintedRegionColor, uInkColor, totalInk);
    } else if (!selectionActive && feedbackActive && validRegion) {
      finalColor = tintedRegionColor;
    }

    gl_FragColor = vec4(finalColor, 1.0);
  }
`;

export default fragmentShader;
