'use client';

import { useState, FormEvent, ChangeEvent, useEffect, useRef } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, UIMessage, isToolUIPart, getToolName } from 'ai';
import { motion, AnimatePresence } from 'framer-motion';
import { ToolInput } from '@/lib/types';
import { useAppStore } from '@/lib/store';
import { getMessageBubbleClasses } from '@/lib/chat';
import { cn } from '@/lib/utils';
import LoadingIndicator from './LoadingIndicator';

// Create transport once at module level - body will be passed per-request
const transport = new DefaultChatTransport({ api: '/api/chat' });

// Maximum number of tool call IDs to track (FIFO eviction)
const MAX_PROCESSED_TOOL_CALLS = 100;

/**
 * ChatInterface component - uses Zustand store for state management
 * Requirements: 1.6, 1.7
 */
export default function ChatInterface() {
  // Get state and actions from Zustand store
  const { imageState, activeTools, addTool, removeTool } = useAppStore();
  const [input, setInput] = useState('');
  // Track processed tool call IDs to avoid duplicate callbacks (bounded FIFO cache)
  const processedToolCallsRef = useRef<Set<string>>(new Set());
  const toolCallOrderRef = useRef<string[]>([]); // FIFO queue for eviction

  const { messages, sendMessage, status, error } = useChat({
    transport,
  });

  const isLoading = status === 'submitted' || status === 'streaming';

  // Helper to add tool call ID with bounded cache eviction
  const addProcessedToolCall = (toolCallId: string) => {
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
  };

  // Handle tool calls from streaming response
  // Detect show_tools and remove_tools tool calls in message parts
  // Requirements: 1.1, 7.4
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
              const toolInput = part.input as { tools?: Array<{ name: string; initial_value?: number }> };
              if (toolInput?.tools && Array.isArray(toolInput.tools) && 
                  toolInput.tools.every(t => t && typeof t === 'object' && typeof t.name === 'string')) {
                addTool(toolInput.tools);
              }
            } else if (toolName === 'remove_tools') {
              // Extract tools to remove
              const toolInput = part.input as { tools?: string[] };
              if (toolInput?.tools && Array.isArray(toolInput.tools) && 
                  toolInput.tools.every(t => typeof t === 'string')) {
                toolInput.tools.forEach(toolId => removeTool(toolId));
              }
            }
          }
        }
      }
    }
  }, [messages, addTool, removeTool]);

  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    setInput(e.target.value);
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    if (!input.trim() || isLoading) return;

    const messageText = input.trim();
    setInput('');
    
    // Construct full imageContext from store state
    // The API expects ImageState with blur, isGrayscale, and activeTools
    const fullImageContext = {
      ...imageState,
      blur: activeTools.find(t => t.id === 'blur')?.value ?? 0,
      isGrayscale: activeTools.some(t => t.id === 'grayscale' && t.value > 0),
      activeTools,
    };
    
    // Pass imageContext in the body option of sendMessage
    await sendMessage(
      { text: messageText },
      { body: { imageContext: fullImageContext } }
    );
  };

  // Helper to extract text content from message parts
  const getMessageContent = (message: UIMessage): string => {
    if (!message.parts || message.parts.length === 0) {
      return '';
    }
    
    // First, try to get text content
    const textContent = message.parts
      .filter((part): part is { type: 'text'; text: string } => part.type === 'text')
      .map(part => part.text)
      .join('');
    
    if (textContent) {
      return textContent;
    }
    
    // If no text but there's a tool call, generate a friendly message
    for (const part of message.parts) {
      if (isToolUIPart(part)) {
        const toolName = getToolName(part);
        
        if (toolName === 'show_tools') {
          const toolInput = part.input as { tools?: Array<{ name: string; initial_value?: number }> };
          if (toolInput?.tools && Array.isArray(toolInput.tools) && 
              toolInput.tools.every(t => t && typeof t === 'object' && typeof t.name === 'string')) {
            const toolNames = toolInput.tools.map(t => t.name);
            if (toolNames.length === 1) {
              return `I've added the ${toolNames[0]} control for you. Adjust the slider to see the effect!`;
            } else {
              return `I've added ${toolNames.join(', ')} controls for you. Adjust the sliders to see the effects!`;
            }
          }
        } else if (toolName === 'remove_tools') {
          const toolInput = part.input as { tools?: string[] };
          if (toolInput?.tools && Array.isArray(toolInput.tools) && 
              toolInput.tools.every(t => typeof t === 'string')) {
            if (toolInput.tools.length === 1) {
              return `Done! I've removed the ${toolInput.tools[0]} effect.`;
            } else {
              return `Done! I've removed the ${toolInput.tools.join(', ')} effects.`;
            }
          }
        }
      }
    }
    
    return '';
  };

  // Message animation variants for AnimatePresence
  const messageVariants = {
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -10 }
  };

  return (
    <div className={cn(
      // Glassmorphism styling - Requirements: 4.1, 4.6
      "backdrop-blur-md bg-black/40",
      "border border-white/10 rounded-2xl",
      // Floating sidebar positioning - Requirements: 4.2
      // Responsive: smaller on mobile, full width on very small screens
      "absolute z-20",
      "right-4 top-4 bottom-4 w-[calc(100%-2rem)]",
      "sm:right-4 sm:top-4 sm:bottom-4 sm:w-[320px]",
      "md:right-6 md:top-6 md:bottom-6 md:w-[400px]",
      // Layout
      "flex flex-col overflow-hidden"
    )}>
      {/* Header */}
      <div className="px-4 py-3 border-b border-white/10">
        <h3 className="text-sm font-semibold text-zinc-100">
          AI Assistant
        </h3>
      </div>

      {/* Message List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 ? (
          <div className="text-center text-zinc-400 text-sm py-8">
            <p>Ask me about your image!</p>
            <p className="mt-1 text-xs">
              I can see the current blur level, dimensions, and more.
            </p>
          </div>
        ) : (
          <AnimatePresence mode="popLayout">
            {messages.map((message) => (
              <motion.div
                key={message.id}
                variants={messageVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={{ duration: 0.2 }}
                className={cn(
                  "max-w-[80%] text-sm",
                  getMessageBubbleClasses(message.role as 'user' | 'assistant')
                )}
              >
                {getMessageContent(message)}
              </motion.div>
            ))}
          </AnimatePresence>
        )}
        {isLoading && (
          <div className="flex justify-start">
            <LoadingIndicator message="Thinking..." size="sm" />
          </div>
        )}
        {error && (
          <div className="text-red-400 text-sm px-3 py-2">
            Sorry, I encountered an error. Please try again.
          </div>
        )}
      </div>

      {/* Input Form */}
      <form onSubmit={handleSubmit} className="p-4 border-t border-white/10">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={handleInputChange}
            placeholder="Ask about your image..."
            className="flex-1 px-3 py-2 text-sm bg-black/30 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-white/20 text-zinc-100 placeholder-zinc-500"
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="px-4 py-2 text-sm font-medium bg-white text-black rounded-lg hover:bg-zinc-200 disabled:bg-zinc-700 disabled:text-zinc-500 disabled:cursor-not-allowed transition-colors"
          >
            Send
          </button>
        </div>
      </form>
    </div>
  );
}
