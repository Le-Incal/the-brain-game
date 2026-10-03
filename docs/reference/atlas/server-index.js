/**
 * Production server (Railway / Docker / `npm start`)
 *
 * - POST /api/voice/* — Router mounted first, before any auth / host gating (ElevenLabs webhooks)
 * - Optional ATLAS_PUBLIC_VOICE_AGENT_ID — enables voice UI + client tools on the public host (3D control)
 * - Other API routes — runtime-config, layout, voice-login, etc.
 * - Static assets — Vite build output from dist/
 * - SPA — unmatched non-file routes → dist/index.html
 *
 * Listen: process.env.PORT || 3000
 */
import express from 'express'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs/promises'
import crypto from 'crypto'
import { createVoiceRouter, createAdminRouter } from '../src/api/server.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')

const PORT = Number(process.env.PORT || 3000)

// For true persistence on Railway, mount a volume and set ATLAS_DATA_DIR=/data.
// We default to /data in production if ATLAS_DATA_DIR isn't provided.
const dataDir = process.env.ATLAS_DATA_DIR
  ? path.resolve(process.env.ATLAS_DATA_DIR)
  : (process.env.NODE_ENV === 'production' ? '/data' : path.join(projectRoot, 'data'))
const layoutFile = process.env.ATLAS_LAYOUT_FILE
  ? path.resolve(process.env.ATLAS_LAYOUT_FILE)
  : path.join(dataDir, 'layout.json')
const gapsFile = process.env.ATLAS_GAPS_FILE
  ? path.resolve(process.env.ATLAS_GAPS_FILE)
  : path.join(dataDir, 'gaps.json')

const ADMIN_PASSWORD = process.env.ATLAS_ADMIN_PASSWORD || ''
const VOICE_PASSWORD = process.env.ATLAS_VOICE_PASSWORD || ''
const VOICE_AGENT_ID = process.env.ATLAS_VOICE_AGENT_ID || process.env.VITE_ELEVENLABS_AGENT_ID || ''
/** When set, public host (non–voice-host) still gets an ElevenLabs agent id so the SPA can run client tools and move the 3D model. */
const PUBLIC_VOICE_AGENT_ID = String(process.env.ATLAS_PUBLIC_VOICE_AGENT_ID || '').trim()
const VOICE_COOKIE_NAME = 'atlas_voice_session'
const VOICE_SESSION_TTL_MS = Math.max(
  60 * 60 * 1000,
  Number(process.env.ATLAS_VOICE_SESSION_TTL_MS || 7 * 24 * 60 * 60 * 1000)
)
const VOICE_SESSION_SECRET = process.env.ATLAS_VOICE_SESSION_SECRET || VOICE_PASSWORD || ADMIN_PASSWORD || 'atlas-voice-dev-secret'
const VOICE_HOSTS = new Set(
  String(process.env.ATLAS_VOICE_HOSTS || 'zippy-ambition-production-8ec7.up.railway.app')
    .split(',')
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean)
)
const DEFAULT_PUBLIC_HOST = (process.env.ATLAS_PUBLIC_HOST || 'www.urbanintelligence.app').trim().toLowerCase()

function timingSafeEqualStr(a, b) {
  const aBuf = Buffer.from(String(a))
  const bBuf = Buffer.from(String(b))
  if (aBuf.length !== bBuf.length) return false
  return crypto.timingSafeEqual(aBuf, bBuf)
}

function getRequestHost(req) {
  const forwardedHost = String(req.headers['x-forwarded-host'] || '').split(',')[0].trim()
  const host = forwardedHost || req.headers.host || ''
  return String(host).split(':')[0].trim().toLowerCase()
}

function getRequestProtocol(req) {
  const forwardedProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim()
  if (forwardedProto) return forwardedProto
  return process.env.NODE_ENV === 'production' ? 'https' : 'http'
}

function isLocalHost(host) {
  return host === 'localhost' || host === '127.0.0.1'
}

function isVoiceHost(req) {
  const host = getRequestHost(req)

  if (VOICE_HOSTS.has(host)) {
    return true
  }

  if (process.env.NODE_ENV !== 'production' && isLocalHost(host)) {
    return true
  }

  return false
}

function parseCookies(req) {
  const raw = String(req.headers.cookie || '')
  if (!raw) return {}

  return raw.split(';').reduce((acc, chunk) => {
    const [name, ...valueParts] = chunk.trim().split('=')
    if (!name) return acc
    acc[name] = decodeURIComponent(valueParts.join('=') || '')
    return acc
  }, {})
}

