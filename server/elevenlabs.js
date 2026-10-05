/** The two ElevenLabs calls the server makes, paths checked against the official SDK. */

const API = 'https://api.elevenlabs.io';
const MAX_HISTORY_PAGES = 200;

export async function fetchConversationToken({ fetchImpl, apiKey, agentId }) {
  const url = `${API}/v1/convai/conversation/token?agent_id=${encodeURIComponent(agentId)}`;
  const response = await fetchImpl(url, { method: 'GET', headers: { 'xi-api-key': apiKey } });
  if (!response.ok) throw new Error(`ElevenLabs token request failed (${response.status})`);
  const body = await response.json();
  if (typeof body?.token !== 'string' || !body.token) throw new Error('ElevenLabs token response had no token');
  // TokenResponseModel carries the conversation id the token will open.
  return { token: body.token, conversationId: typeof body.conversation_id === 'string' ? body.conversation_id : null };
}

/** One conversation's status and length, or null if ElevenLabs has no such conversation. */
export async function fetchConversation({ fetchImpl, apiKey, conversationId }) {
  const response = await fetchImpl(`${API}/v1/convai/conversations/${encodeURIComponent(conversationId)}`, {
    method: 'GET',
    headers: { 'xi-api-key': apiKey },
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`ElevenLabs conversation request failed (${response.status})`);
  const body = await response.json();
  return { status: body?.status, durationSecs: body?.metadata?.call_duration_secs ?? 0 };
}

/** Every conversation for the agent that started at or after `sinceSecs`. */
export async function fetchConversationsSince({ fetchImpl, apiKey, agentId, sinceSecs }) {
  const conversations = [];
  let cursor = null;
  for (let page = 0; page < MAX_HISTORY_PAGES; page += 1) {
    const params = new URLSearchParams({
      agent_id: agentId,
      call_start_after_unix: String(sinceSecs),
      page_size: '100',
      summary_mode: 'exclude',
    });
    if (cursor) params.set('cursor', cursor);
    const response = await fetchImpl(`${API}/v1/convai/conversations?${params}`, {
      method: 'GET',
      headers: { 'xi-api-key': apiKey },
    });
    if (!response.ok) throw new Error(`ElevenLabs history request failed (${response.status})`);
    const body = await response.json();
    if (!Array.isArray(body?.conversations)) throw new Error('ElevenLabs history response was malformed');
    for (const item of body.conversations) {
      if (item.agent_id !== agentId || item.start_time_unix_secs < sinceSecs) continue;
      conversations.push({
        conversationId: item.conversation_id,
        durationSecs: item.call_duration_secs,
        status: item.status,
      });
    }
    if (!body.has_more || !body.next_cursor) return conversations;
    cursor = body.next_cursor;
  }
  throw new Error('ElevenLabs history had too many pages');
}
