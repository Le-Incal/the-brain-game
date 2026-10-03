/**
 * VoiceBridge.jsx
 *
 * Connects the ElevenLabs Conversational AI React SDK to
 * our Zustand graphStore. This component:
 *
 * 1. Initializes the ElevenLabs conversation session
 * 2. Listens for tool call events from the agent
 * 3. Dispatches state changes to Zustand (camera, edges, layers)
 * 4. Tracks voice lifecycle state (idle/listening/thinking/speaking)
 * 5. Maintains conversation transcript
 *
 * Install: npm install @11labs/react
 *
 * Props:
 *   agentId - ElevenLabs agent ID from the dashboard
 *   graphStore - reference to Zustand graphStore (or voiceStore)
 *   onStatusChange - optional callback for UI updates
 *
 * ElevenLabs agent checklist (if a client tool “does nothing”):
 * - Tool must be a Client tool (executes in this app), not only a server/webhook tool.
 * - Tool name must match a registered key (e.g. toggle_auto_rotate or alias ToggleAutoRotate).
 * - toggle_auto_rotate: use { "enabled": true } / { "enabled": false } or string "true"/"false"; else toggles.
 * - Open devtools: [VoiceBridge] client tool invoked should appear when the agent calls the tool.
 */

import { useCallback, useEffect, useMemo, useRef, forwardRef, useImperativeHandle } from 'react';
import { useConversation } from '@11labs/react';
import {
  expandClientToolAliases,
  normalizeVoiceToolParams,
  pickHighlightParams,
  pickNodeId,
} from '../lib/voiceClientTools.js';
import ChatPanel from './ChatPanel';

function logVoiceDebug(event, payload) {
  console.info(`[VoiceBridge] ${event}`, payload ?? '');
}

