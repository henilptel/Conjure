'use client';

import { useReducer, useCallback, useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Droplets,
  Palette,
  Sun,
  Lightbulb,
  Paintbrush,
  Image,
  Sparkles,
  X,
  Send,
  ChevronLeft,
  type LucideIcon,
} from 'lucide-react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { useAppStore } from '@/lib/store';
import { getToolConfig } from '@/lib/tools-registry';
import { useDebouncedCallback } from '@/lib/hooks';
import Slider from '@/app/components/ui/Slider';
import GhostToast, { addToast, removeToast, ToastMessage } from './GhostToast';
import { ImageState } from '@/lib/types';

// ============================================================================
// Types
// ============================================================================

/**
 * Dock state modes
 * Requirements: 1.3, 2.1, 3.1
 */
export type DockState = 'IDLE' | 'ACTIVE_TOOL' | 'AI_MODE';

/**
 * Toast message interface (re-exported from GhostToast)
 */
export type { ToastMessage } from './GhostToast';

/**
 * Local state for the dock component
 */
export interface DockLocalState {
  mode: DockState;
  activeTool: string | null;
  toastQueue: ToastMessage[];
}

/**
 * Actions for the dock reducer
 */
export type DockAction =
  | { type: 'SELECT_TOOL'; toolId: string }
  | { type: 'CLOSE_TOOL' }
  | { type: 'ENTER_AI_MODE' }
  | { type: 'EXIT_AI_MODE' }
  | { type: 'AI_TOOL_CALL'; toolId: string; value: number }
  | { type: 'ADD_TOAST'; toast: ToastMessage }
  | { type: 'REMOVE_TOAST'; id: string };

// ============================================================================
// Constants
// ============================================================================

/**
 * Tool icons configuration mapping tool IDs to Lucide icons
 * Requirements: 1.3
 */
export const DOCK_TOOLS: readonly { id: string; icon: LucideIcon; label: string }[] = [
  { id: 'blur', icon: Droplets, label: 'Blur' },
  { id: 'grayscale', icon: Palette, label: 'Grayscale' },
  { id: 'contrast', icon: Sun, label: 'Contrast' },
  { id: 'brightness', icon: Lightbulb, label: 'Brightness' },
  { id: 'saturation', icon: Paintbrush, label: 'Saturation' },
  { id: 'sepia', icon: Image, label: 'Sepia' },
] as const;

/**
 * Initial state for the dock
 */
export const initialDockState: DockLocalState = {
  mode: 'IDLE',
  activeTool: null,
  toastQueue: [],
};

// ============================================================================
// Reducer
// ============================================================================

/**
 * Dock state reducer for managing state transitions
 * Requirements: 2.1, 3.1, 3.4
 */
export function dockReducer(state: DockLocalState, action: DockAction): DockLocalState {
  switch (action.type) {
    case 'SELECT_TOOL':
      return {
        ...state,
        mode: 'ACTIVE_TOOL',
        activeTool: action.toolId,
      };
    case 'CLOSE_TOOL':
      return {
        ...state,
        mode: 'IDLE',
        activeTool: null,
      };
    case 'ENTER_AI_MODE':
      return {
        ...state,
        mode: 'AI_MODE',
      };
    case 'EXIT_AI_MODE':
      return {
        ...state,
        mode: 'IDLE',
      };
    case 'AI_TOOL_CALL':
      return {
        ...state,
        mode: 'ACTIVE_TOOL',
        activeTool: action.toolId,
      };
    case 'ADD_TOAST':
      return {
        ...state,
        toastQueue: [...state.toastQueue, action.toast].slice(-5), // Max 5 toasts
      };
    case 'REMOVE_TOAST':
      return {
        ...state,
        toastQueue: state.toastQueue.filter((t) => t.id !== action.id),
      };
    default:
      return state;
  }
}

// ============================================================================
// Component Props
// ============================================================================

export interface DynamicDockProps {
  disabled?: boolean;
}

// ============================================================================
// Animation Variants
// ============================================================================

/**
 * Spring configuration for dock width transitions
 * Requirements: 5.1
 */
const springConfig = {
  type: 'spring' as const,
  stiffness: 400,
  damping: 30,
  mass: 1,
};

