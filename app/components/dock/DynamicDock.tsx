'use client';

import { useCallback, useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Sparkles, Send } from 'lucide-react';
import { isToolUIPart, getToolName } from 'ai';
import { useAppStore } from '@/lib/store';
import { useChatContext } from '@/app/contexts/ChatContext';
import { glass, iconSize } from '@/lib/design-tokens';
import GhostToast, { addToast, removeToast, ToastMessage } from './GhostToast';

// ============================================================================
// Types (kept for backwards compatibility with tests)
// ============================================================================

export type DockState = 'IDLE' | 'AI_MODE';
export type { ToastMessage } from './GhostToast';

export interface DockLocalState {
  mode: DockState;
  activeTool: string | null;
  toastQueue: ToastMessage[];
}

export type DockAction =
  | { type: 'ENTER_AI_MODE' }
  | { type: 'EXIT_AI_MODE' }
  | { type: 'ADD_TOAST'; toast: ToastMessage }
  | { type: 'REMOVE_TOAST'; id: string };

export const initialDockState: DockLocalState = {
  mode: 'IDLE',
  activeTool: null,
  toastQueue: [],
};

/** Maximum number of processed message IDs to keep in cache to prevent unbounded growth */
const MAX_PROCESSED_IDS = 500;

/**
 * FNV-1a hash function for generating unique identifiers from text
 * Uses FNV-1a algorithm which has better distribution than DJB2
 * Includes length prefix to reduce collision probability for similar strings
 */
function hashString(str: string): string {
  // FNV-1a parameters for 32-bit
  const FNV_PRIME = 0x01000193;
  const FNV_OFFSET = 0x811c9dc5;
  
  let hash = FNV_OFFSET;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, FNV_PRIME);
  }
  // Convert to unsigned 32-bit and include length for additional uniqueness
  return `${str.length.toString(36)}_${(hash >>> 0).toString(36)}`;
}

export function dockReducer(state: DockLocalState, action: DockAction): DockLocalState {
  switch (action.type) {
    case 'ENTER_AI_MODE':
      return { ...state, mode: 'AI_MODE' };
    case 'EXIT_AI_MODE':
      return { ...state, mode: 'IDLE' };
    case 'ADD_TOAST':
      return { ...state, toastQueue: [...state.toastQueue, action.toast].slice(-5) };
    case 'REMOVE_TOAST':
      return { ...state, toastQueue: state.toastQueue.filter((t) => t.id !== action.id) };
    default:
      return state;
  }
}

// ============================================================================
// Component
// ============================================================================

export interface DynamicDockProps {
  disabled?: boolean;
}

/**
 * DynamicDock - AI chat input dock at bottom of screen
 * 
 * Uses centralized ChatContext for single useChat instance across the app.
 * Handles toast notifications for AI responses and tool calls.
 */
