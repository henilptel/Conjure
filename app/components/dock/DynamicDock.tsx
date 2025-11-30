'use client';

import { useCallback, useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Sparkles, Send } from 'lucide-react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, isToolUIPart, getToolName } from 'ai';
import { useAppStore } from '@/lib/store';
import GhostToast, { addToast, removeToast, ToastMessage } from './GhostToast';
import ChatHistory from './ChatHistory';
import { ImageState } from '@/lib/types';

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

function buildImageContext(
  imageState: { hasImage: boolean; width: number | null; height: number | null },
  activeTools: { id: string; label: string; value: number; min: number; max: number }[]
): ImageState {
  const blurTool = activeTools.find(t => t.id === 'blur');
  const grayscaleTool = activeTools.find(t => t.id === 'grayscale');
  
  return {
    hasImage: imageState.hasImage,
    width: imageState.width,
    height: imageState.height,
    blur: blurTool?.value ?? 0,
    isGrayscale: grayscaleTool ? grayscaleTool.value > 0 : false,
    activeTools,
  };
}

/**
 * DynamicDock - AI chat input dock at bottom of screen
 */
export default function DynamicDock({ disabled = false }: DynamicDockProps) {
  const imageState = useAppStore((state) => state.imageState);
  const activeTools = useAppStore((state) => state.activeTools);
  const addTool = useAppStore((state) => state.addTool);
  const removeTool = useAppStore((state) => state.removeTool);
  
  const [aiInput, setAiInput] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const [toastQueue, setToastQueue] = useState<ToastMessage[]>([]);
  const processedMessageIds = useRef<Set<string>>(new Set());
  
  const { messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({ api: '/api/chat' }),
  });
  
  const isAiLoading = status === 'submitted' || status === 'streaming';
  
  const handleAiSubmit = useCallback(async () => {
    if (!aiInput.trim() || isAiLoading || disabled) return;
    
    const messageText = aiInput.trim();
    setAiInput('');
    
    const imageContext = buildImageContext(imageState, activeTools);
    
    sendMessage(
      { text: messageText },
      { body: { imageContext } }
    );
  }, [aiInput, isAiLoading, disabled, imageState, activeTools, sendMessage]);
  
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleAiSubmit();
    }
  }, [handleAiSubmit]);
  
  const handleToastDismiss = useCallback((id: string) => {
    setToastQueue(prev => removeToast(prev, id));
  }, []);
  
  // Process AI messages for text responses and tool calls (Requirements: 3.3, 4.1, 4.3)
  useEffect(() => {
    if (messages.length === 0) return;
    
    // Collect all new toasts to batch updates
    const newToasts: string[] = [];
    
    // Scan all messages for tool calls and text responses
    for (const message of messages) {
      if (message.role !== 'assistant' || !message.parts) continue;
      
      for (const part of message.parts) {
        // Handle text responses - show as toast (Requirements: 4.1)
        if (part.type === 'text' && part.text) {
          // Create a unique key for this text part
          const textKey = `${message.id}-text-${part.text.substring(0, 50)}`;
          if (!processedMessageIds.current.has(textKey)) {
            processedMessageIds.current.add(textKey);
            newToasts.push(part.text);
          }
        }
        
        // Handle tool calls using AI SDK v5 helpers (Requirements: 4.3)
        if (isToolUIPart(part)) {
          const toolName = getToolName(part);
          
          // Skip if already processed
          if (processedMessageIds.current.has(part.toolCallId)) continue;
          
          // Process when tool output is available (v5 state)
          if (part.state === 'output-available' || part.state === 'input-available') {
            processedMessageIds.current.add(part.toolCallId);
            
            if (toolName === 'show_tools') {
              // Extract tools from the tool input (new format with initial values)
              const toolInput = part.input as {
                tools?: Array<{ name: string; initial_value?: number }>;
              };
              if (
                toolInput?.tools &&
                Array.isArray(toolInput.tools) &&
                toolInput.tools.every(
                  (t) => t && typeof t === 'object' && typeof t.name === 'string'
                )
              ) {
                // Add tools to store
                addTool(toolInput.tools);
                
                // Show a toast about the tool being added
                const toolNames = toolInput.tools.map((t) => t.name);
                const toastText =
                  toolNames.length === 1
                    ? `Added ${toolNames[0]} effect`
                    : `Added ${toolNames.join(', ')} effects`;
                newToasts.push(toastText);
              }
            } else if (toolName === 'remove_tools') {
              // Extract tools to remove
              const toolInput = part.input as { tools?: string[] };
              if (
                toolInput?.tools &&
                Array.isArray(toolInput.tools) &&
                toolInput.tools.every((t) => typeof t === 'string')
              ) {
                // Remove each tool from store
                toolInput.tools.forEach((toolId) => removeTool(toolId));
                
                // Show a toast about the tools being removed
                const toastText =
                  toolInput.tools.length === 1
                    ? `Removed ${toolInput.tools[0]} effect`
                    : `Removed ${toolInput.tools.join(', ')} effects`;
                newToasts.push(toastText);
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
  }, [messages, addTool, removeTool]);

  if (!imageState.hasImage) {
    return null;
  }

  return (
    <>
    <motion.div
      initial={{ opacity: 0, y: 50 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed bottom-8 left-1/2 -translate-x-1/2 z-40
                 h-14 px-4 flex items-center gap-3
                 bg-black/60 backdrop-blur-xl border border-white/10 
                 rounded-full shadow-2xl"
      data-testid="dynamic-dock"
      role="toolbar"
      aria-label="AI editing tools"
    >
      <div className="p-2 rounded-full bg-gradient-to-br from-violet-500/20 to-indigo-500/20 
                      backdrop-blur-sm border border-white/10">
        <Sparkles 
          size={16} 
          className={`text-violet-400 ${isAiLoading ? 'animate-spin' : ''}`} 
        />
      </div>
      
      <input
        ref={inputRef}
        type="text"
        value={aiInput}
        onChange={(e) => setAiInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Describe your edit..."
        disabled={disabled || isAiLoading}
        className="w-64 px-3 py-1.5 bg-transparent border-none
                   text-white placeholder-zinc-500 text-sm
                   focus:outline-none
                   disabled:opacity-50 disabled:cursor-not-allowed"
        aria-label="AI message input"
        data-testid="dock-ai-input"
      />
      
      <button
        onClick={handleAiSubmit}
        disabled={disabled || isAiLoading || !aiInput.trim()}
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
    
    {/* Chat History - rendered outside dock to avoid overlap */}
    <ChatHistory messages={messages} isLoading={isAiLoading} />
    </>
  );
}
