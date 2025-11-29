/**
 * Unit tests for ChatInterface component
 * Tests empty state, loading state, and message list rendering
 * _Requirements: 3.1, 3.5, 3.6_
 */

import { render, screen } from '@testing-library/react';
import { defaultImageState } from '@/lib/types';

// Mock the ai/react module before importing the component
jest.mock('ai/react', () => ({
  useChat: jest.fn(),
}));

import ChatInterface from '@/app/components/ChatInterface';
import { useChat } from 'ai/react';

const mockUseChat = useChat as jest.Mock;

describe('ChatInterface', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Empty state rendering', () => {
    it('should display placeholder message when chat is empty', () => {
      mockUseChat.mockReturnValue({
        messages: [],
        input: '',
        handleInputChange: jest.fn(),
        handleSubmit: jest.fn(),
        isLoading: false,
      });

      render(<ChatInterface imageState={defaultImageState} />);

      expect(screen.getByText('Ask me about your image!')).toBeInTheDocument();
      expect(screen.getByText(/I can see the current blur level/)).toBeInTheDocument();
    });

    it('should render input field and submit button', () => {
      mockUseChat.mockReturnValue({
        messages: [],
        input: '',
        handleInputChange: jest.fn(),
        handleSubmit: jest.fn(),
        isLoading: false,
      });

      render(<ChatInterface imageState={defaultImageState} />);

      expect(screen.getByPlaceholderText('Ask about your image...')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Send' })).toBeInTheDocument();
    });
  });

  describe('Loading state rendering', () => {
    it('should display loading indicator when AI is generating response', () => {
      mockUseChat.mockReturnValue({
        messages: [{ id: '1', role: 'user', content: 'What is the blur?' }],
        input: '',
        handleInputChange: jest.fn(),
        handleSubmit: jest.fn(),
        isLoading: true,
      });

      render(<ChatInterface imageState={defaultImageState} />);

      expect(screen.getByText('Thinking...')).toBeInTheDocument();
    });

    it('should disable input field when loading', () => {
      mockUseChat.mockReturnValue({
        messages: [],
        input: '',
        handleInputChange: jest.fn(),
        handleSubmit: jest.fn(),
        isLoading: true,
      });

      render(<ChatInterface imageState={defaultImageState} />);

      expect(screen.getByPlaceholderText('Ask about your image...')).toBeDisabled();
    });
  });

  describe('Message list rendering', () => {
    it('should render user and assistant messages', () => {
      mockUseChat.mockReturnValue({
        messages: [
          { id: '1', role: 'user', content: 'What is the blur level?' },
          { id: '2', role: 'assistant', content: 'The blur level is 5.' },
        ],
        input: '',
        handleInputChange: jest.fn(),
        handleSubmit: jest.fn(),
        isLoading: false,
      });

      render(<ChatInterface imageState={defaultImageState} />);

      expect(screen.getByText('What is the blur level?')).toBeInTheDocument();
      expect(screen.getByText('The blur level is 5.')).toBeInTheDocument();
    });

    it('should not show placeholder when messages exist', () => {
      mockUseChat.mockReturnValue({
        messages: [{ id: '1', role: 'user', content: 'Hello' }],
        input: '',
        handleInputChange: jest.fn(),
        handleSubmit: jest.fn(),
        isLoading: false,
      });

      render(<ChatInterface imageState={defaultImageState} />);

      expect(screen.queryByText('Ask me about your image!')).not.toBeInTheDocument();
    });
  });
});
