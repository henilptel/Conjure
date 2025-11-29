/**
 * Property-based tests for Slider component
 * **Feature: blur-slider-controls**
 */

import * as fc from 'fast-check';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import Slider, { SliderProps } from '@/app/components/ui/Slider';

// Ensure cleanup after each test
afterEach(() => {
  cleanup();
});

/**
 * Arbitrary for generating valid SliderProps where min < max and min <= value <= max
 * Labels are alphanumeric to avoid regex escaping issues in tests
 */
const validSliderPropsArb = fc.record({
  min: fc.integer({ min: 0, max: 50 }),
  max: fc.integer({ min: 51, max: 100 }),
  label: fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9 ]{0,19}$/).filter(s => s.trim().length > 0),
}).chain(({ min, max, label }) =>
  fc.record({
    min: fc.constant(min),
    max: fc.constant(max),
    value: fc.integer({ min, max }),
    label: fc.constant(label),
    onChange: fc.constant(jest.fn()),
  })
);

describe('Property 2: Slider Component Renders Correctly', () => {
  /**
   * **Feature: blur-slider-controls, Property 2: Slider Component Renders Correctly**
   * 
   * For any valid SliderProps (min < max, min <= value <= max), the rendered Slider 
   * SHALL display a range input with the correct min, max, value attributes and the provided label text.
   * **Validates: Requirements 2.1, 2.2**
   */
  it('should render range input with correct min, max, value attributes and display label', () => {
    fc.assert(
      fc.property(validSliderPropsArb, (props) => {
        cleanup(); // Ensure clean state before each iteration
        const { unmount } = render(<Slider {...props} />);
        
        const input = screen.getByRole('slider');
        
        // Verify range input attributes
        expect(input).toHaveAttribute('type', 'range');
        expect(input).toHaveAttribute('min', String(props.min));
        expect(input).toHaveAttribute('max', String(props.max));
        expect(input).toHaveAttribute('value', String(props.value));
        
        // Verify label displays label text and current value
        const labelElement = screen.getByText((content, element) => {
          if (element?.tagName !== 'LABEL') return false;
          const text = element.textContent || '';
          return text.includes(props.label) && text.includes(String(props.value));
        });
        expect(labelElement).toBeInTheDocument();
        
        unmount();
      }),
      { numRuns: 100 }
    );
  });
});

describe('Property 3: Slider Disabled State', () => {
  /**
   * **Feature: blur-slider-controls, Property 3: Slider Disabled State**
   * 
   * For any Slider with disabled=true, the rendered range input SHALL have the disabled attribute set.
   * **Validates: Requirements 2.4**
   */
  it('should have disabled attribute when disabled prop is true', () => {
    fc.assert(
      fc.property(validSliderPropsArb, fc.boolean(), (props, disabled) => {
        cleanup(); // Ensure clean state before each iteration
        const { unmount } = render(<Slider {...props} disabled={disabled} />);
        
        const input = screen.getByRole('slider');
        
        if (disabled) {
          expect(input).toBeDisabled();
        } else {
          expect(input).not.toBeDisabled();
        }
        
        unmount();
      }),
      { numRuns: 100 }
    );
  });
});

describe('Property 4: Slider onChange Callback', () => {
  /**
   * **Feature: blur-slider-controls, Property 4: Slider onChange Callback**
   * 
   * For any Slider component, when a change event occurs with a new value, 
   * the onChange callback SHALL be invoked with that exact value.
   * **Validates: Requirements 2.3, 3.2**
   */
  it('should invoke onChange callback with the exact numeric value when slider changes', () => {
    // Test with specific values to ensure numeric conversion
    const testValuesArb = fc.integer({ min: 0, max: 100 });
    
    fc.assert(
      fc.property(testValuesArb, (newValue) => {
        cleanup(); // Ensure clean state before each iteration
        const mockOnChange = jest.fn();
        const { unmount } = render(
          <Slider 
            min={0} 
            max={100} 
            value={50} 
            label="Test" 
            onChange={mockOnChange} 
          />
        );
        
        const input = screen.getByRole('slider');
        fireEvent.change(input, { target: { value: String(newValue) } });
        
        // Verify onChange was called with a number, not a string
        expect(mockOnChange).toHaveBeenCalledWith(newValue);
        expect(typeof mockOnChange.mock.calls[0][0]).toBe('number');
        
        unmount();
      }),
      { numRuns: 100 }
    );
  });
});