function signValue(value) {
  return crypto
    .createHmac('sha256', VOICE_SESSION_SECRET)
    .update(value)
    .digest('base64url')
}

function createVoiceSession(host) {
  const payload = Buffer.from(JSON.stringify({
    host,
    exp: Date.now() + VOICE_SESSION_TTL_MS,
  })).toString('base64url')

  return `${payload}.${signValue(payload)}`
}

function hasVoiceSession(req) {
  const token = parseCookies(req)[VOICE_COOKIE_NAME]
  if (!token) return false

  const [payload, signature] = token.split('.')
  if (!payload || !signature || !timingSafeEqualStr(signature, signValue(payload))) {
    return false
  }

  try {
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    return decoded.exp > Date.now() && decoded.host === getRequestHost(req)
  } catch {
    return false
  }
}

function serializeCookie(name, value, options = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`]

  if (options.maxAge != null) parts.push(`Max-Age=${Math.floor(options.maxAge / 1000)}`)
  parts.push(`Path=${options.path || '/'}`)
  if (options.httpOnly !== false) parts.push('HttpOnly')
  if (options.sameSite) parts.push(`SameSite=${options.sameSite}`)
  if (options.secure) parts.push('Secure')

  return parts.join('; ')
}

function runtimeConfigForRequest(req) {
  const voiceHost = isVoiceHost(req)
  const voiceAuthenticated = voiceHost ? hasVoiceSession(req) : false
  const protocol = getRequestProtocol(req)
  const currentHost = getRequestHost(req)
  const voiceHostName = [...VOICE_HOSTS][0] || currentHost
  const publicHostName = voiceHost ? DEFAULT_PUBLIC_HOST : currentHost
  const voiceBaseUrl = `${protocol}://${voiceHostName}`
  const publicBaseUrl = `${protocol}://${publicHostName}`

  const privateVoiceReady = voiceHost && voiceAuthenticated && !!VOICE_AGENT_ID
  const publicVoiceReady = !voiceHost && !!PUBLIC_VOICE_AGENT_ID

  return {
    appMode: voiceHost ? 'voice' : 'public',
    voiceHost,
    /** True when the UI should start a conversation (private voice login, or public agent id for client tools). */
    voiceAvailable: privateVoiceReady || publicVoiceReady,
    voiceAuthenticated,
    requireVoiceLogin: voiceHost,
    voiceLoginPath: '/voice-login',
    voiceBaseUrl,
    voiceLoginUrl: `${voiceBaseUrl}/voice-login`,
    publicBaseUrl,
    elevenLabsAgentId: privateVoiceReady
      ? VOICE_AGENT_ID
      : (publicVoiceReady ? PUBLIC_VOICE_AGENT_ID : ''),
  }
}

