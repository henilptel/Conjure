/**
 * Unit tests for useUndoRedoKeyboard hook
 * Tests keyboard shortcuts for undo/redo functionality
 * 
 * **Validates: Requirements 1.1, 2.1**
 */

import { renderHook, act } from '@testing-library/react';
import { useUndoRedoKeyboard } from '@/lib/hooks';
import { useAppStore } from '@/lib/store';
import { DEFAULT_HISTORY_STATE } from '@/lib/types';

// Mock navigator.platform for testing Mac vs Windows
const originalPlatform = Object.getOwnPropertyDescriptor(navigator, 'platform');

// Helper to reset store before each test
const resetStore = () => {
  useAppStore.setState({
    activeTools: [],
    imageState: { hasImage: false, width: null, height: null },
    processingStatus: 'idle',
    isCompareMode: false,
    processingMessage: '',
    previewState: {
      isDragging: false,
      draggingToolId: null,
      previewTools: [],
    },
    history: { ...DEFAULT_HISTORY_STATE },
  });
};

// Helper to set up history with entries for undo/redo testing
const setupHistoryWithEntries = () => {
  resetStore();
  // Set image as loaded (required for keyboard shortcuts to work)
  useAppStore.setState({ imageState: { hasImage: true, width: 100, height: 100 } });
  
  // Create some history entries
  useAppStore.setState({ activeTools: [{ id: 'blur', label: 'Blur', value: 10, min: 0, max: 100 }] });
  useAppStore.getState().recordHistory();
  
  useAppStore.setState({ activeTools: [{ id: 'blur', label: 'Blur', value: 20, min: 0, max: 100 }] });
  useAppStore.getState().recordHistory();
  
  useAppStore.setState({ activeTools: [{ id: 'blur', label: 'Blur', value: 30, min: 0, max: 100 }] });
  useAppStore.getState().recordHistory();
};

// Helper to simulate keyboard events
const simulateKeyDown = (key: string, options: Partial<KeyboardEventInit> = {}) => {
  const event = new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
    ...options,
  });
  window.dispatchEvent(event);
  return event;
};

// Helper to set platform
const setPlatform = (platform: string) => {
  Object.defineProperty(navigator, 'platform', {
    value: platform,
    writable: true,
    configurable: true,
  });
};

