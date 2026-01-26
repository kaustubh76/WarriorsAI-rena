'use client';

/**
 * Event Listener Hooks
 * Type-safe event listener management with automatic cleanup
 */

import { useEffect, useRef, useCallback } from 'react';

/**
 * Hook for adding event listeners with automatic cleanup
 *
 * @example
 * // Listen to window scroll
 * useEventListener('scroll', handleScroll);
 *
 * // Listen to element click
 * useEventListener('click', handleClick, buttonRef);
 *
 * // Listen to custom events
 * useEventListener('customEvent', handleCustom, document);
 */
export function useEventListener<K extends keyof WindowEventMap>(
  eventName: K,
  handler: (event: WindowEventMap[K]) => void,
  element?: undefined,
  options?: boolean | AddEventListenerOptions
): void;

export function useEventListener<K extends keyof HTMLElementEventMap>(
  eventName: K,
  handler: (event: HTMLElementEventMap[K]) => void,
  element: React.RefObject<HTMLElement | null>,
  options?: boolean | AddEventListenerOptions
): void;

export function useEventListener<K extends keyof DocumentEventMap>(
  eventName: K,
  handler: (event: DocumentEventMap[K]) => void,
  element: Document,
  options?: boolean | AddEventListenerOptions
): void;

export function useEventListener(
  eventName: string,
  handler: (event: Event) => void,
  element?: React.RefObject<HTMLElement | null> | Document | Window,
  options?: boolean | AddEventListenerOptions
): void {
  // Store handler in ref to avoid re-adding listener on handler change
  const savedHandler = useRef(handler);

  useEffect(() => {
    savedHandler.current = handler;
  }, [handler]);

  useEffect(() => {
    // Determine the target element
    let targetElement: HTMLElement | Document | Window | null;

    if (element === undefined) {
      targetElement = window;
    } else if (element instanceof Document || element instanceof Window) {
      targetElement = element;
    } else {
      targetElement = element.current;
    }

    if (!targetElement?.addEventListener) {
      return;
    }

    const eventListener = (event: Event) => {
      savedHandler.current(event);
    };

    targetElement.addEventListener(eventName, eventListener, options);

    return () => {
      targetElement?.removeEventListener(eventName, eventListener, options);
    };
  }, [eventName, element, options]);
}

/**
 * Hook for listening to window resize events with debouncing
 *
 * @example
 * const size = useWindowResize();
 * // { width: 1920, height: 1080 }
 */
