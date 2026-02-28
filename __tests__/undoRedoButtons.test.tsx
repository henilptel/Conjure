/**
 * Unit tests for UndoRedoButtons Component
 * **Feature: undo-redo**
 * 
 * Tests button disabled states, click handlers, and processing state behavior.
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5
 */

import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import UndoRedoButtons from '@/app/components/dock/UndoRedoButtons';
import { useAppStore } from '@/lib/store';
import { DEFAULT_HISTORY_STATE } from '@/lib/types';

// Reset store after each test
afterEach(() => {
  cleanup();
  useAppStore.setState({
    activeTools: [],
    history: { ...DEFAULT_HISTORY_STATE },
    processingStatus: 'idle',
  });
});

describe('UndoRedoButtons Component', () => {
  describe('Button disabled states based on canUndo/canRedo', () => {
    /**
     * Test undo button disabled when no history (Requirements: 4.2)
     */
    it('should disable undo button when canUndo returns false', () => {
      // Empty history - canUndo should return false
      useAppStore.setState({
        history: {
          entries: [],
          pointer: -1,
          maxSize: 50,
        },
      });

      render(<UndoRedoButtons />);

      const undoButton = screen.getByTestId('undo-button');
      expect(undoButton).toBeDisabled();
    });

    /**
     * Test undo button enabled when history exists (Requirements: 4.1)
     */
    it('should enable undo button when canUndo returns true', () => {
      // History with 2 entries, pointer at 1 - canUndo should return true
      useAppStore.setState({
        history: {
          entries: [
            { activeTools: [], timestamp: 1 },
            { activeTools: [], timestamp: 2 },
          ],
          pointer: 1,
          maxSize: 50,
        },
      });

      render(<UndoRedoButtons />);

      const undoButton = screen.getByTestId('undo-button');
      expect(undoButton).not.toBeDisabled();
    });

    /**
     * Test redo button disabled when at end of history (Requirements: 4.4)
     */
    it('should disable redo button when canRedo returns false', () => {
      // History with pointer at last entry - canRedo should return false
      useAppStore.setState({
        history: {
          entries: [
            { activeTools: [], timestamp: 1 },
            { activeTools: [], timestamp: 2 },
          ],
          pointer: 1, // At the end
          maxSize: 50,
        },
      });

      render(<UndoRedoButtons />);

      const redoButton = screen.getByTestId('redo-button');
      expect(redoButton).toBeDisabled();
    });

    /**
     * Test redo button enabled when future entries exist (Requirements: 4.3)
     */
    it('should enable redo button when canRedo returns true', () => {
      // History with pointer not at end - canRedo should return true
      useAppStore.setState({
        history: {
          entries: [
            { activeTools: [], timestamp: 1 },
            { activeTools: [], timestamp: 2 },
            { activeTools: [], timestamp: 3 },
          ],
          pointer: 1, // Not at the end
          maxSize: 50,
        },
      });

      render(<UndoRedoButtons />);

      const redoButton = screen.getByTestId('redo-button');
      expect(redoButton).not.toBeDisabled();
    });
  });

  describe('Click handlers trigger undo/redo actions', () => {
    /**
     * Test undo button click triggers undo action (Requirements: 1.2)
     */
    it('should call undo when undo button is clicked', () => {
      const initialTools = [{ id: 'blur', label: 'Blur', value: 5, min: 0, max: 100 }];
      
      // Set up history with 2 entries
      useAppStore.setState({
        activeTools: initialTools,
        history: {
          entries: [
            { activeTools: [], timestamp: 1 },
            { activeTools: initialTools, timestamp: 2 },
          ],
          pointer: 1,
          maxSize: 50,
        },
      });

      render(<UndoRedoButtons />);

      const undoButton = screen.getByTestId('undo-button');
      fireEvent.click(undoButton);

      // After undo, activeTools should be restored to previous state (empty)
      const state = useAppStore.getState();
      expect(state.activeTools).toEqual([]);
      expect(state.history.pointer).toBe(0);
    });

    /**
     * Test redo button click triggers redo action (Requirements: 2.2)
     */
    it('should call redo when redo button is clicked', () => {
      const futureTools = [{ id: 'blur', label: 'Blur', value: 5, min: 0, max: 100 }];
      
      // Set up history with pointer not at end
      useAppStore.setState({
        activeTools: [],
        history: {
          entries: [
            { activeTools: [], timestamp: 1 },
            { activeTools: futureTools, timestamp: 2 },
          ],
          pointer: 0, // Not at end, can redo
          maxSize: 50,
        },
      });

      render(<UndoRedoButtons />);

      const redoButton = screen.getByTestId('redo-button');
      fireEvent.click(redoButton);

      // After redo, activeTools should be restored to next state
      const state = useAppStore.getState();
      expect(state.activeTools).toEqual(futureTools);
      expect(state.history.pointer).toBe(1);
    });
  });

  describe('Disabled during processing', () => {
    /**
     * Test buttons disabled during processing status (Requirements: 4.5)
     */
    it('should disable both buttons when processingStatus is processing', () => {
      // Set up history that would normally allow undo/redo
      useAppStore.setState({
        history: {
          entries: [
            { activeTools: [], timestamp: 1 },
            { activeTools: [], timestamp: 2 },
            { activeTools: [], timestamp: 3 },
          ],
          pointer: 1, // Can both undo and redo
          maxSize: 50,
        },
        processingStatus: 'processing',
      });

      render(<UndoRedoButtons />);

      const undoButton = screen.getByTestId('undo-button');
      const redoButton = screen.getByTestId('redo-button');

      expect(undoButton).toBeDisabled();
      expect(redoButton).toBeDisabled();
    });

    /**
     * Test buttons disabled during initializing status (Requirements: 4.5)
     */
    it('should disable both buttons when processingStatus is initializing', () => {
      useAppStore.setState({
        history: {
          entries: [
            { activeTools: [], timestamp: 1 },
            { activeTools: [], timestamp: 2 },
            { activeTools: [], timestamp: 3 },
          ],
          pointer: 1,
          maxSize: 50,
        },
        processingStatus: 'initializing',
      });

      render(<UndoRedoButtons />);

      const undoButton = screen.getByTestId('undo-button');
      const redoButton = screen.getByTestId('redo-button');

      expect(undoButton).toBeDisabled();
      expect(redoButton).toBeDisabled();
    });

    /**
     * Test buttons enabled when processingStatus is idle (Requirements: 4.5)
     */
    it('should enable buttons when processingStatus is idle and history allows', () => {
      useAppStore.setState({
        history: {
          entries: [
            { activeTools: [], timestamp: 1 },
            { activeTools: [], timestamp: 2 },
            { activeTools: [], timestamp: 3 },
          ],
          pointer: 1,
          maxSize: 50,
        },
        processingStatus: 'idle',
      });

      render(<UndoRedoButtons />);

      const undoButton = screen.getByTestId('undo-button');
      const redoButton = screen.getByTestId('redo-button');

      expect(undoButton).not.toBeDisabled();
      expect(redoButton).not.toBeDisabled();
    });
  });

  describe('Disabled prop', () => {
    /**
     * Test disabled prop disables both buttons
     */
    it('should disable both buttons when disabled prop is true', () => {
      useAppStore.setState({
        history: {
          entries: [
            { activeTools: [], timestamp: 1 },
            { activeTools: [], timestamp: 2 },
            { activeTools: [], timestamp: 3 },
          ],
          pointer: 1,
          maxSize: 50,
        },
        processingStatus: 'idle',
      });

      render(<UndoRedoButtons disabled={true} />);

      const undoButton = screen.getByTestId('undo-button');
      const redoButton = screen.getByTestId('redo-button');

      expect(undoButton).toBeDisabled();
      expect(redoButton).toBeDisabled();
    });
  });

  describe('Accessibility', () => {
    /**
     * Test aria labels are present
     */
    it('should have proper aria labels', () => {
      render(<UndoRedoButtons />);

      const undoButton = screen.getByLabelText('Undo');
      const redoButton = screen.getByLabelText('Redo');
      const buttonGroup = screen.getByRole('group', { name: 'Undo and redo controls' });

      expect(undoButton).toBeInTheDocument();
      expect(redoButton).toBeInTheDocument();
      expect(buttonGroup).toBeInTheDocument();
    });
  });
});
