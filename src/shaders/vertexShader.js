const vertexShader = /* glsl */ `
  attribute float atlasRegionId;
  attribute vec4 atlasRegionCandidates;

  // The region id texture is baked against TEXCOORD_3, a different unwrap from
  // the engraving maps. Three only declares uv3 when it drives a built-in map.
  #ifndef USE_UV3
    attribute vec2 uv3;
  #endif

  varying vec2 vUv0;
  varying vec2 vUvRegionId;
  varying vec3 vObjectPosition;
  varying vec3 vWorldPosition;
  varying vec3 vWorldNormal;
  varying float vAtlasRegionId;
  varying vec4 vAtlasRegionCandidates;

  void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);

    vUv0 = uv;
    vUvRegionId = uv3;
    vAtlasRegionId = atlasRegionId;
    vAtlasRegionCandidates = atlasRegionCandidates;
    vObjectPosition = position;
    vWorldPosition = worldPosition.xyz;

    // The brain uses uniform scaling, so this is safe.
    vWorldNormal = normalize(mat3(modelMatrix) * normal);

    gl_Position =
      projectionMatrix *
      viewMatrix *
      worldPosition;
  }
`;

export default vertexShader;
