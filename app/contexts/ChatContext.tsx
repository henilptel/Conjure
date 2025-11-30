'use client';

import {
  createContext,
  useContext,
  useCallback,
  useRef,
  useEffect,
  ReactNode,
} from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, UIMessage, isToolUIPart, getToolName } from 'ai';
import { useAppStore } from '@/lib/store';
import { ImageState } from '@/lib/types';

// ============================================================================
// Types
// ============================================================================

export interface ChatContextValue {
  /** All chat messages */
  messages: UIMessage[];
  /** Send a message to the AI */
  sendMessage: (text: string) => Promise<void>;
  /** Current chat status */
  status: 'ready' | 'submitted' | 'streaming' | 'error';
  /** Whether the chat is currently loading (submitted or streaming) */
  isLoading: boolean;
  /** Any error that occurred */
  error: Error | undefined;
}

// ============================================================================
// Context
// ============================================================================

const ChatContext = createContext<ChatContextValue | null>(null);

// Create transport once at module level (singleton pattern)
const transport = new DefaultChatTransport({ api: '/api/chat' });

// Maximum number of processed tool call IDs to track (FIFO eviction)
const MAX_PROCESSED_TOOL_CALLS = 100;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Builds the ImageState context for the API request body
 */
function buildImageContext(
  imageState: { hasImage: boolean; width: number | null; height: number | null },
  activeTools: { id: string; label: string; value: number; min: number; max: number }[]
): ImageState {
  const blurTool = activeTools.find((t) => t.id === 'blur');
  const grayscaleTool = activeTools.find((t) => t.id === 'grayscale');

  return {
    hasImage: imageState.hasImage,
    width: imageState.width,
    height: imageState.height,
    blur: blurTool?.value ?? 0,
    isGrayscale: grayscaleTool ? grayscaleTool.value > 0 : false,
    activeTools,
  };
}

// ============================================================================
// Provider Component
// ============================================================================

export interface ChatProviderProps {
  children: ReactNode;
}

/**
 * ChatProvider - Centralized chat state management
 *
 * Provides a single useChat instance for the entire app, automatically
 * injecting image context from the Zustand store into API requests.
 *
 * This eliminates duplicate chat instances and ensures consistent state.
 */
export function ChatProvider({ children }: ChatProviderProps) {
  // Get state from Zustand store
  const imageState = useAppStore((state) => state.imageState);
  const activeTools = useAppStore((state) => state.activeTools);
  const addTool = useAppStore((state) => state.addTool);
  const removeTool = useAppStore((state) => state.removeTool);

  // Track processed tool call IDs to avoid duplicate callbacks (bounded FIFO cache)
  const processedToolCallsRef = useRef<Set<string>>(new Set());
  const toolCallOrderRef = useRef<string[]>([]); // FIFO queue for eviction

  // Single useChat instance for the entire app
  const { messages, sendMessage: baseSendMessage, status, error } = useChat({
    transport,
  });

  const isLoading = status === 'submitted' || status === 'streaming';

  // Helper to add tool call ID with bounded cache eviction
  const addProcessedToolCall = useCallback((toolCallId: string) => {
    // If already exists, no need to add again
    if (processedToolCallsRef.current.has(toolCallId)) return;

    // Evict oldest entries if at capacity
    while (toolCallOrderRef.current.length >= MAX_PROCESSED_TOOL_CALLS) {
      const oldest = toolCallOrderRef.current.shift();
      if (oldest) {
        processedToolCallsRef.current.delete(oldest);
      }
    }

    // Add new entry
    processedToolCallsRef.current.add(toolCallId);
    toolCallOrderRef.current.push(toolCallId);
  }, []);

  // Process tool calls from streaming responses
  // Detect show_tools and remove_tools tool calls in message parts
  useEffect(() => {
    // Scan all messages for tool calls
    for (const message of messages) {
      if (message.role !== 'assistant' || !message.parts) continue;

      for (const part of message.parts) {
        // Check if this is a tool UI part using the helper
        if (isToolUIPart(part)) {
          const toolName = getToolName(part);

          // Skip if already processed
          if (processedToolCallsRef.current.has(part.toolCallId)) continue;

          // Process when tool input is available or output is ready
          // v5 states: 'input-streaming', 'input-available', 'output-available', 'output-error'
          if (part.state === 'output-available' || part.state === 'input-available') {
            addProcessedToolCall(part.toolCallId);

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
                addTool(toolInput.tools);
              }
            } else if (toolName === 'remove_tools') {
              // Extract tools to remove
              const toolInput = part.input as { tools?: string[] };
              if (
                toolInput?.tools &&
                Array.isArray(toolInput.tools) &&
                toolInput.tools.every((t) => typeof t === 'string')
              ) {
                toolInput.tools.forEach((toolId) => removeTool(toolId));
              }
            }
          }
        }
      }
    }
  }, [messages, addTool, removeTool, addProcessedToolCall]);

  // Wrapped sendMessage that auto-injects imageContext
  const sendMessage = useCallback(
    async (text: string) => {
      const imageContext = buildImageContext(imageState, activeTools);
      await baseSendMessage({ text }, { body: { imageContext } });
    },
    [imageState, activeTools, baseSendMessage]
  );

  // Context value
  const value: ChatContextValue = {
    messages,
    sendMessage,
    status,
    isLoading,
    error,
  };

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

// ============================================================================
// Hook
// ============================================================================

/**
 * useChatContext - Access the centralized chat state
 *
 * @throws Error if used outside of ChatProvider
 */
export function useChatContext(): ChatContextValue {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error('useChatContext must be used within a ChatProvider');
  }
  return context;
}
