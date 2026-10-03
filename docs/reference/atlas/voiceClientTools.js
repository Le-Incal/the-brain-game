/**
 * ElevenLabs sends client_tool_call.tool_name as an exact string; the SDK
 * matches keys on clientTools with hasOwnProperty (case- and char-sensitive).
 * Dashboards often produce camelCase or kebab-case variants — register aliases.
 */

/** @param {Record<string, unknown>} [params] */
export function pickNodeId(params) {
  if (!params || typeof params !== 'object') return ''
  const p = /** @type {Record<string, unknown>} */ (params)
  const v =
    p.nodeId ??
    p.node_id ??
    p.targetNodeId ??
    p.target_node_id ??
    p.node ??
    p.target ??
    p.id ??
    p.name
  if (v == null || v === '') return ''
  return String(v).trim()
}

/** @param {Record<string, unknown>} [params] */
export function pickHighlightParams(params) {
  if (!params || typeof params !== 'object') return { edgeType: undefined, layerNumber: undefined }
  const p = /** @type {Record<string, unknown>} */ (params)
  const edgeRaw = p.edgeType ?? p.edge_type ?? p.type
  const layerRaw = p.layerNumber ?? p.layer_number ?? p.layer

  let edgeType
  if (edgeRaw != null && edgeRaw !== '') edgeType = String(edgeRaw)

  let layerNumber
  if (layerRaw != null && layerRaw !== '') {
    const n = Number(layerRaw)
    if (Number.isFinite(n)) layerNumber = n
  }

  return { edgeType, layerNumber }
}

/**
 * Coerce a single scalar (from e.g. `parameters.enabled`) to boolean.
 * Returns undefined if the value cannot be interpreted (omit / try toggle).
 * @param {unknown} value
 */
export function coerceBooleanLike(value) {
  if (value === null || value === undefined) return undefined
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (['true', '1', 'yes', 'on', 'enable', 'enabled'].includes(normalized)) return true
    if (['false', '0', 'no', 'off', 'disable', 'disabled'].includes(normalized)) return false
    return undefined
  }
  return undefined
}

/** @param {Record<string, unknown>} [params] */
export function pickBooleanFlag(params) {
  if (!params || typeof params !== 'object') return undefined
  const p = /** @type {Record<string, unknown>} */ (params)
  const raw =
    p.enabled ??
    p.enable ??
    p.isEnabled ??
    p.is_enabled ??
    p.autoRotate ??
    p.auto_rotate ??
    p.autoRotateEnabled ??
    p.auto_rotate_enabled ??
    p.rotating ??
    p.value ??
    p.state ??
    p.on

  return coerceBooleanLike(raw)
}

/**
 * LLM / transport quirks: parameters may be a JSON string, or nested under `arguments`.
 * @param {unknown} parameters
 * @returns {Record<string, unknown>}
 */
export function normalizeVoiceToolParams(parameters) {
  if (parameters == null) return {}
  if (typeof parameters === 'string') {
    const s = parameters.trim()
    if (!s) return {}
    try {
      return normalizeVoiceToolParams(JSON.parse(s))
    } catch {
      const b = coerceBooleanLike(s)
      if (b !== undefined) return { enabled: b }
      return {}
    }
  }
  if (typeof parameters !== 'object' || Array.isArray(parameters)) return {}
  const o = /** @type {Record<string, unknown>} */ (parameters)
  const args = o.arguments
  if (args && typeof args === 'object' && !Array.isArray(args)) {
    return { ...o, .../** @type {Record<string, unknown>} */ (args) }
  }
  return { ...o }
}

/**
 * When the agent sends verbs instead of booleans (e.g. action: "stop").
 * @param {Record<string, unknown>} [params]
 */
export function pickAutoRotateIntent(params) {
  if (!params || typeof params !== 'object') return undefined
  const p = /** @type {Record<string, unknown>} */ (params)
  const tokens = [p.action, p.mode, p.intent, p.command].filter((x) => typeof x === 'string')
  for (const t of tokens) {
    const n = String(t).trim().toLowerCase()
    if (['off', 'disable', 'disabled', 'stop', 'no', 'false', 'pause', 'paused', 'inactive'].includes(n)) return false
    if (['on', 'enable', 'enabled', 'start', 'yes', 'true', 'resume', 'active'].includes(n)) return true
  }
  return undefined
}

/**
 * Build camelCase / kebab / case variants for one canonical snake_case tool id.
 * @param {string} snakeId e.g. navigate_to_node
 */
export function toolNameAliases(snakeId) {
  const s = String(snakeId || '').trim()
  if (!s) return []

  const lower = s.toLowerCase()
  const upper = s.toUpperCase()
  const kebab = lower.replace(/_/g, '-')
  const parts = lower.split('_').filter(Boolean)
  const camel = parts.map((w, i) => (i === 0 ? w : w.charAt(0).toUpperCase() + w.slice(1))).join('')
  const pascal = parts.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join('')

  return [...new Set([s, lower, upper, kebab, kebab.replace(/-/g, '_'), camel, pascal])]
}

/**
 * @param {Record<string, (params?: Record<string, unknown>) => Promise<string>>} canonical
 * @returns {Record<string, (params?: Record<string, unknown>) => Promise<string>>}
 */
export function expandClientToolAliases(canonical) {
  /** @type {Record<string, (params?: Record<string, unknown>) => Promise<string>>} */
  const out = {}
  for (const [primary, fn] of Object.entries(canonical)) {
    for (const alias of toolNameAliases(primary)) {
      if (!out[alias]) out[alias] = fn
    }
  }
  return out
}