function renderVoiceLoginPage({ error = '', missingPassword = false } = {}) {
  const message = missingPassword
    ? 'Voice access is not configured yet. Set ATLAS_VOICE_PASSWORD on the server to enable the private voice host.'
    : error || 'Enter the private Atlas password to continue.'

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Private Atlas Voice</title>
    <style>
      :root { color-scheme: light; }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        padding: 24px;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background:
          radial-gradient(circle at top, rgba(255,255,255,0.96), rgba(241,245,249,0.92) 38%, rgba(226,232,240,0.95) 100%);
        color: #0f172a;
      }
      .card {
        width: min(100%, 420px);
        padding: 28px;
        border-radius: 24px;
        border: 1px solid rgba(148, 163, 184, 0.24);
        background: rgba(255, 255, 255, 0.78);
        backdrop-filter: blur(18px);
        box-shadow: 0 24px 80px rgba(15, 23, 42, 0.12);
      }
      h1 { margin: 0 0 10px; font-size: 26px; }
      p { margin: 0 0 18px; color: #475569; line-height: 1.5; }
      label { display: block; font-size: 13px; font-weight: 600; margin-bottom: 8px; color: #334155; }
      input {
        width: 100%;
        border: 1px solid rgba(148, 163, 184, 0.34);
        border-radius: 14px;
        padding: 12px 14px;
        font-size: 15px;
        background: rgba(255, 255, 255, 0.82);
      }
      input:focus {
        outline: none;
        border-color: rgba(100, 116, 139, 0.7);
        box-shadow: 0 0 0 4px rgba(226, 232, 240, 0.85);
      }
      button {
        width: 100%;
        margin-top: 16px;
        padding: 12px 14px;
        border: 0;
        border-radius: 14px;
        background: #0f172a;
        color: white;
        font-size: 15px;
        font-weight: 600;
        cursor: pointer;
      }
      .note {
        margin-top: 14px;
        font-size: 13px;
        color: ${missingPassword ? '#b91c1c' : '#475569'};
      }
    </style>
  </head>
  <body>
    <main class="card">
      <h1>Private Atlas Voice</h1>
      <p>${message}</p>
      ${missingPassword ? '' : `
      <form method="post" action="/voice-login">
        <label for="password">Password</label>
        <input id="password" name="password" type="password" autocomplete="current-password" required />
        <button type="submit">Enter voice atlas</button>
      </form>
      <div class="note">This host unlocks the private voice experience with a server-managed shared password. The public Atlas remains available without login.</div>
      `}
    </main>
  </body>
</html>`
}

function getUnauthorizedResponse(req, res) {
  if (req.path.startsWith('/assets/') || (req.path.includes('.') && !req.path.endsWith('.html'))) {
    return res.status(401).send('Unauthorized')
  }

  return res.status(401).type('html').send(renderVoiceLoginPage())
}

async function readLayout() {
  try {
    const raw = await fs.readFile(layoutFile, 'utf8')
    return JSON.parse(raw)
  } catch (e) {
    if (e?.code === 'ENOENT') return null
    throw e
  }
}

async function writeLayout(data) {
  await fs.mkdir(path.dirname(layoutFile), { recursive: true })
  const tmp = `${layoutFile}.tmp`
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), 'utf8')
  await fs.rename(tmp, layoutFile)
}

function validatePositions(positions) {
  if (!positions || typeof positions !== 'object' || Array.isArray(positions)) return false
  const entries = Object.entries(positions)
  if (entries.length > 2000) return false
  for (const [, p] of entries) {
    if (!p || typeof p !== 'object') return false
    const { x, y, z } = p
    if (![x, y, z].every((n) => typeof n === 'number' && Number.isFinite(n))) return false
  }
  return true
}

export function createApp(distDir) {
  const app = express()
  app.use(express.json({ limit: '3mb' }))
  app.use(express.urlencoded({ extended: false }))

  // --- POST /api/voice/* — exact middleware chain (nothing before this may short-circuit the body) ---
  // 1. express.json({ limit: '3mb' })     — parses JSON body into req.body
  // 2. express.urlencoded({ extended: false })
  // 3. createVoiceRouter() at /api/voice — POST /navigate | /highlight | /neighborhood | /log-gap
  // After that: req.atlasRuntime, /api/runtime-config, voice-login, voice auth gate, static, SPA GET fallback.
  // ElevenLabs webhooks must succeed on any Host (public or voice); router is mounted before host-based auth.
  const voiceRouter = createVoiceRouter({
    nodesPath: path.join(projectRoot, 'src/data/nodes.json'),
    edgesPath: path.join(projectRoot, 'src/data/edges.json'),
    gapsPath: gapsFile,
  })
  app.use('/api/voice', voiceRouter)

  app.use((req, res, next) => {
    req.atlasRuntime = runtimeConfigForRequest(req)
    next()
  })

  app.get('/api/runtime-config', (req, res) => {
    const runtime = req.atlasRuntime
    return res.json({
      appMode: runtime.appMode,
      voiceAvailable: runtime.voiceAvailable,
      voiceAuthenticated: runtime.voiceAuthenticated,
      requireVoiceLogin: runtime.requireVoiceLogin,
      voiceLoginPath: runtime.voiceLoginPath,
      voiceBaseUrl: runtime.voiceBaseUrl,
      voiceLoginUrl: runtime.voiceLoginUrl,
      publicBaseUrl: runtime.publicBaseUrl,
      elevenLabsAgentId: runtime.elevenLabsAgentId,
    })
  })

  app.get('/voice-login', (req, res) => {
    if (!req.atlasRuntime.voiceHost) {
      return res.redirect('/')
    }

    if (!VOICE_PASSWORD) {
      return res.status(503).type('html').send(renderVoiceLoginPage({ missingPassword: true }))
    }

    if (req.atlasRuntime.voiceAuthenticated) {
      return res.redirect('/')
    }

    return res.type('html').send(renderVoiceLoginPage())
  })

  app.post('/voice-login', (req, res) => {
    if (!req.atlasRuntime.voiceHost) {
      return res.redirect('/')
    }

    if (!VOICE_PASSWORD) {
      return res.status(503).type('html').send(renderVoiceLoginPage({ missingPassword: true }))
    }

    const providedPassword = String(req.body?.password || '')
    if (!timingSafeEqualStr(providedPassword, VOICE_PASSWORD)) {
      return res.status(401).type('html').send(renderVoiceLoginPage({ error: 'Incorrect password. Try again.' }))
    }

    res.setHeader('Set-Cookie', serializeCookie(
      VOICE_COOKIE_NAME,
      createVoiceSession(getRequestHost(req)),
      {
        maxAge: VOICE_SESSION_TTL_MS,
        httpOnly: true,
        sameSite: 'Lax',
        secure: process.env.NODE_ENV === 'production',
      }
    ))

    return res.redirect('/')
  })

  app.post('/api/voice-auth/logout', (req, res) => {
    res.setHeader('Set-Cookie', serializeCookie(
      VOICE_COOKIE_NAME,
      '',
      {
        maxAge: 0,
        httpOnly: true,
        sameSite: 'Lax',
        secure: process.env.NODE_ENV === 'production',
      }
    ))

    return res.status(204).end()
  })

  app.get('/api/layout', async (req, res) => {
    try {
      const existing = await readLayout()
      if (!existing?.positions) return res.status(404).json({ ok: false })
      return res.json(existing)
    } catch (e) {
      return res.status(500).json({ ok: false, error: 'failed_to_read_layout' })
    }
  })

  app.use((req, res, next) => {
    if (!req.atlasRuntime.voiceHost) {
      return next()
    }

    if (!VOICE_PASSWORD) {
      if (req.path.startsWith('/api/')) {
        return res.status(503).json({ ok: false, error: 'voice_password_not_configured' })
      }
      return res.status(503).type('html').send(renderVoiceLoginPage({ missingPassword: true }))
    }

    if (req.atlasRuntime.voiceAuthenticated) {
      return next()
    }

    if (req.path === '/api/runtime-config' || req.path === '/voice-login' || req.path === '/api/voice-auth/logout') {
      return next()
    }

    if (req.path.startsWith('/api/')) {
      return res.status(401).json({ ok: false, error: 'voice_auth_required' })
    }

    return getUnauthorizedResponse(req, res)
  })

  // /api/admin/* — voice-host only. The auth gate above already requires a voice
  // session on voice hosts; here we additionally 404 the public host so the
  // admin surface isn't even discoverable from there.
  app.use('/api/admin', (req, res, next) => {
    if (!req.atlasRuntime?.voiceHost) {
      return res.status(404).end()
    }
    next()
  }, createAdminRouter({ gapsPath: gapsFile }))

  app.post('/api/layout', async (req, res) => {
    const provided = req.header('x-atlas-admin-password') || ''
    if (!ADMIN_PASSWORD || !timingSafeEqualStr(provided, ADMIN_PASSWORD)) {
      return res.status(401).send('Unauthorized')
    }

    const positions = req.body?.positions
    if (!validatePositions(positions)) {
      return res.status(400).send('Invalid positions')
    }

    try {
      await writeLayout({ positions, updatedAt: new Date().toISOString() })
      return res.json({ ok: true })
    } catch (e) {
      return res.status(500).send('Failed to save')
    }
  })

  // Vite production build (CSS, JS, assets under /assets/*)
  app.use(express.static(distDir))

  // Client-side routing: serve index.html for app paths, not for missing static files
  app.get('*', (req, res, next) => {
    const p = req.path
    if (p.startsWith('/assets/') || (p.includes('.') && !p.endsWith('.html'))) {
      return res.status(404).send('Not found')
    }
    res.sendFile(path.join(distDir, 'index.html'), (err) => {
      if (err) next(err)
    })
  })

  return app
}

async function start() {
  const candidates = [
    path.join(projectRoot, 'dist'),
    path.join(process.cwd(), 'dist')
  ]
  let distDir = null
  for (const dir of candidates) {
    try {
      await fs.access(path.join(dir, 'index.html'))
      distDir = dir
      break
    } catch {
      continue
    }
  }
  if (!distDir) {
    // eslint-disable-next-line no-console
    console.error('Build output missing: no dist/index.html at', candidates.join(' or '))
    process.exit(1)
  }
  // eslint-disable-next-line no-console
  console.log(`Serving static from ${distDir}`)

  const app = createApp(distDir)
  app.listen(PORT, '0.0.0.0', () => {
    // eslint-disable-next-line no-console
    console.log(`Atlas server listening on :${PORT}`)
  })
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  start()
}