/**
 * Dock container animation variants
 * Requirements: 5.1
 */
const dockVariants = {
  hidden: { 
    opacity: 0, 
    y: 50, 
    scale: 0.9,
  },
  visible: { 
    opacity: 1, 
    y: 0, 
    scale: 1,
  },
};

/**
 * Tool icon animation variants with spring physics
 * Requirements: 5.2
 */
const iconVariants = {
  initial: { opacity: 0, scale: 0.8 },
  animate: { 
    opacity: 1, 
    scale: 1,
    transition: {
      type: 'spring',
      stiffness: 500,
      damping: 30,
    },
  },
  exit: { 
    opacity: 0, 
    scale: 0.8,
    transition: { duration: 0.1 },
  },
};

/**
 * Slider container animation variants
 * Requirements: 5.3
 */
const sliderVariants = {
  initial: { opacity: 0, scaleX: 0 },
  animate: { 
    opacity: 1, 
    scaleX: 1,
    transition: {
      ...springConfig,
      stiffness: 300,
    },
  },
  exit: { 
    opacity: 0, 
    scaleX: 0,
    transition: { duration: 0.15 },
  },
};

/**
 * Text input animation variants
 * Requirements: 5.4
 */
const inputVariants = {
  initial: { opacity: 0, scaleX: 0 },
  animate: { 
    opacity: 1, 
    scaleX: 1,
    transition: {
      ...springConfig,
      stiffness: 300,
    },
  },
  exit: { 
    opacity: 0, 
    scaleX: 0,
    transition: { duration: 0.15 },
  },
};

/**
 * Content container animation for state transitions
 * Requirements: 5.1
 */
const contentVariants = {
  initial: { opacity: 0 },
  animate: { 
    opacity: 1,
    transition: { duration: 0.15 },
  },
  exit: { 
    opacity: 0,
    transition: { duration: 0.1 },
  },
};

// ============================================================================
// Component
// ============================================================================

/**
 * Builds the image context for AI requests from store state
 */