describe('useUndoRedoKeyboard', () => {
  beforeEach(() => {
    resetStore();
    // Reset platform to default
    if (originalPlatform) {
      Object.defineProperty(navigator, 'platform', originalPlatform);
    }
  });

  afterEach(() => {
    // Restore original platform
    if (originalPlatform) {
      Object.defineProperty(navigator, 'platform', originalPlatform);
    }
  });

  describe('Ctrl+Z triggers undo (Windows/Linux)', () => {
    beforeEach(() => {
      setPlatform('Win32');
    });

    it('should trigger undo when Ctrl+Z is pressed', () => {
      setupHistoryWithEntries();
      
      const { activeTools: toolsBefore } = useAppStore.getState();
      expect(toolsBefore[0].value).toBe(30);
      
      renderHook(() => useUndoRedoKeyboard());
      
      act(() => {
        simulateKeyDown('z', { ctrlKey: true });
      });
      
      const { activeTools: toolsAfter } = useAppStore.getState();
      expect(toolsAfter[0].value).toBe(20);
    });

    it('should not trigger undo when only Z is pressed without Ctrl', () => {
      setupHistoryWithEntries();
      
      const { activeTools: toolsBefore } = useAppStore.getState();
      expect(toolsBefore[0].value).toBe(30);
      
      renderHook(() => useUndoRedoKeyboard());
      
      act(() => {
        simulateKeyDown('z', { ctrlKey: false });
      });
      
      const { activeTools: toolsAfter } = useAppStore.getState();
      expect(toolsAfter[0].value).toBe(30); // Unchanged
    });
  });

  describe('Ctrl+Shift+Z triggers redo (Windows/Linux)', () => {
    beforeEach(() => {
      setPlatform('Win32');
    });

    it('should trigger redo when Ctrl+Shift+Z is pressed after undo', () => {
      setupHistoryWithEntries();
      
      // First undo
      useAppStore.getState().undo();
      const { activeTools: toolsAfterUndo } = useAppStore.getState();
      expect(toolsAfterUndo[0].value).toBe(20);
      
      renderHook(() => useUndoRedoKeyboard());
      
      act(() => {
        simulateKeyDown('z', { ctrlKey: true, shiftKey: true });
      });
      
      const { activeTools: toolsAfterRedo } = useAppStore.getState();
      expect(toolsAfterRedo[0].value).toBe(30);
    });

    it('should not trigger redo when Ctrl+Z is pressed without Shift', () => {
      setupHistoryWithEntries();
      
      // First undo twice
      useAppStore.getState().undo();
      useAppStore.getState().undo();
      const { activeTools: toolsAfterUndo } = useAppStore.getState();
      expect(toolsAfterUndo[0].value).toBe(10);
      
      renderHook(() => useUndoRedoKeyboard());
      
      // Press Ctrl+Z (should undo, not redo)
      act(() => {
        simulateKeyDown('z', { ctrlKey: true, shiftKey: false });
      });
      
      // Should have undone to the beginning (no more undo available)
      const { activeTools: toolsAfter } = useAppStore.getState();
      expect(toolsAfter[0].value).toBe(10); // Still at 10 because pointer is at 0
    });
  });

  describe('Cmd+Z triggers undo (macOS)', () => {
    beforeEach(() => {
      setPlatform('MacIntel');
    });

    it('should trigger undo when Cmd+Z is pressed on Mac', () => {
      setupHistoryWithEntries();
      
      const { activeTools: toolsBefore } = useAppStore.getState();
      expect(toolsBefore[0].value).toBe(30);
      
      renderHook(() => useUndoRedoKeyboard());
      
      act(() => {
        simulateKeyDown('z', { metaKey: true });
      });
      
      const { activeTools: toolsAfter } = useAppStore.getState();
      expect(toolsAfter[0].value).toBe(20);
    });

    it('should not trigger undo when Ctrl+Z is pressed on Mac', () => {
      setupHistoryWithEntries();
      
      const { activeTools: toolsBefore } = useAppStore.getState();
      expect(toolsBefore[0].value).toBe(30);
      
      renderHook(() => useUndoRedoKeyboard());
      
      act(() => {
        simulateKeyDown('z', { ctrlKey: true, metaKey: false });
      });
      
      const { activeTools: toolsAfter } = useAppStore.getState();
      expect(toolsAfter[0].value).toBe(30); // Unchanged - Ctrl doesn't work on Mac
    });
  });

  describe('Cmd+Shift+Z triggers redo (macOS)', () => {
    beforeEach(() => {
      setPlatform('MacIntel');
    });

    it('should trigger redo when Cmd+Shift+Z is pressed on Mac', () => {
      setupHistoryWithEntries();
      
      // First undo
      useAppStore.getState().undo();
      const { activeTools: toolsAfterUndo } = useAppStore.getState();
      expect(toolsAfterUndo[0].value).toBe(20);
      
      renderHook(() => useUndoRedoKeyboard());
      
      act(() => {
        simulateKeyDown('z', { metaKey: true, shiftKey: true });
      });
      
      const { activeTools: toolsAfterRedo } = useAppStore.getState();
      expect(toolsAfterRedo[0].value).toBe(30);
    });
  });

  describe('Input focus prevention', () => {
    it('should not trigger undo when input is focused', () => {
      setupHistoryWithEntries();
      
      const { activeTools: toolsBefore } = useAppStore.getState();
      expect(toolsBefore[0].value).toBe(30);
      
      // Create and focus an input element
      const input = document.createElement('input');
      document.body.appendChild(input);
      input.focus();
      
      renderHook(() => useUndoRedoKeyboard());
      
      act(() => {
        simulateKeyDown('z', { ctrlKey: true });
      });
      
      const { activeTools: toolsAfter } = useAppStore.getState();
      expect(toolsAfter[0].value).toBe(30); // Unchanged
      
      // Cleanup
      document.body.removeChild(input);
    });

    it('should not trigger redo when textarea is focused', () => {
      setupHistoryWithEntries();
      
      // First undo
      useAppStore.getState().undo();
      const { activeTools: toolsAfterUndo } = useAppStore.getState();
      expect(toolsAfterUndo[0].value).toBe(20);
      
      // Create and focus a textarea element
      const textarea = document.createElement('textarea');
      document.body.appendChild(textarea);
      textarea.focus();
      
      renderHook(() => useUndoRedoKeyboard());
      
      act(() => {
        simulateKeyDown('z', { ctrlKey: true, shiftKey: true });
      });
      
      const { activeTools: toolsAfter } = useAppStore.getState();
      expect(toolsAfter[0].value).toBe(20); // Unchanged
      
      // Cleanup
      document.body.removeChild(textarea);
    });

    it('should not trigger undo when contenteditable is focused', () => {
      setupHistoryWithEntries();
      
      const { activeTools: toolsBefore } = useAppStore.getState();
      expect(toolsBefore[0].value).toBe(30);
      
      // Create and focus a contenteditable element
      const div = document.createElement('div');
      div.setAttribute('contenteditable', 'true');
      document.body.appendChild(div);
      div.focus();
      
      renderHook(() => useUndoRedoKeyboard());
      
      act(() => {
        simulateKeyDown('z', { ctrlKey: true });
      });
      
      const { activeTools: toolsAfter } = useAppStore.getState();
      expect(toolsAfter[0].value).toBe(30); // Unchanged
      
      // Cleanup
      document.body.removeChild(div);
    });
  });

  describe('Image loaded requirement', () => {
    it('should not trigger undo when no image is loaded', () => {
      setupHistoryWithEntries();
      
      // Set image as not loaded
      useAppStore.setState({ imageState: { hasImage: false, width: null, height: null } });
      
      const { activeTools: toolsBefore } = useAppStore.getState();
      expect(toolsBefore[0].value).toBe(30);
      
      renderHook(() => useUndoRedoKeyboard());
      
      act(() => {
        simulateKeyDown('z', { ctrlKey: true });
      });
      
      const { activeTools: toolsAfter } = useAppStore.getState();
      expect(toolsAfter[0].value).toBe(30); // Unchanged
    });

    it('should not trigger redo when no image is loaded', () => {
      setupHistoryWithEntries();
      
      // First undo
      useAppStore.getState().undo();
      
      // Set image as not loaded
      useAppStore.setState({ imageState: { hasImage: false, width: null, height: null } });
      
      const { activeTools: toolsAfterUndo } = useAppStore.getState();
      expect(toolsAfterUndo[0].value).toBe(20);
      
      renderHook(() => useUndoRedoKeyboard());
      
      act(() => {
        simulateKeyDown('z', { ctrlKey: true, shiftKey: true });
      });
      
      const { activeTools: toolsAfter } = useAppStore.getState();
      expect(toolsAfter[0].value).toBe(20); // Unchanged
    });
  });

  describe('Boundary conditions', () => {
    it('should not error when undo is called with no history', () => {
      resetStore();
      useAppStore.setState({ imageState: { hasImage: true, width: 100, height: 100 } });
      
      renderHook(() => useUndoRedoKeyboard());
      
      // Should not throw
      act(() => {
        simulateKeyDown('z', { ctrlKey: true });
      });
      
      expect(useAppStore.getState().canUndo()).toBe(false);
    });

    it('should not error when redo is called with no future history', () => {
      setupHistoryWithEntries();
      
      renderHook(() => useUndoRedoKeyboard());
      
      // Should not throw
      act(() => {
        simulateKeyDown('z', { ctrlKey: true, shiftKey: true });
      });
      
      expect(useAppStore.getState().canRedo()).toBe(false);
    });
  });
});
