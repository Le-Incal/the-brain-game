const vertexShader = /* glsl */ `
  varying vec2 vUv0;
  varying vec3 vObjectPosition;
  varying vec3 vWorldPosition;
  varying vec3 vWorldNormal;

  void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);

    vUv0 = uv;
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
