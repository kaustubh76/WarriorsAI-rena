'use client';

/**
 * Keyboard Hooks
 * Hooks for handling keyboard events and shortcuts
 */

import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * Common key codes for reference
 */
export const Keys = {
  // Modifiers
  Shift: 'Shift',
  Control: 'Control',
  Alt: 'Alt',
  Meta: 'Meta',

  // Navigation
  ArrowUp: 'ArrowUp',
  ArrowDown: 'ArrowDown',
  ArrowLeft: 'ArrowLeft',
  ArrowRight: 'ArrowRight',
  Home: 'Home',
  End: 'End',
  PageUp: 'PageUp',
  PageDown: 'PageDown',

  // Actions
  Enter: 'Enter',
  Escape: 'Escape',
  Tab: 'Tab',
  Space: ' ',
  Backspace: 'Backspace',
  Delete: 'Delete',

  // Letters (for shortcuts)
  A: 'a',
  B: 'b',
  C: 'c',
  D: 'd',
  E: 'e',
  F: 'f',
  G: 'g',
  H: 'h',
  I: 'i',
  J: 'j',
  K: 'k',
  L: 'l',
  M: 'm',
  N: 'n',
  O: 'o',
  P: 'p',
  Q: 'q',
  R: 'r',
  S: 's',
  T: 't',
  U: 'u',
  V: 'v',
  W: 'w',
  X: 'x',
  Y: 'y',
  Z: 'z',

  // Numbers
  Num0: '0',
  Num1: '1',
  Num2: '2',
  Num3: '3',
  Num4: '4',
  Num5: '5',
  Num6: '6',
  Num7: '7',
  Num8: '8',
  Num9: '9',

  // Function keys
  F1: 'F1',
  F2: 'F2',
  F3: 'F3',
  F4: 'F4',
  F5: 'F5',
  F6: 'F6',
  F7: 'F7',
  F8: 'F8',
  F9: 'F9',
  F10: 'F10',
  F11: 'F11',
  F12: 'F12',
} as const;

export type KeyCode = (typeof Keys)[keyof typeof Keys] | string;

/**
 * Hook for detecting if a specific key is pressed
 *
 * @example
 * const isShiftPressed = useKeyPress('Shift');
 * const isEnterPressed = useKeyPress('Enter');
 *
 * // With callback
 * useKeyPress('Escape', () => closeModal());
 */
export function useKeyPress(
  targetKey: KeyCode,
  callback?: (event: KeyboardEvent) => void,
  options?: {
    preventDefault?: boolean;
    stopPropagation?: boolean;
    target?: 'window' | 'document' | React.RefObject<HTMLElement>;
  }
): boolean {
  const [isPressed, setIsPressed] = useState(false);
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  const { preventDefault = false, stopPropagation = false, target = 'window' } = options || {};

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === targetKey) {
        if (preventDefault) event.preventDefault();
        if (stopPropagation) event.stopPropagation();
        setIsPressed(true);
        callbackRef.current?.(event);
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.key === targetKey) {
        setIsPressed(false);
      }
    };

    let targetElement: Window | Document | HTMLElement | null = null;

    if (target === 'window') {
      targetElement = window;
    } else if (target === 'document') {
      targetElement = document;
    } else if (target && 'current' in target) {
      targetElement = target.current;
    }

    if (!targetElement) return;

    targetElement.addEventListener('keydown', handleKeyDown as EventListener);
    targetElement.addEventListener('keyup', handleKeyUp as EventListener);

    return () => {
      targetElement?.removeEventListener('keydown', handleKeyDown as EventListener);
      targetElement?.removeEventListener('keyup', handleKeyUp as EventListener);
    };
  }, [targetKey, preventDefault, stopPropagation, target]);

  return isPressed;
}

/**
 * Shortcut definition for keyboard shortcuts
 */
export interface KeyboardShortcut {
  key: KeyCode;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  meta?: boolean;
  callback: (event: KeyboardEvent) => void;
  description?: string;
  preventDefault?: boolean;
  enabled?: boolean;
}

