'use client';

/**
 * Copy to Clipboard Hook
 * Hook for copying text to clipboard with feedback
 */

import { useState, useCallback, useRef, useEffect } from 'react';

export interface UseCopyToClipboardOptions {
  /** Duration to show success state in ms (default: 2000) */
  successDuration?: number;
  /** Callback when copy succeeds */
  onSuccess?: (text: string) => void;
  /** Callback when copy fails */
  onError?: (error: Error) => void;
}

export interface UseCopyToClipboardResult {
  /** Copy text to clipboard */
  copy: (text: string) => Promise<boolean>;
  /** Whether text was recently copied successfully */
  copied: boolean;
  /** Error if copy failed */
  error: Error | null;
  /** Reset copied state */
  reset: () => void;
}

/**
 * Hook for copying text to clipboard
 *
 * @example
 * function CopyButton({ text }) {
 *   const { copy, copied } = useCopyToClipboard();
 *
 *   return (
 *     <button onClick={() => copy(text)}>
 *       {copied ? 'Copied!' : 'Copy'}
 *     </button>
 *   );
 * }
 */
export function useCopyToClipboard(
  options: UseCopyToClipboardOptions = {}
): UseCopyToClipboardResult {
  const { successDuration = 2000, onSuccess, onError } = options;

  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const copy = useCallback(
    async (text: string): Promise<boolean> => {
      // Clear any existing timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      try {
        // Modern clipboard API
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(text);
        } else {
          // Fallback for older browsers
          const textArea = document.createElement('textarea');
          textArea.value = text;
          textArea.style.position = 'fixed';
          textArea.style.left = '-999999px';
          textArea.style.top = '-999999px';
          document.body.appendChild(textArea);
          textArea.focus();
          textArea.select();

          const successful = document.execCommand('copy');
          document.body.removeChild(textArea);

          if (!successful) {
            throw new Error('Copy command failed');
          }
        }

        setCopied(true);
        setError(null);
        onSuccess?.(text);

        // Reset copied state after duration
        timeoutRef.current = setTimeout(() => {
          setCopied(false);
        }, successDuration);

        return true;
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Failed to copy');
        setError(error);
        setCopied(false);
        onError?.(error);
        return false;
      }
    },
    [successDuration, onSuccess, onError]
  );

  const reset = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    setCopied(false);
    setError(null);
  }, []);

  return { copy, copied, error, reset };
}

/**
 * Hook for copying with formatted feedback text
 *
 * @example
 * function AddressDisplay({ address }) {
 *   const { copy, copied, copyText } = useCopyWithFeedback({
 *     format: (text) => `${text.slice(0, 6)}...${text.slice(-4)}`,
 *   });
 *
 *   return (
 *     <button onClick={() => copy(address)}>
 *       {copied ? 'Copied!' : copyText || 'Copy Address'}
 *     </button>
 *   );
 * }
 */
export function useCopyWithFeedback(options: {
  format?: (text: string) => string;
  successDuration?: number;
}): {
  copy: (text: string) => Promise<boolean>;
  copied: boolean;
  copyText: string | null;
  error: Error | null;
} {
  const { format, successDuration = 2000 } = options;
  const [copyText, setCopyText] = useState<string | null>(null);

  const result = useCopyToClipboard({
    successDuration,
    onSuccess: (text) => {
      setCopyText(format ? format(text) : text);
    },
  });

  return {
    ...result,
    copyText: result.copied ? copyText : null,
  };
}

/**
 * Utility function for copying to clipboard (non-hook version)
 *
 * @example
 * await copyToClipboard('0x1234...');
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }

    // Fallback
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    document.body.appendChild(textArea);
    textArea.select();
    const successful = document.execCommand('copy');
    document.body.removeChild(textArea);
    return successful;
  } catch {
    return false;
  }
}

export default useCopyToClipboard;