export function useWindowResize(
  debounceMs: number = 100
): { width: number; height: number } {
  const [size, setSize] = useState({
    width: typeof window !== 'undefined' ? window.innerWidth : 0,
    height: typeof window !== 'undefined' ? window.innerHeight : 0,
  });

  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();

  useEventListener('resize', () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(() => {
      setSize({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    }, debounceMs);
  });

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return size;
}

import { useState } from 'react';

/**
 * Hook for listening to scroll position
 *
 * @example
 * const { x, y, isScrolling } = useScroll();
 */
export function useScroll(): {
  x: number;
  y: number;
  isScrolling: boolean;
  isAtTop: boolean;
  isAtBottom: boolean;
  direction: 'up' | 'down' | null;
} {
  const [state, setState] = useState({
    x: 0,
    y: 0,
    isScrolling: false,
    isAtTop: true,
    isAtBottom: false,
    direction: null as 'up' | 'down' | null,
  });

  const prevY = useRef(0);
  const scrollingTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  useEventListener('scroll', () => {
    const y = window.scrollY;
    const x = window.scrollX;
    const direction = y > prevY.current ? 'down' : y < prevY.current ? 'up' : null;
    const isAtTop = y <= 0;
    const isAtBottom =
      window.innerHeight + y >= document.documentElement.scrollHeight - 10;

    prevY.current = y;

    if (scrollingTimeoutRef.current) {
      clearTimeout(scrollingTimeoutRef.current);
    }

    setState({
      x,
      y,
      isScrolling: true,
      isAtTop,
      isAtBottom,
      direction,
    });

    scrollingTimeoutRef.current = setTimeout(() => {
      setState((prev) => ({ ...prev, isScrolling: false }));
    }, 150);
  });

  useEffect(() => {
    return () => {
      if (scrollingTimeoutRef.current) {
        clearTimeout(scrollingTimeoutRef.current);
      }
    };
  }, []);

  return state;
}

/**
 * Hook for detecting online/offline status
 *
 * @example
 * const isOnline = useOnline();
 *
 * if (!isOnline) {
 *   return <OfflineBanner />;
 * }
 */
export function useOnline(): boolean {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  useEventListener('online', () => setIsOnline(true));
  useEventListener('offline', () => setIsOnline(false));

  return isOnline;
}

/**
 * Hook for detecting page visibility
 *
 * @example
 * const isVisible = usePageVisibility();
 *
 * useEffect(() => {
 *   if (isVisible) {
 *     refetchData();
 *   }
 * }, [isVisible]);
 */
export function usePageVisibility(): boolean {
  const [isVisible, setIsVisible] = useState(
    typeof document !== 'undefined' ? !document.hidden : true
  );

  useEventListener(
    'visibilitychange',
    () => {
      setIsVisible(!document.hidden);
    },
    document
  );

  return isVisible;
}

/**
 * Hook for detecting focus/blur on the window
 *
 * @example
 * const isFocused = useWindowFocus();
 */
export function useWindowFocus(): boolean {
  const [isFocused, setIsFocused] = useState(
    typeof document !== 'undefined' ? document.hasFocus() : true
  );

  useEventListener('focus', () => setIsFocused(true));
  useEventListener('blur', () => setIsFocused(false));

  return isFocused;
}

/**
 * Hook for detecting device motion (mobile)
 *
 * @example
 * const motion = useDeviceMotion();
 * // { x: 0.5, y: -0.3, z: 9.8 }
 */
export function useDeviceMotion(): {
  acceleration: { x: number | null; y: number | null; z: number | null };
  rotationRate: { alpha: number | null; beta: number | null; gamma: number | null };
} {
  const [motion, setMotion] = useState({
    acceleration: { x: null as number | null, y: null as number | null, z: null as number | null },
    rotationRate: { alpha: null as number | null, beta: null as number | null, gamma: null as number | null },
  });

  useEffect(() => {
    const handler = (event: DeviceMotionEvent) => {
      setMotion({
        acceleration: {
          x: event.accelerationIncludingGravity?.x ?? null,
          y: event.accelerationIncludingGravity?.y ?? null,
          z: event.accelerationIncludingGravity?.z ?? null,
        },
        rotationRate: {
          alpha: event.rotationRate?.alpha ?? null,
          beta: event.rotationRate?.beta ?? null,
          gamma: event.rotationRate?.gamma ?? null,
        },
      });
    };

    window.addEventListener('devicemotion', handler);
    return () => window.removeEventListener('devicemotion', handler);
  }, []);

  return motion;
}

/**
 * Hook for long press detection
 *
 * @example
 * const longPressProps = useLongPress({
 *   onLongPress: () => console.log('Long pressed!'),
 *   duration: 500,
 * });
 *
 * <button {...longPressProps}>Hold me</button>
 */
export function useLongPress(options: {
  onLongPress: () => void;
  onPress?: () => void;
  duration?: number;
  cancelOnMove?: boolean;
}): {
  onMouseDown: () => void;
  onMouseUp: () => void;
  onMouseLeave: () => void;
  onTouchStart: () => void;
  onTouchEnd: () => void;
  onTouchMove: () => void;
} {
  const {
    onLongPress,
    onPress,
    duration = 500,
    cancelOnMove = true,
  } = options;

  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const isLongPressRef = useRef(false);

  const start = useCallback(() => {
    isLongPressRef.current = false;
    timeoutRef.current = setTimeout(() => {
      isLongPressRef.current = true;
      onLongPress();
    }, duration);
  }, [onLongPress, duration]);

  const clear = useCallback(
    (shouldTriggerPress = true) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      if (shouldTriggerPress && !isLongPressRef.current && onPress) {
        onPress();
      }
    },
    [onPress]
  );

  const cancel = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
  }, []);

  return {
    onMouseDown: start,
    onMouseUp: () => clear(true),
    onMouseLeave: () => clear(false),
    onTouchStart: start,
    onTouchEnd: () => clear(true),
    onTouchMove: cancelOnMove ? cancel : () => {},
  };
}

/**
 * Hook for detecting double click
 *
 * @example
 * const handleClick = useDoubleClick({
 *   onClick: () => console.log('Single click'),
 *   onDoubleClick: () => console.log('Double click'),
 * });
 *
 * <button onClick={handleClick}>Click me</button>
 */
export function useDoubleClick(options: {
  onClick?: () => void;
  onDoubleClick: () => void;
  delay?: number;
}): () => void {
  const { onClick, onDoubleClick, delay = 300 } = options;
  const clickCountRef = useRef(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();

  return useCallback(() => {
    clickCountRef.current += 1;

    if (clickCountRef.current === 1) {
      timeoutRef.current = setTimeout(() => {
        if (clickCountRef.current === 1 && onClick) {
          onClick();
        }
        clickCountRef.current = 0;
      }, delay);
    } else if (clickCountRef.current === 2) {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      clickCountRef.current = 0;
      onDoubleClick();
    }
  }, [onClick, onDoubleClick, delay]);
}

export default useEventListener;