/**
 * Hook for handling keyboard shortcuts
 *
 * @example
 * useKeyboardShortcuts([
 *   { key: 's', ctrl: true, callback: handleSave, description: 'Save' },
 *   { key: 'z', ctrl: true, callback: handleUndo, description: 'Undo' },
 *   { key: 'z', ctrl: true, shift: true, callback: handleRedo, description: 'Redo' },
 *   { key: 'Escape', callback: handleClose },
 * ]);
 */
export function useKeyboardShortcuts(
  shortcuts: KeyboardShortcut[],
  options?: {
    enabled?: boolean;
    ignoreInputs?: boolean;
  }
): void {
  const { enabled = true, ignoreInputs = true } = options || {};
  const shortcutsRef = useRef(shortcuts);
  shortcutsRef.current = shortcuts;

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      // Ignore if typing in an input, textarea, or contenteditable
      if (ignoreInputs) {
        const target = event.target as HTMLElement;
        if (
          target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable
        ) {
          return;
        }
      }

      for (const shortcut of shortcutsRef.current) {
        if (shortcut.enabled === false) continue;

        const keyMatch =
          event.key.toLowerCase() === shortcut.key.toLowerCase() ||
          event.key === shortcut.key;

        const ctrlMatch = shortcut.ctrl ? event.ctrlKey || event.metaKey : !event.ctrlKey;
        const shiftMatch = shortcut.shift ? event.shiftKey : !event.shiftKey;
        const altMatch = shortcut.alt ? event.altKey : !event.altKey;
        const metaMatch = shortcut.meta ? event.metaKey : true; // Don't require no-meta

        if (keyMatch && ctrlMatch && shiftMatch && altMatch && metaMatch) {
          if (shortcut.preventDefault !== false) {
            event.preventDefault();
          }
          shortcut.callback(event);
          return;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [enabled, ignoreInputs]);
}

/**
 * Hook for creating a keyboard shortcut string
 *
 * @example
 * const shortcutStr = useShortcutString({ ctrl: true, key: 's' });
 * // "⌘S" on Mac, "Ctrl+S" on Windows
 */
export function useShortcutString(shortcut: {
  key: KeyCode;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  meta?: boolean;
}): string {
  const [isMac, setIsMac] = useState(false);

  useEffect(() => {
    setIsMac(navigator.platform.toLowerCase().includes('mac'));
  }, []);

  const parts: string[] = [];

  if (shortcut.ctrl || shortcut.meta) {
    parts.push(isMac ? '⌘' : 'Ctrl');
  }
  if (shortcut.alt) {
    parts.push(isMac ? '⌥' : 'Alt');
  }
  if (shortcut.shift) {
    parts.push(isMac ? '⇧' : 'Shift');
  }

  // Capitalize single letter keys
  const key =
    shortcut.key.length === 1
      ? shortcut.key.toUpperCase()
      : shortcut.key === ' '
        ? 'Space'
        : shortcut.key;

  parts.push(key);

  return isMac ? parts.join('') : parts.join('+');
}

/**
 * Hook for handling arrow key navigation in lists
 *
 * @example
 * const { selectedIndex, handlers } = useArrowNavigation({
 *   itemCount: items.length,
 *   onSelect: (index) => handleSelect(items[index]),
 * });
 *
 * <ul {...handlers}>
 *   {items.map((item, i) => (
 *     <li key={i} data-selected={i === selectedIndex}>{item}</li>
 *   ))}
 * </ul>
 */
export function useArrowNavigation(options: {
  itemCount: number;
  initialIndex?: number;
  onSelect?: (index: number) => void;
  onHighlight?: (index: number) => void;
  loop?: boolean;
  horizontal?: boolean;
  enabled?: boolean;
}): {
  selectedIndex: number;
  setSelectedIndex: (index: number) => void;
  handlers: {
    onKeyDown: (event: React.KeyboardEvent) => void;
  };
} {
  const {
    itemCount,
    initialIndex = 0,
    onSelect,
    onHighlight,
    loop = true,
    horizontal = false,
    enabled = true,
  } = options;

  const [selectedIndex, setSelectedIndex] = useState(initialIndex);

  const upKey = horizontal ? 'ArrowLeft' : 'ArrowUp';
  const downKey = horizontal ? 'ArrowRight' : 'ArrowDown';

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (!enabled || itemCount === 0) return;

      if (event.key === upKey) {
        event.preventDefault();
        setSelectedIndex((prev) => {
          const next = prev - 1;
          if (next < 0) {
            return loop ? itemCount - 1 : 0;
          }
          return next;
        });
      } else if (event.key === downKey) {
        event.preventDefault();
        setSelectedIndex((prev) => {
          const next = prev + 1;
          if (next >= itemCount) {
            return loop ? 0 : itemCount - 1;
          }
          return next;
        });
      } else if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        onSelect?.(selectedIndex);
      } else if (event.key === 'Home') {
        event.preventDefault();
        setSelectedIndex(0);
      } else if (event.key === 'End') {
        event.preventDefault();
        setSelectedIndex(itemCount - 1);
      }
    },
    [enabled, itemCount, loop, horizontal, selectedIndex, onSelect, upKey, downKey]
  );

  useEffect(() => {
    onHighlight?.(selectedIndex);
  }, [selectedIndex, onHighlight]);

  // Reset index if itemCount changes and current index is out of bounds
  useEffect(() => {
    if (selectedIndex >= itemCount) {
      setSelectedIndex(Math.max(0, itemCount - 1));
    }
  }, [itemCount, selectedIndex]);

  return {
    selectedIndex,
    setSelectedIndex,
    handlers: {
      onKeyDown: handleKeyDown,
    },
  };
}

