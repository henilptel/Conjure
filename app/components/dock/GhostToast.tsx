'use client';

import { useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * Interface for toast messages displayed above the dock
 * Requirements: 4.1, 4.2
 */
export interface ToastMessage {
  id: string;
  text: string;
  timestamp: number;
}

export interface GhostToastProps {
  messages: ToastMessage[];
  onDismiss: (id: string) => void;
  /** Auto-dismiss delay in milliseconds (default: 5000) */
  autoDismissMs?: number;
}

/** Default auto-dismiss delay */
export const DEFAULT_AUTO_DISMISS_MS = 5000;

/**
 * Animation variants for toast enter/exit
 */
const toastVariants = {
  initial: { opacity: 0, y: 20, scale: 0.95 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: -10, scale: 0.95 },
};

/**
 * Individual toast item component with auto-dismiss timer
 */
function ToastItem({
  message,
  onDismiss,
  autoDismissMs,
}: {
  message: ToastMessage;
  onDismiss: (id: string) => void;
  autoDismissMs: number;
}) {
  const handleDismiss = useCallback(() => {
    onDismiss(message.id);
  }, [message.id, onDismiss]);

  // Auto-dismiss timer (Requirements: 4.2)
  useEffect(() => {
    const timer = setTimeout(handleDismiss, autoDismissMs);
    return () => clearTimeout(timer);
  }, [handleDismiss, autoDismissMs]);

  return (
    <motion.div
      layout
      variants={toastVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={{ duration: 0.2, ease: 'easeOut' }}
      onClick={handleDismiss}
      className="px-4 py-3 bg-black/60 backdrop-blur-xl border border-white/10 
                 rounded-2xl shadow-2xl cursor-pointer hover:bg-black/70 
                 transition-colors max-w-sm"
      role="alert"
      aria-live="polite"
      data-testid={`ghost-toast-${message.id}`}
    >
      <p className="text-sm text-zinc-200">{message.text}</p>
    </motion.div>
  );
}

/**
 * GhostToast component - displays floating toasts above the dock
 * 
 * Features:
 * - Glassmorphism styling matching dock aesthetic
 * - Auto-dismiss after configurable delay (default 5 seconds)
 * - Click-to-dismiss functionality
 * - Framer-motion AnimatePresence for smooth enter/exit animations
 * - FIFO queue display order
 * 
 * Requirements: 4.1, 4.2, 4.4
 */
export default function GhostToast({
  messages,
  onDismiss,
  autoDismissMs = DEFAULT_AUTO_DISMISS_MS,
}: GhostToastProps) {
  return (
    <div
      className="fixed bottom-28 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 items-center"
      data-testid="ghost-toast-container"
    >
      <AnimatePresence mode="popLayout">
        {messages.map((message) => (
          <ToastItem
            key={message.id}
            message={message}
            onDismiss={onDismiss}
            autoDismissMs={autoDismissMs}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}

/**
 * Pure function to add a toast to the queue (FIFO order)
 * Requirements: 4.4
 */
export function addToast(
  queue: ToastMessage[],
  text: string,
  maxQueueSize = 5
): ToastMessage[] {
  const newToast: ToastMessage = {
    id: `toast-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    text,
    timestamp: Date.now(),
  };
  
  // Add to end of queue (FIFO), limit queue size
  const newQueue = [...queue, newToast];
  if (newQueue.length > maxQueueSize) {
    return newQueue.slice(-maxQueueSize);
  }
  return newQueue;
}

/**
 * Pure function to remove a toast from the queue by id
 * Requirements: 4.2
 */
export function removeToast(queue: ToastMessage[], id: string): ToastMessage[] {
  return queue.filter((toast) => toast.id !== id);
}

/**
 * Pure function to check if a toast should be auto-dismissed based on timestamp
 * Requirements: 4.2
 */
export function shouldAutoDismiss(
  toast: ToastMessage,
  currentTime: number,
  autoDismissMs: number = DEFAULT_AUTO_DISMISS_MS
): boolean {
  return currentTime - toast.timestamp >= autoDismissMs;
}

/**
 * Pure function to get toasts that should be dismissed
 * Requirements: 4.2
 */
export function getExpiredToasts(
  queue: ToastMessage[],
  currentTime: number,
  autoDismissMs: number = DEFAULT_AUTO_DISMISS_MS
): ToastMessage[] {
  return queue.filter((toast) => shouldAutoDismiss(toast, currentTime, autoDismissMs));
}
