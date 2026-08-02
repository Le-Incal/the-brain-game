const fragmentShader = /* glsl */ `
  uniform sampler2D uAoMap;
  uniform sampler2D uCavityMap;
  uniform sampler2D uCurvatureMap;
  uniform sampler2D uEtchingMap;

  uniform vec3 uLightDir1;
  uniform vec3 uLightDir2;

  uniform float uColorMode;
  uniform vec3 uRegionColors[14];
  uniform float uHighlight;
  uniform float uSelectedRegion;

  uniform vec3 uInkColor;
  uniform vec3 uPaperColor;

  varying vec2 vUv0;
  varying vec3 vObjectPosition;
  varying vec3 vWorldPosition;
  varying vec3 vWorldNormal;

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

  vec3 getRegionColor(int regionId) {
    vec3 color = uRegionColors[0];
    for (int i = 1; i < 14; i++) {
      if (i == regionId) {
        color = uRegionColors[i];
      }
    }
    return color;
  }

  int classifyRegion(vec3 position) {
    float x = position.x;
    float y = position.y;
    float z = position.z;
    float absX = abs(x);

    // Keep this ordering aligned with classifyVertex() in brainLoader.js.
    if (y < -0.28 && z < -0.15) return 13;
    if (y < -0.45) return 13;

    if (absX > 0.22 && y < 0.12 && z > -0.35 && z < 0.45) {
      if (z > 0.18 && y < 0.05) return 10;
      if (x < -0.22 && z <= 0.12) return 9;
      if (z > 0.05 && y > -0.12) return 8;
      return 11;
    }

    if (z < -0.38) return 12;

    if (z < 0.12 && y > -0.05) {
      if (z > -0.12 && y > 0.05) return 5;
      if (y > 0.22) return 6;
      return 7;
    }

    if (z > 0.22 && y > 0.15) return 0;
    if (z > -0.05 && z < 0.18 && y > 0.15) return 1;
    if (x < -0.18 && z > 0.08 && y < 0.18) return 2;
    if (z > 0.12 && y > 0.25) return 3;
    if (y < 0.05 && z > 0.15) return 4;

    return 0;
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
    // Restore roughly 20 percentage points of etched coverage while derivative
    // filtering keeps close strokes crisp and suppresses subpixel shimmer.
    float etchedLine = antialiasedThreshold(etching, 0.80);
    float bakedEtching = etchedLine * 0.60;
    float engravedInk = max(hatchInk, bakedEtching);

    // Classifying the interpolated object-space position evaluates boundaries
    // per pixel, so they no longer inherit the mesh triangle silhouette.
    int regionId = classifyRegion(vObjectPosition);
    vec3 regionColor = getRegionColor(regionId);
    float regionLuma = dot(regionColor, vec3(0.299, 0.587, 0.114));
    vec3 vibrantRegionColor = mix(vec3(regionLuma), regionColor, 1.35);
    vibrantRegionColor = clamp(vibrantRegionColor, 0.0, 1.0);

    bool selectionActive = uSelectedRegion > -0.5;
    bool selectedRegion =
      selectionActive &&
      abs(float(regionId) - uSelectedRegion) < 0.5;
    bool regionColourActive = uColorMode > 0.5 || selectedRegion;
    bool feedbackActive =
      uHighlight > -0.5 &&
      abs(float(regionId) - uHighlight) < 0.5;

    vec3 shadedPaper = uPaperColor * (1.0 - tonalDarkness * 0.10);
    // Ink is the top layer. Max-composition preserves line contrast and avoids
    // several translucent masks summing into a broad gray cast.
    float totalInk = max(structuralInk, engravedInk);
    vec3 finalColor = mix(shadedPaper, uInkColor, totalInk);

    // Preserve only a ghost of the surrounding anatomy while a functional
    // region is selected, keeping context without competing with the subject.
    if (selectionActive && !selectedRegion) {
      finalColor = mix(uPaperColor, finalColor, 0.08);
    }

    // Hand-tinted functional regions sit above the completed engraving as a
    // translucent wash, so dense linework cannot hide the colour layer.
    bool regionOverlayActive =
      feedbackActive ||
      selectedRegion ||
      (regionColourActive && !selectionActive);
    if (regionOverlayActive) {
      float regionOverlayAlpha = feedbackActive ? 0.96 :
        (selectedRegion ? 0.72 : 0.94);
      regionOverlayAlpha *= 1.0 - totalInk;
      finalColor = mix(finalColor, vibrantRegionColor, regionOverlayAlpha);
    }

    if (feedbackActive) {
      vec3 amber = vec3(0.90, 0.67, 0.30);
      finalColor = mix(finalColor, amber, 0.08);
    }

    gl_FragColor = vec4(finalColor, 1.0);
  }
`;

export default fragmentShader;
