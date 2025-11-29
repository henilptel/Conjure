'use client';

import { useState, FormEvent, ChangeEvent } from 'react';
import { useChat } from '@ai-sdk/react';
import { TextStreamChatTransport, UIMessage } from 'ai';
import { ImageState } from '@/lib/types';
import { getMessageClasses } from '@/lib/chat';
import LoadingIndicator from './LoadingIndicator';

interface ChatInterfaceProps {
  imageState: ImageState;
}

// Create transport once at module level - body will be passed per-request
const transport = new TextStreamChatTransport({ api: '/api/chat' });

export default function ChatInterface({ imageState }: ChatInterfaceProps) {
  const [input, setInput] = useState('');

  const { messages, sendMessage, status, error } = useChat({
    transport,
  });

  const isLoading = status === 'submitted' || status === 'streaming';

  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    setInput(e.target.value);
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    if (!input.trim() || isLoading) return;

    const messageText = input.trim();
    setInput('');
    
    // Pass imageContext in the body option of sendMessage
    await sendMessage(
      { text: messageText },
      { body: { imageContext: imageState } }
    );
  };

  // Helper to extract text content from message parts
  const getMessageContent = (message: UIMessage): string => {
    if (!message.parts || message.parts.length === 0) {
      return '';
    }
    return message.parts
      .filter((part): part is { type: 'text'; text: string } => part.type === 'text')
      .map(part => part.text)
      .join('');
  };

  return (
    <div className="flex flex-col h-full bg-zinc-50 dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-700">
      {/* Header */}
      <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-700">
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          AI Assistant
        </h3>
      </div>

      {/* Message List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 ? (
          <div className="text-center text-zinc-500 dark:text-zinc-400 text-sm py-8">
            <p>Ask me about your image!</p>
            <p className="mt-1 text-xs">
              I can see the current blur level, dimensions, and more.
            </p>
          </div>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={`max-w-[80%] px-3 py-2 rounded-lg text-sm ${getMessageClasses(message.role as 'user' | 'assistant')}`}
            >
              {getMessageContent(message)}
            </div>
          ))
        )}
        {isLoading && (
          <div className="flex justify-start">
            <LoadingIndicator message="Thinking..." size="sm" />
          </div>
        )}
        {error && (
          <div className="text-red-500 text-sm px-3 py-2">
            Sorry, I encountered an error. Please try again.
          </div>
        )}
      </div>

      {/* Input Form */}
      <form onSubmit={handleSubmit} className="p-4 border-t border-zinc-200 dark:border-zinc-700">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={handleInputChange}
            placeholder="Ask about your image..."
            className="flex-1 px-3 py-2 text-sm bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 text-zinc-900 dark:text-zinc-100 placeholder-zinc-500"
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-zinc-300 dark:disabled:bg-zinc-700 disabled:text-zinc-500 disabled:cursor-not-allowed transition-colors"
          >
            Send
          </button>
        </div>
      </form>
    </div>
  );
}