const VoiceBridge = forwardRef(function VoiceBridge({ agentId, graphStore, onStatusChange, showChatUI = false }, ref) {
  const storeRef = useRef(graphStore);
  storeRef.current = graphStore;

  // Handle tool calls from the agent
  // ElevenLabs fires client_tool_call events when the LLM
  // invokes a tool that should execute client-side
  const handleToolCall = useCallback((toolName, parameters) => {
    const store = storeRef.current.getState();
    const params = normalizeVoiceToolParams(parameters);
    logVoiceDebug('client tool invoked', { toolName, parameters: params });

    switch (toolName) {
      case 'navigate_to_node': {
        const nodeId = pickNodeId(params);
        if (nodeId) {
          store.handleToolCall('navigate_to_node', { nodeId });
        } else {
          logVoiceDebug('navigate_to_node missing node id', { keys: Object.keys(params) });
        }
        break;
      }

      case 'highlight_edge_type': {
        const { edgeType, layerNumber } = pickHighlightParams(params);
        if (edgeType) {
          store.handleToolCall('highlight_edge_type', { edgeType });
        }
        if (layerNumber !== undefined) {
          store.handleToolCall('toggle_layer', {
            layerNumber,
            visible: true,
          });
        }
        break;
      }

      case 'show_neighborhood': {
        const nodeId = pickNodeId(params);
        if (nodeId) {
          store.handleToolCall('navigate_to_node', { nodeId });
        }
        break;
      }

      default:
        console.warn(`[VoiceBridge] Unknown tool: ${toolName}`);
    }
  }, []);

  // Canonical names + aliases: ElevenLabs SDK matches tool_name to keys exactly.
  // All canonical tools must appear here so startSession registers them with the agent.
  const clientTools = useMemo(
    () =>
      expandClientToolAliases({
        navigate_to_node: async (parameters = {}) => {
          handleToolCall('navigate_to_node', parameters);
          return 'Navigation updated in Atlas.';
        },
        highlight_edge_type: async (parameters = {}) => {
          handleToolCall('highlight_edge_type', parameters);
          return 'Highlight updated in Atlas.';
        },
        show_neighborhood: async (parameters = {}) => {
          handleToolCall('show_neighborhood', parameters);
          return 'Neighborhood focus updated in Atlas.';
        },
        signal_connection: async (parameters = {}) => {
          const p = normalizeVoiceToolParams(parameters);
          logVoiceDebug('client tool invoked', { toolName: 'signal_connection', parameters: p });
          storeRef.current.getState().signalConnection(p.sourceNodeId, p.targetNodeId);
          return 'Connection signal updated in Atlas.';
        },
        switch_view: async (parameters = {}) => {
          try {
            const p = normalizeVoiceToolParams(parameters);
            logVoiceDebug('switch_view called', { rawParams: parameters, normalized: p, keys: Object.keys(p) });

            const candidates = [
              p.viewName, p.view_name, p.view, p.name, p.page, p.screen, p.target,
              ...Object.values(p),
            ];
            const raw = String(candidates.find((v) => v != null && v !== '') ?? '').trim().toLowerCase();

            const VIEW_ALIASES = {
              atlas: 'atlas', '3d': 'atlas', graph: 'atlas', 'knowledge graph': 'atlas', network: 'atlas', 'atlas view': 'atlas',
              index: 'index', table: 'index', list: 'index', 'index view': 'index', 'index page': 'index',
              chord: 'chord', 'chord diagram': 'chord', 'chord view': 'chord', diagram: 'chord', matrix: 'chord',
            };
            let resolved = VIEW_ALIASES[raw];

            if (!resolved && raw.includes(',')) {
              for (const part of raw.split(',')) {
                const trimmed = part.trim();
                if (VIEW_ALIASES[trimmed]) { resolved = VIEW_ALIASES[trimmed]; break; }
              }
            }

            if (!resolved) {
              for (const key of Object.keys(VIEW_ALIASES)) {
                if (raw.includes(key)) { resolved = VIEW_ALIASES[key]; break; }
              }
            }

            if (resolved) {
              storeRef.current.getState().setCurrentView(resolved);
              logVoiceDebug('switch_view success', { raw, resolved });
              return `Switched to ${resolved} view.`;
            }
            logVoiceDebug('switch_view unresolved', { raw, keys: Object.keys(p), allValues: Object.values(p) });
            return `Could not resolve view "${raw || '(empty)'}". Send exactly one of: atlas, index, chord.`;
          } catch (err) {
            console.error('[VoiceBridge] switch_view error:', err);
            return `Error switching view: ${err.message}`;
          }
        },
        toggle_color_mode: async (parameters = {}) => {
          const p = normalizeVoiceToolParams(parameters);
          logVoiceDebug('client tool invoked', { toolName: 'toggle_color_mode', parameters: p });
          const s = storeRef.current.getState();
          if (p.mode != null && p.mode !== '') {
            s.setColorMode(p.mode);
          } else {
            logVoiceDebug('toggle_color_mode missing mode', { keys: Object.keys(p) });
          }
          return 'Color mode updated in Atlas.';
        },
        toggle_layer: async (parameters = {}) => {
          const p = normalizeVoiceToolParams(parameters);
          logVoiceDebug('client tool invoked', { toolName: 'toggle_layer', parameters: p });
          storeRef.current.getState().handleToolCall('toggle_layer', {
            layerNumber: p.layerNumber,
            visible: p.visible,
          });
          return 'Layer visibility updated in Atlas.';
        },
        reset_filters: async (parameters = {}) => {
          const p = normalizeVoiceToolParams(parameters);
          logVoiceDebug('client tool invoked', { toolName: 'reset_filters', parameters: p });
          storeRef.current.getState().resetFilters();
          return 'Filters reset in Atlas.';
        },
        toggle_auto_rotate: async (parameters = {}) => {
          const p = normalizeVoiceToolParams(parameters);
          logVoiceDebug('client tool invoked', { toolName: 'toggle_auto_rotate', parameters: p });
          const s = storeRef.current.getState();
          const en = p.enabled;
          // Strict match for ElevenLabs boolean / string "true"; also false / "false" to turn off.
          if (en === true || en === 'true') {
            s.setAutoRotateEnabled(true);
          } else if (en === false || en === 'false') {
            s.setAutoRotateEnabled(false);
          } else {
            s.toggleAutoRotate();
          }
          logVoiceDebug('toggle_auto_rotate applied', {
            autoRotateEnabled: storeRef.current.getState().autoRotateEnabled,
          });
          return 'Auto-rotate updated in Atlas.';
        },
      }),
    [handleToolCall],
  );

  const conversation = useConversation({
    onConnect: () => {
      logVoiceDebug('connected', { agentId });
      storeRef.current.getState().setVoiceState('idle');
      onStatusChange?.('connected');
    },
    onDisconnect: () => {
      logVoiceDebug('disconnected');
      storeRef.current.getState().setVoiceState('idle');
      onStatusChange?.('disconnected');
    },
    onMessage: (rawProps) => {
      // SDK shape: { message: string, source: 'user' | 'ai' }.
      // Map 'ai' -> 'assistant' so the rest of the app (transcript
      // export, chat panel role labels, data-role attributes) can
      // keep the standard user/assistant vocabulary.
      const props = rawProps;
      const message = props?.message;
      const source = props?.source;
      if (typeof message !== 'string' || !message.length) return;
      if (source !== 'user' && source !== 'ai') return;
      storeRef.current.getState().addMessage({
        role: source === 'user' ? 'user' : 'assistant',
        content: message,
      });
      logVoiceDebug('message', { source, length: message.length });
    },
    onError: (error) => {
      console.error('[VoiceBridge] Error:', error);
      storeRef.current.getState().setVoiceState('idle');
      onStatusChange?.('error');
    },
    // Do not set onUnhandledClientToolCall: the SDK would skip sending client_tool_result and the agent can hang.
    clientTools,
  });

  // Map ElevenLabs conversation state to our UI voice states.
  // In this SDK, `status` reflects connection state, while `isSpeaking`
  // is the reliable signal for agent audio playback.
  useEffect(() => {
    let nextState = 'idle';

    if (conversation.isSpeaking) {
      nextState = 'speaking';
    } else if (conversation.status === 'connected') {
      nextState = 'listening';
    }

    storeRef.current.getState().setVoiceState(nextState);
  }, [conversation.isSpeaking, conversation.status]);

  // Start a conversation session
  const startSession = useCallback(async () => {
    try {
      logVoiceDebug('starting session', { agentId, toolNames: Object.keys(clientTools) });
      await conversation.startSession({
        agentId,
        clientTools,
      });
    } catch (err) {
      console.error('[VoiceBridge] Failed to start session:', err);
      onStatusChange?.('error');
    }
  }, [agentId, clientTools, conversation, onStatusChange]);

  // End the session
  const endSession = useCallback(async () => {
    try {
      await conversation.endSession();
      storeRef.current.getState().setVoiceState('idle');
    } catch (err) {
      console.error('[VoiceBridge] Failed to end session:', err);
    }
  }, [conversation]);

  useImperativeHandle(ref, () => ({
    startSession,
    endSession,
    getOutputVolume: () => conversation.getOutputVolume?.() || 0,
    getOutputByteFrequencyData: () => conversation.getOutputByteFrequencyData?.(),
    isSpeaking: () => conversation.isSpeaking,
  }));

  // Privacy gate lives in the parent (GlobalVoiceController reads
  // runtimeConfig.appMode). When showChatUI is true, mount the chat
  // surface here so it has direct access to the SDK conversation.
  if (!showChatUI) {
    return null;
  }
  return (
    <ChatPanel
      onSendMessage={(text) => {
        // The SDK delivers the agent's reply through onMessage but does NOT
        // echo the user's typed input. We write it to the store ourselves so
        // the turn shows up in the transcript immediately. Spoken turns still
        // arrive via onMessage above; this path is only for typed input.
        conversation.sendUserMessage(text);
        storeRef.current.getState().addMessage({
          role: 'user',
          content: text,
        });
      }}
    />
  );
});

export default VoiceBridge;

// Export the hook for components that need voice controls
export function useVoiceControls(voiceBridgeRef) {
  return {
    start: () => voiceBridgeRef.current?.startSession(),
    stop: () => voiceBridgeRef.current?.endSession(),
    isSpeaking: voiceBridgeRef.current?.conversation?.status === 'speaking',
    isListening: voiceBridgeRef.current?.conversation?.status === 'listening',
  };
}
