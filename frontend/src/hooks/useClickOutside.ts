'use client';

/**
 * Click Outside Hook
 * Detects clicks outside of a referenced element
 */

import { useEffect, useRef, RefObject } from 'react';

/**
 * Hook to detect clicks outside of a referenced element
 *
 * @example
 * function Dropdown() {
 *   const [isOpen, setIsOpen] = useState(false);
 *   const dropdownRef = useClickOutside<HTMLDivElement>(() => {
 *     setIsOpen(false);
 *   });
 *
 *   return (
 *     <div ref={dropdownRef}>
 *       {isOpen && <DropdownMenu />}
 *     </div>
 *   );
 * }
 */
export function useClickOutside<T extends HTMLElement>(
  handler: (event: MouseEvent | TouchEvent) => void,
  enabled: boolean = true
): RefObject<T> {
  const ref = useRef<T>(null);

  useEffect(() => {
    if (!enabled) return;

    const listener = (event: MouseEvent | TouchEvent) => {
      const el = ref.current;

      // Do nothing if clicking ref's element or descendent elements
      if (!el || el.contains(event.target as Node)) {
        return;
      }

      handler(event);
    };

    document.addEventListener('mousedown', listener);
    document.addEventListener('touchstart', listener);

    return () => {
      document.removeEventListener('mousedown', listener);
      document.removeEventListener('touchstart', listener);
    };
  }, [handler, enabled]);

  return ref;
}

/**
 * Hook to detect clicks outside of multiple elements
 *
 * @example
 * function Modal() {
 *   const [refs, handleClickOutside] = useClickOutsideMultiple(() => {
 *     closeModal();
 *   });
 *
 *   return (
 *     <>
 *       <div ref={refs[0]}>Modal Content</div>
 *       <div ref={refs[1]}>Tooltip</div>
 *     </>
 *   );
 * }
 */
export function useClickOutsideMultiple<T extends HTMLElement>(
  handler: (event: MouseEvent | TouchEvent) => void,
  count: number = 2,
  enabled: boolean = true
): RefObject<T>[] {
  const refs = useRef<RefObject<T>[]>(
    Array.from({ length: count }, () => ({ current: null }))
  ).current;

  useEffect(() => {
    if (!enabled) return;

    const listener = (event: MouseEvent | TouchEvent) => {
      // Check if click is inside any of the refs
      const isInside = refs.some((ref) => {
        const el = ref.current;
        return el && el.contains(event.target as Node);
      });

      if (!isInside) {
        handler(event);
      }
    };

    document.addEventListener('mousedown', listener);
    document.addEventListener('touchstart', listener);

    return () => {
      document.removeEventListener('mousedown', listener);
      document.removeEventListener('touchstart', listener);
    };
  }, [handler, enabled, refs]);

  return refs;
}

/**
 * Hook to handle Escape key press (commonly used with click outside)
 *
 * @example
 * useEscapeKey(() => {
 *   closeModal();
 * });
 */
export function useEscapeKey(
  handler: () => void,
  enabled: boolean = true
): void {
  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        handler();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handler, enabled]);
}

/**
 * Combined hook for modal/dropdown behavior (click outside + escape key)
 *
 * @example
 * function Modal({ onClose }) {
 *   const ref = useModalBehavior<HTMLDivElement>(onClose);
 *
 *   return <div ref={ref}>Modal Content</div>;
 * }
 */
export function useModalBehavior<T extends HTMLElement>(
  onClose: () => void,
  enabled: boolean = true
): RefObject<T> {
  const ref = useClickOutside<T>(onClose, enabled);
  useEscapeKey(onClose, enabled);
  return ref;
}

export default useClickOutside;
