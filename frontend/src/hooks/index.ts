/**
 * Hooks Index
 * Re-exports common utility hooks for simpler imports
 *
 * Usage:
 * import { useDebounce, useLocalStorage, useMediaQuery } from '@/hooks';
 */

// Debounce and throttle
export {
  useDebounce,
  useDebouncedCallback,
  useThrottle,
  useThrottledCallback,
  useDebounceImmediate,
} from './useDebounce';

// Storage
export {
  useLocalStorage,
  useSessionStorage,
  useLocalStorageExists,
  useLocalStorageKeys,
  clearLocalStoragePrefix,
} from './useStorage';

// Optimistic updates
export {
  useOptimistic,
  useOptimisticList,
  useOptimisticToggle,
} from './useOptimistic';

// Media queries and responsive
export {
  useMediaQuery,
  useBreakpoint,
  useResponsive,
  useColorScheme,
  useReducedMotion,
  useTouchDevice,
  useWindowSize,
  useOrientation,
  breakpoints,
} from './useMediaQuery';

// Click outside and modal behavior
export {
  useClickOutside,
  useClickOutsideMultiple,
  useEscapeKey,
  useModalBehavior,
} from './useClickOutside';

// Intersection observer and lazy loading
export {
  useIntersectionObserver,
  useInfiniteScroll,
  useVisibilityRatio,
  useLazyLoad,
} from './useIntersectionObserver';

// Clipboard
export {
  useCopyToClipboard,
  useCopyWithFeedback,
  copyToClipboard,
} from './useCopyToClipboard';

// Async data fetching
export {
  useAsync,
  usePolling,
  useFetch,
  usePagination,
  useMutation,
} from './useAsync';

// Countdown and timers
export {
  useCountdown,
  useTimer,
  useStopwatch,
  useDeadline,
} from './useCountdown';

// Previous value tracking
export {
  usePrevious,
  useHistory,
  useHasChanged,
  useIsFirstRender,
  useIsMounted,
  useUpdateEffect,
  useLatestCallback,
} from './usePrevious';

// Toggle and boolean state
export {
  useToggle,
  useBoolean,
  useDisclosure,
  useFlags,
  useCycle,
  useTriState,
} from './useToggle';

// Event listeners
export {
  useEventListener,
  useWindowResize,
  useScroll,
  useOnline,
  usePageVisibility,
  useWindowFocus,
  useDeviceMotion,
  useLongPress,
  useDoubleClick,
} from './useEventListener';

// Keyboard shortcuts
export {
  useKeyPress,
  useKeyboardShortcuts,
  useShortcutString,
  useArrowNavigation,
  useKeySequence,
  useTypingDetection,
  Keys,
} from './useKeyPress';

// Form state management
export {
  useForm,
  useField,
  useFormWizard,
  useFieldArray,
} from './useForm';

// Re-export types
export type { OptimisticState, UseOptimisticOptions } from './useOptimistic';
export type {
  UseIntersectionObserverOptions,
  IntersectionObserverEntry,
} from './useIntersectionObserver';
export type {
  UseCopyToClipboardOptions,
  UseCopyToClipboardResult,
} from './useCopyToClipboard';
export type { AsyncState, UseAsyncOptions } from './useAsync';
export type { CountdownState, UseCountdownOptions } from './useCountdown';
export type { KeyboardShortcut, KeyCode } from './useKeyPress';
export type { FormState, FormActions, FormFieldState, Validator } from './useForm';