function buildImageContext(
  imageState: { hasImage: boolean; width: number | null; height: number | null },
  activeTools: { id: string; label: string; value: number; min: number; max: number }[]
): ImageState {
  // Calculate blur and grayscale from activeTools
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
 * DynamicDock - A floating bottom interface component
 * 
 * Features:
 * - Three states: IDLE (tool icons), ACTIVE_TOOL (slider), AI_MODE (text input)
 * - Glassmorphism styling
 * - Framer-motion animations
 * - Conditional rendering based on image state
 * 
 * Requirements: 1.1, 1.2, 1.3, 1.4, 2.1, 3.1, 3.2, 3.3, 3.4
 */
export default function DynamicDock({ disabled = false }: DynamicDockProps) {
  const imageState = useAppStore((state) => state.imageState);
  const activeTools = useAppStore((state) => state.activeTools);
  const addTool = useAppStore((state) => state.addTool);
  const [state, dispatch] = useReducer(dockReducer, initialDockState);
  
  // AI input state (managed manually per AI SDK v5)
  const [aiInput, setAiInput] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  
  // Toast queue state for AI responses
  const [toastQueue, setToastQueue] = useState<ToastMessage[]>([]);
  
  // useChat hook for AI functionality (Requirements: 3.1, 3.2, 3.3)
  const { messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({ api: '/api/chat' }),
  });
  
  const isAiLoading = status === 'submitted' || status === 'streaming';

  // Debounced tool value update - applies changes in real-time with 150ms debounce
  const debouncedUpdateTool = useDebouncedCallback(
    useCallback((toolId: string, value: number) => {
      addTool([{ name: toolId, initial_value: value }]);
    }, [addTool]),
    150
  );

  // Handle tool icon click - transition to ACTIVE_TOOL state
  const handleToolClick = useCallback((toolId: string) => {
    if (disabled) return;
    dispatch({ type: 'SELECT_TOOL', toolId });
  }, [disabled]);

  // Handle sparkle icon click - transition to AI_MODE state
  const handleSparkleClick = useCallback(() => {
    if (disabled) return;
    dispatch({ type: 'ENTER_AI_MODE' });
  }, [disabled]);

  // Handle slider value change - debounced real-time update to store
  // Requirements: 2.2
  const handleSliderChange = useCallback((value: number) => {
    if (state.activeTool) {
      debouncedUpdateTool.call(state.activeTool, value);
    }
  }, [state.activeTool, debouncedUpdateTool]);

  // Handle closing the active tool (clicking outside or pressing escape)
  const handleCloseTool = useCallback(() => {
    debouncedUpdateTool.cancel(); // Cancel any pending debounced updates
    dispatch({ type: 'CLOSE_TOOL' });
  }, [debouncedUpdateTool]);
  
  // Handle AI message submit (Requirements: 3.3)
  const handleAiSubmit = useCallback(async () => {
    if (!aiInput.trim() || isAiLoading || disabled) return;
    
    const messageText = aiInput.trim();
    setAiInput('');
    
    // Build image context from current state
    const imageContext = buildImageContext(imageState, activeTools);
    
    // Send message with image context
    await sendMessage(
      { text: messageText },
      { body: { imageContext } }
    );
    
    // Return to IDLE after submitting
    dispatch({ type: 'EXIT_AI_MODE' });
  }, [aiInput, isAiLoading, disabled, imageState, activeTools, sendMessage]);
  
  // Handle Escape key to exit AI mode (Requirements: 3.4)
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      dispatch({ type: 'EXIT_AI_MODE' });
    } else if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleAiSubmit();
    }
  }, [handleAiSubmit]);
  
  // Handle toast dismiss
  const handleToastDismiss = useCallback((id: string) => {
    setToastQueue(prev => removeToast(prev, id));
  }, []);
  
  // Focus input when entering AI mode
  useEffect(() => {
    if (state.mode === 'AI_MODE' && inputRef.current) {
      inputRef.current.focus();
    }
  }, [state.mode]);
  
  // Process AI messages for text responses and tool calls (Requirements: 3.3, 4.1, 4.3)
  useEffect(() => {
    if (messages.length === 0) return;
    
    const lastMessage = messages[messages.length - 1];
    if (lastMessage.role !== 'assistant') return;
    
    // Process parts for text and tool calls
    for (const part of lastMessage.parts || []) {
      // Handle text responses - show as toast (Requirements: 4.1)
      if (part.type === 'text' && part.text) {
        setToastQueue(prev => addToast(prev, part.text));
      }
      
      // Handle tool calls - detect show_tools (Requirements: 4.3)
      if (typeof part.type === 'string' && part.type.startsWith('tool-')) {
        const toolPart = part as { type: string; state: string; output?: unknown };
        
        // Check if it's a show_tools call with result
        if (part.type === 'tool-show_tools' && toolPart.state === 'result' && toolPart.output) {
          const output = toolPart.output as { tools?: Array<{ id: string; value: number }> };
          if (output.tools && output.tools.length > 0) {
            // Add tools to store and transition to ACTIVE_TOOL for the first tool
            const firstTool = output.tools[0];
            addTool(output.tools.map(t => ({ name: t.id, initial_value: t.value })));
            dispatch({ type: 'AI_TOOL_CALL', toolId: firstTool.id, value: firstTool.value });
          }
        }
      }
    }
  }, [messages, addTool]);

  // Don't render if no image is loaded (Requirements: 1.2)
  if (!imageState.hasImage) {
    return null;
  }

  // Render the content based on current mode
  const renderContent = () => {
    if (state.mode === 'IDLE') {
      return (
        <motion.div
          key="idle-tools"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="flex items-center gap-3"
        >
          {DOCK_TOOLS.map((tool) => (
            <button
              key={tool.id}
              onClick={() => handleToolClick(tool.id)}
              disabled={disabled}
              className="p-2 rounded-full hover:bg-white/10 transition-colors
                         text-zinc-300 hover:text-white disabled:opacity-50
                         disabled:cursor-not-allowed"
              aria-label={tool.label}
              data-testid={`dock-tool-${tool.id}`}
            >
              <tool.icon size={20} />
            </button>
          ))}
          
          <div className="w-px h-6 bg-white/20 mx-1" />
          <button
            onClick={handleSparkleClick}
            disabled={disabled}
            className="p-2 rounded-full hover:bg-white/10 transition-colors
                       text-zinc-300 hover:text-white disabled:opacity-50
                       disabled:cursor-not-allowed"
            aria-label="AI Assistant"
            data-testid="dock-sparkle"
          >
            <Sparkles size={20} />
          </button>
        </motion.div>
      );
    }

    if (state.mode === 'ACTIVE_TOOL' && state.activeTool) {
      const tool = DOCK_TOOLS.find(t => t.id === state.activeTool);
      const toolConfig = getToolConfig(state.activeTool);
      if (!tool || !toolConfig) return null;
      
      const IconComponent = tool.icon;
      const existingTool = activeTools.find(t => t.id === state.activeTool);
      const currentValue = existingTool?.value ?? toolConfig.defaultValue;

      return (
        <motion.div
          key="active-tool"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="flex items-center gap-4"
        >
          <div
            className="p-2 rounded-full bg-white/10 text-white"
            aria-label={tool.label}
            data-testid="dock-active-tool-icon"
          >
            <IconComponent size={20} />
          </div>

          <div className="w-48" data-testid="dock-slider-container">
            <Slider
              value={currentValue}
              min={toolConfig.min}
              max={toolConfig.max}
              onChange={handleSliderChange}
              label={tool.label}
              disabled={disabled}
              id={`dock-slider-${state.activeTool}`}
            />
          </div>

          <div className="w-px h-6 bg-white/20" />

          <button
            onClick={handleCloseTool}
            className="p-2 rounded-full hover:bg-white/10 transition-colors text-zinc-300 hover:text-white"
            aria-label="Back to tools"
            data-testid="dock-back-button"
          >
            <ChevronLeft size={20} />
          </button>
        </motion.div>
      );
    }

    if (state.mode === 'AI_MODE') {
      return (
        <motion.div
          key="ai-mode"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="flex items-center gap-3"
        >
          <div
            className="p-2 rounded-full bg-white/10 text-white"
            aria-label="AI Mode Active"
            data-testid="dock-ai-icon"
          >
            <Sparkles size={20} />
          </div>
          
          <input
            ref={inputRef}
            type="text"
            value={aiInput}
            onChange={(e) => setAiInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask AI..."
            disabled={disabled || isAiLoading}
            className="w-64 px-4 py-2 bg-white/10 border border-white/20 rounded-full
                       text-white placeholder-zinc-400 text-sm
                       focus:outline-none focus:ring-2 focus:ring-white/30
                       disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label="AI message input"
            data-testid="dock-ai-input"
          />
          
          <button
            onClick={handleAiSubmit}
            disabled={disabled || isAiLoading || !aiInput.trim()}
            className="p-2 rounded-full hover:bg-white/10 transition-colors
                       text-zinc-300 hover:text-white disabled:opacity-50
                       disabled:cursor-not-allowed"
            aria-label="Send message"
            data-testid="dock-ai-send"
          >
            <Send size={20} />
          </button>
          
          <button
            onClick={() => dispatch({ type: 'EXIT_AI_MODE' })}
            disabled={disabled}
            className="p-2 rounded-full hover:bg-red-500/20 transition-colors
                       text-red-400 hover:text-red-300 disabled:opacity-50
                       disabled:cursor-not-allowed"
            aria-label="Exit AI mode"
            data-testid="dock-ai-cancel"
          >
            <X size={20} />
          </button>
        </motion.div>
      );
    }

    return null;
  };

  return (
    <motion.div
      variants={dockVariants}
      initial="hidden"
      animate="visible"
      exit="hidden"
      transition={{ duration: 0.2 }}
      className="fixed bottom-8 left-1/2 -translate-x-1/2 z-40
                 h-16 px-6 flex items-center justify-center
                 bg-black/60 backdrop-blur-xl border border-white/10 
                 rounded-full shadow-2xl"
      data-testid="dynamic-dock"
      role="toolbar"
      aria-label="Image editing tools"
    >
      <AnimatePresence mode="wait">
        {renderContent()}
      </AnimatePresence>
      
      {/* Ghost Toast for AI responses */}
      <GhostToast
        messages={toastQueue}
        onDismiss={handleToastDismiss}
      />
    </motion.div>
  );
}
