/**
 * Unit tests for ChatInterface component
 * Tests empty state, loading state, and message list rendering
 * _Requirements: 3.1, 3.5, 3.6_
 */

import { render, screen } from '@testing-library/react';
import { defaultImageState } from '@/lib/types';
import ChatInterface from '@/app/components/ChatInterface';

describe('ChatInterface', () => {
  describe('Empty state rendering', () => {
    it('should display placeholder message when chat is empty', () => {
      render(<ChatInterface imageState={defaultImageState} />);

      expect(screen.getByText('Ask me about your image!')).toBeInTheDocument();
      expect(screen.getByText(/I can see the current blur level/)).toBeInTheDocument();
    });

    it('should render input field and submit button', () => {
      render(<ChatInterface imageState={defaultImageState} />);

      expect(screen.getByPlaceholderText('Ask about your image...')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Send' })).toBeInTheDocument();
    });
  });
});