/**
 * Hook for detecting key combo sequences (e.g., Konami code)
 *
 * @example
 * useKeySequence(['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown'], () => {
 *   enableEasterEgg();
 * });
 */
export function useKeySequence(
  sequence: KeyCode[],
  callback: () => void,
  options?: {
    timeout?: number;
    enabled?: boolean;
  }
): void {
  const { timeout = 2000, enabled = true } = options || {};
  const progressRef = useRef(0);
  const lastKeyTimeRef = useRef(0);
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    if (!enabled || sequence.length === 0) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      const now = Date.now();

      // Reset if too much time has passed
      if (now - lastKeyTimeRef.current > timeout) {
        progressRef.current = 0;
      }
      lastKeyTimeRef.current = now;

      // Check if the pressed key matches the next in sequence
      const expectedKey = sequence[progressRef.current];
      if (event.key === expectedKey) {
        progressRef.current++;

        // Check if sequence is complete
        if (progressRef.current === sequence.length) {
          progressRef.current = 0;
          callbackRef.current();
        }
      } else {
        // Reset if wrong key pressed
        progressRef.current = event.key === sequence[0] ? 1 : 0;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [sequence, timeout, enabled]);
}

/**
 * Hook for handling text input with debouncing
 *
 * @example
 * const { value, onChange, isTyping } = useTypingDetection({
 *   onFinishTyping: (text) => search(text),
 *   debounce: 300,
 * });
 *
 * <input value={value} onChange={onChange} />
 */
export function useTypingDetection(options?: {
  initialValue?: string;
  onFinishTyping?: (value: string) => void;
  debounce?: number;
}): {
  value: string;
  setValue: (value: string) => void;
  onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  isTyping: boolean;
  clear: () => void;
} {
  const { initialValue = '', onFinishTyping, debounce = 300 } = options || {};

  const [value, setValue] = useState(initialValue);
  const [isTyping, setIsTyping] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const callbackRef = useRef(onFinishTyping);
  callbackRef.current = onFinishTyping;

  const onChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const newValue = event.target.value;
      setValue(newValue);
      setIsTyping(true);

      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      timeoutRef.current = setTimeout(() => {
        setIsTyping(false);
        callbackRef.current?.(newValue);
      }, debounce);
    },
    [debounce]
  );

  const clear = useCallback(() => {
    setValue('');
    setIsTyping(false);
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return { value, setValue, onChange, isTyping, clear };
}

export default useKeyPress;
