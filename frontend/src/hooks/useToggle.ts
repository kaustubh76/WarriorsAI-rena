'use client';

/**
 * Toggle and Boolean Hooks
 * Hooks for managing boolean state with convenient methods
 */

import { useState, useCallback, useMemo } from 'react';

/**
 * Hook for toggling a boolean value
 *
 * @example
 * const [isOpen, toggle] = useToggle(false);
 *
 * <button onClick={toggle}>Toggle</button>
 * <button onClick={() => toggle(true)}>Open</button>
 * <button onClick={() => toggle(false)}>Close</button>
 */
export function useToggle(
  initialValue: boolean = false
): [boolean, (value?: boolean) => void] {
  const [value, setValue] = useState(initialValue);

  const toggle = useCallback((newValue?: boolean) => {
    if (typeof newValue === 'boolean') {
      setValue(newValue);
    } else {
      setValue((prev) => !prev);
    }
  }, []);

  return [value, toggle];
}

/**
 * Hook for boolean state with explicit set/unset methods
 *
 * @example
 * const { value, setTrue, setFalse, toggle } = useBoolean(false);
 *
 * <button onClick={setTrue}>Open</button>
 * <button onClick={setFalse}>Close</button>
 * <button onClick={toggle}>Toggle</button>
 */
export function useBoolean(initialValue: boolean = false): {
  value: boolean;
  setValue: React.Dispatch<React.SetStateAction<boolean>>;
  setTrue: () => void;
  setFalse: () => void;
  toggle: () => void;
} {
  const [value, setValue] = useState(initialValue);

  const setTrue = useCallback(() => setValue(true), []);
  const setFalse = useCallback(() => setValue(false), []);
  const toggle = useCallback(() => setValue((prev) => !prev), []);

  return { value, setValue, setTrue, setFalse, toggle };
}

/**
 * Hook for managing disclosure state (modals, drawers, etc.)
 *
 * @example
 * const modal = useDisclosure();
 *
 * <button onClick={modal.open}>Open Modal</button>
 * <Modal isOpen={modal.isOpen} onClose={modal.close}>
 *   Content
 * </Modal>
 */
export function useDisclosure(
  initialValue: boolean = false,
  callbacks?: {
    onOpen?: () => void;
    onClose?: () => void;
  }
): {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
  setIsOpen: React.Dispatch<React.SetStateAction<boolean>>;
} {
  const [isOpen, setIsOpen] = useState(initialValue);

  const open = useCallback(() => {
    setIsOpen(true);
    callbacks?.onOpen?.();
  }, [callbacks]);

  const close = useCallback(() => {
    setIsOpen(false);
    callbacks?.onClose?.();
  }, [callbacks]);

  const toggle = useCallback(() => {
    setIsOpen((prev) => {
      const next = !prev;
      if (next) {
        callbacks?.onOpen?.();
      } else {
        callbacks?.onClose?.();
      }
      return next;
    });
  }, [callbacks]);

  return { isOpen, open, close, toggle, setIsOpen };
}

/**
 * Hook for managing multiple boolean flags
 *
 * @example
 * const flags = useFlags({
 *   loading: false,
 *   error: false,
 *   success: false,
 * });
 *
 * flags.set('loading', true);
 * flags.toggle('success');
 * flags.reset();
 */
export function useFlags<T extends Record<string, boolean>>(
  initialFlags: T
): {
  flags: T;
  set: (key: keyof T, value: boolean) => void;
  toggle: (key: keyof T) => void;
  setAll: (value: boolean) => void;
  reset: () => void;
  isAnyTrue: boolean;
  isAllTrue: boolean;
  isAllFalse: boolean;
} {
  const [flags, setFlags] = useState<T>(initialFlags);

  const set = useCallback((key: keyof T, value: boolean) => {
    setFlags((prev) => ({ ...prev, [key]: value }));
  }, []);

  const toggle = useCallback((key: keyof T) => {
    setFlags((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const setAll = useCallback(
    (value: boolean) => {
      setFlags((prev) => {
        const newFlags = { ...prev };
        for (const key in newFlags) {
          newFlags[key] = value as T[Extract<keyof T, string>];
        }
        return newFlags;
      });
    },
    []
  );

  const reset = useCallback(() => {
    setFlags(initialFlags);
  }, [initialFlags]);

  const computed = useMemo(() => {
    const values = Object.values(flags);
    return {
      isAnyTrue: values.some(Boolean),
      isAllTrue: values.every(Boolean),
      isAllFalse: values.every((v) => !v),
    };
  }, [flags]);

  return {
    flags,
    set,
    toggle,
    setAll,
    reset,
    ...computed,
  };
}

/**
 * Hook for cycling through a list of values
 *
 * @example
 * const [theme, nextTheme, prevTheme, setTheme] = useCycle(['light', 'dark', 'system']);
 *
 * <button onClick={nextTheme}>Next Theme</button>
 */
export function useCycle<T>(
  values: T[]
): [T, () => void, () => void, (value: T) => void, number] {
  const [index, setIndex] = useState(0);

  const next = useCallback(() => {
    setIndex((prev) => (prev + 1) % values.length);
  }, [values.length]);

  const prev = useCallback(() => {
    setIndex((prev) => (prev - 1 + values.length) % values.length);
  }, [values.length]);

  const setValue = useCallback(
    (value: T) => {
      const newIndex = values.indexOf(value);
      if (newIndex !== -1) {
        setIndex(newIndex);
      }
    },
    [values]
  );

  return [values[index], next, prev, setValue, index];
}

/**
 * Hook for three-state toggle (null | true | false)
 *
 * @example
 * const [value, cycle, setValue] = useTriState();
 * // null -> true -> false -> null -> ...
 */
export function useTriState(
  initialValue: boolean | null = null
): [boolean | null, () => void, (value: boolean | null) => void] {
  const [value, setValue] = useState<boolean | null>(initialValue);

  const cycle = useCallback(() => {
    setValue((prev) => {
      if (prev === null) return true;
      if (prev === true) return false;
      return null;
    });
  }, []);

  return [value, cycle, setValue];
}

export default useToggle;