export default function DynamicDock({ disabled = false }: DynamicDockProps) {
  const imageState = useAppStore((state) => state.imageState);
  
  const [aiInput, setAiInput] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const [toastQueue, setToastQueue] = useState<ToastMessage[]>([]);
  const processedMessageIds = useRef<Set<string>>(new Set());
  const processedIdsOrder = useRef<string[]>([]);
  
  // Use centralized chat context (single useChat instance for entire app)
  const { messages, sendMessage, isLoading } = useChatContext();
  
  // Helper to add to bounded Set, removing oldest entries when limit exceeded
  const addProcessedId = useCallback((id: string) => {
    if (processedMessageIds.current.has(id)) return;
    processedMessageIds.current.add(id);
    processedIdsOrder.current.push(id);
    // Evict oldest entries when exceeding limit
    while (processedIdsOrder.current.length > MAX_PROCESSED_IDS) {
      const oldest = processedIdsOrder.current.shift();
      if (oldest) processedMessageIds.current.delete(oldest);
    }
  }, []);
  
  // Clear processed IDs cache when messages are reset (empty array) or on unmount
  useEffect(() => {
    if (messages.length === 0) {
      processedMessageIds.current.clear();
      processedIdsOrder.current = [];
    }
  }, [messages.length]);
  
  useEffect(() => {
    return () => {
      processedMessageIds.current.clear();
      processedIdsOrder.current = [];
    };
  }, []);
  
  const handleAiSubmit = useCallback(async () => {
    if (!aiInput.trim() || isLoading || disabled) return;
    
    const messageText = aiInput.trim();
    setAiInput('');
    
    // sendMessage from ChatContext auto-injects imageContext
    sendMessage(messageText);
  }, [aiInput, isLoading, disabled, sendMessage]);
  
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleAiSubmit();
    }
  }, [handleAiSubmit]);
  
  const handleToastDismiss = useCallback((id: string) => {
    setToastQueue(prev => removeToast(prev, id));
  }, []);
  
  // Process AI messages for text responses to show as toasts
  // Note: Tool call handling (add/remove tools) is done centrally in ChatContext
  useEffect(() => {
    if (messages.length === 0) return;
    
    // Collect all new toasts to batch updates
    const newToasts: string[] = [];
    
    // Scan all messages for text responses and tool call confirmations
    for (const message of messages) {
      if (message.role !== 'assistant' || !message.parts) continue;
      
      for (let index = 0; index < message.parts.length; index++) {
        const part = message.parts[index];
        // Handle text responses - show as toast (Requirements: 4.1)
        if (part.type === 'text' && part.text) {
          // Create a unique key for this text part using message ID, index, and hash of text
          // This prevents collisions when different parts share the same prefix
          const textHash = hashString(part.text);
          const textKey = `${message.id}-text-${index}-${textHash}`;
          if (!processedMessageIds.current.has(textKey)) {
            addProcessedId(textKey);
            newToasts.push(part.text);
          }
        }
        
        // Show toast notifications for tool calls (tool execution is handled by ChatContext)
        if (isToolUIPart(part)) {
          const toolName = getToolName(part);
          
          // Skip if already processed for toast
          const toastKey = `toast-${part.toolCallId}`;
          if (processedMessageIds.current.has(toastKey)) continue;
          
          // Only process 'output-available' state to avoid duplicate toasts
          // (both 'output-available' and 'input-available' can be present)
          if (part.state === 'output-available') {
            addProcessedId(toastKey);
            
            if (toolName === 'show_tools') {
              // Runtime validation: verify part.input is an object with expected structure
              if (
                part.input &&
                typeof part.input === 'object' &&
                'tools' in part.input &&
                Array.isArray(part.input.tools) &&
                part.input.tools.length > 0
              ) {
                // Safely map and filter tool names
                const toolNames = part.input.tools
                  .filter((t): t is { name: string } => t && typeof t === 'object' && 'name' in t && typeof t.name === 'string')
                  .map((t) => t.name);
                
                if (toolNames.length > 0) {
                  const toastText =
                    toolNames.length === 1
                      ? `Added ${toolNames[0]} effect`
                      : `Added ${toolNames.join(', ')} effects`;
                  newToasts.push(toastText);
                }
              }
            } else if (toolName === 'remove_tools') {
              // Runtime validation: verify part.input is an object with string array
              if (
                part.input &&
                typeof part.input === 'object' &&
                'tools' in part.input &&
                Array.isArray(part.input.tools) &&
                part.input.tools.length > 0
              ) {
                // Filter for string elements only
                const toolNames = part.input.tools.filter(
                  (t): t is string => typeof t === 'string'
                );
                
                if (toolNames.length > 0) {
                  const toastText =
                    toolNames.length === 1
                      ? `Removed ${toolNames[0]} effect`
                      : `Removed ${toolNames.join(', ')} effects`;
                  newToasts.push(toastText);
                }
              }
            }
          }
        }
      }
    }
    
    // Batch state updates after processing (use queueMicrotask to avoid sync setState warning)
    if (newToasts.length > 0) {
      queueMicrotask(() => {
        setToastQueue((prev) => {
          let queue = prev;
          for (const text of newToasts) {
            queue = addToast(queue, text);
          }
          return queue;
        });
      });
    }
  }, [messages, addProcessedId]);

  if (!imageState.hasImage) {
    return null;
  }

  return (
    <>
    <motion.div
      initial={{ opacity: 0, y: 50 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={`fixed bottom-8 left-1/2 -translate-x-1/2 z-40
                 h-14 px-4 flex items-center gap-3
                 ${glass.background} ${glass.blur} ${glass.border} rounded-full`}
      style={{ boxShadow: glass.boxShadow }}
      data-testid="dynamic-dock"
      role="toolbar"
      aria-label="AI editing tools"
    >
      <div className="p-2 rounded-full bg-gradient-to-br from-violet-500/20 to-indigo-500/20 
                      backdrop-blur-sm border border-white/10">
        <Sparkles 
          size={iconSize.md} 
          className={`text-violet-400 ${isLoading ? 'animate-spin' : ''}`} 
        />
      </div>
      
      <input
        ref={inputRef}
        type="text"
        value={aiInput}
        onChange={(e) => setAiInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Describe your edit..."
        disabled={disabled || isLoading}
        className="w-64 px-3 py-1.5 bg-transparent border-none
                   text-white placeholder-zinc-500 text-sm
                   focus:outline-none
                   disabled:opacity-50 disabled:cursor-not-allowed"
        aria-label="AI message input"
        data-testid="dock-ai-input"
      />
      
      <button
        onClick={handleAiSubmit}
        disabled={disabled || isLoading || !aiInput.trim()}
        className="p-2 rounded-full hover:bg-white/10 
                   transition-colors text-zinc-400 hover:text-white
                   disabled:opacity-50 disabled:cursor-not-allowed"
        aria-label="Send message"
        data-testid="dock-ai-send"
      >
        <Send size={18} />
      </button>
    </motion.div>
    
    {/* Ghost Toast - rendered outside dock to avoid overlap */}
    <GhostToast
      messages={toastQueue}
      onDismiss={handleToastDismiss}
    />
    </>
  );
}
