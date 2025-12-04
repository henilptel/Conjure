'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageSquare, X, ChevronUp } from 'lucide-react';
import { UIMessage, isToolUIPart, getToolName } from 'ai';

export interface ChatHistoryProps {
  messages: UIMessage[];
  isLoading?: boolean;
}

/**
 * Extract text content from a UIMessage
 */
function getMessageText(message: UIMessage): string {
  if (!message.parts || message.parts.length === 0) return '';
  
  const textParts = message.parts
    .filter((part): part is { type: 'text'; text: string } => part.type === 'text')
    .map((part) => part.text);
  
  if (textParts.length > 0) {
    return textParts.join('');
  }
  
  // Check for tool calls and generate friendly text
  for (const part of message.parts) {
    if (isToolUIPart(part)) {
      const toolName = getToolName(part);
      if (toolName === 'show_tools') {
        const toolInput = part.input;
        if (
          toolInput &&
          typeof toolInput === 'object' &&
          'tools' in toolInput &&
          Array.isArray((toolInput as any).tools)
        ) {
          const tools = (toolInput as { tools: Array<{ name: string }> }).tools;
          const names = tools.map((t) => t.name).filter(Boolean);
          return names.length === 1
            ? `Added ${names[0]} control`
            : `Added ${names.join(', ')} controls`;
        }
      }
    }
  }
  
  return '';
}

/**
 * ChatHistory - Expandable panel showing conversation history
 * Positioned above the dock, can be toggled open/closed
 */
export default function ChatHistory({ messages, isLoading }: ChatHistoryProps) {
  const [isOpen, setIsOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  
  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (isOpen && scrollRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
      const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;
      
      // Only auto-scroll if user is already near the bottom
      if (isNearBottom) {
        scrollRef.current.scrollTop = scrollHeight;
      }
    }
  }, [messages, isOpen]);
  
  // Filter to only show messages with content
  const visibleMessages = messages.filter((m) => getMessageText(m).trim().length > 0);
  
  if (visibleMessages.length === 0 && !isLoading) {
    return null;
  }

  return (
    <>
      {/* Toggle button - positioned in top-right corner */}
      <AnimatePresence>
        {!isOpen && visibleMessages.length > 0 && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            onClick={() => setIsOpen(true)}
            className="fixed top-4 right-4 z-30 p-2 rounded-full
                       bg-white/10 backdrop-blur-2xl backdrop-saturate-150 border border-white/20
                       text-zinc-300 hover:text-white hover:bg-white/15
                       transition-colors shadow-lg shadow-black/10"
            aria-label="Show chat history"
            data-testid="chat-history-toggle"
          >
            <MessageSquare size={16} />
          </motion.button>
        )}
      </AnimatePresence>

      {/* Chat history panel - positioned below toggle button */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="fixed top-14 right-4 z-30 w-72 max-h-[calc(50vh-6rem)] flex flex-col
                       bg-white/10 backdrop-blur-2xl backdrop-saturate-150 border border-white/20
                       rounded-2xl shadow-lg shadow-black/10 overflow-hidden"
            data-testid="chat-history-panel"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/15">
              <h3 className="text-sm font-medium text-zinc-200">Chat History</h3>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1 rounded-full hover:bg-white/10 text-zinc-400 hover:text-white transition-colors"
                aria-label="Close chat history"
              >
                <X size={16} />
              </button>
            </div>
            
            {/* Messages */}
            <div
              ref={scrollRef}
              className="p-3 space-y-3 flex-1 overflow-y-auto"
            >
              {visibleMessages.map((message) => {
                const text = getMessageText(message);
                if (!text) return null;
                
                return (
                  <div
                    key={message.id}
                    className={`text-sm px-3 py-2 rounded-xl ${
                      message.role === 'user'
                        ? 'bg-blue-500/20 text-blue-100 ml-8'
                        : 'bg-white/10 text-zinc-200 mr-8'
                    }`}
                  >
                    {text}
                  </div>
                );
              })}
              
              {isLoading && (
                <div className="text-sm text-zinc-400 px-3 py-2">
                  <span className="animate-pulse">Thinking...</span>
                </div>
              )}
            </div>
            
            {/* Collapse button */}
            <button
              onClick={() => setIsOpen(false)}
              className="w-full py-2 border-t border-white/15 text-zinc-400 hover:text-white
                         hover:bg-white/10 transition-colors flex items-center justify-center gap-1 text-xs"
            >
              <ChevronUp size={14} />
              Collapse
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
