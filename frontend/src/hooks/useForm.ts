'use client';

/**
 * Form Hooks
 * Hooks for managing form state, validation, and submission
 */

import { useState, useCallback, useRef, useMemo, useEffect } from 'react';

/**
 * Form field state
 */
export interface FormFieldState<T> {
  value: T;
  error: string | null;
  touched: boolean;
  dirty: boolean;
}

/**
 * Validation function type
 */
export type Validator<T> = (value: T, values?: Record<string, unknown>) => string | null;

/**
 * Form configuration
 */
export interface UseFormConfig<T extends Record<string, unknown>> {
  initialValues: T;
  validators?: Partial<{ [K in keyof T]: Validator<T[K]> }>;
  onSubmit?: (values: T) => void | Promise<void>;
  validateOnChange?: boolean;
  validateOnBlur?: boolean;
}

/**
 * Form state
 */
export interface FormState<T extends Record<string, unknown>> {
  values: T;
  errors: Partial<{ [K in keyof T]: string | null }>;
  touched: Partial<{ [K in keyof T]: boolean }>;
  isValid: boolean;
  isDirty: boolean;
  isSubmitting: boolean;
  submitCount: number;
}

/**
 * Form actions
 */
export interface FormActions<T extends Record<string, unknown>> {
  setValue: <K extends keyof T>(field: K, value: T[K]) => void;
  setValues: (values: Partial<T>) => void;
  setError: <K extends keyof T>(field: K, error: string | null) => void;
  setErrors: (errors: Partial<{ [K in keyof T]: string | null }>) => void;
  setTouched: <K extends keyof T>(field: K, touched?: boolean) => void;
  validate: () => boolean;
  validateField: <K extends keyof T>(field: K) => string | null;
  reset: (values?: T) => void;
  submit: () => Promise<void>;
  getFieldProps: <K extends keyof T>(field: K) => {
    name: K;
    value: T[K];
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => void;
    onBlur: () => void;
  };
  getCheckboxProps: <K extends keyof T>(field: K) => {
    name: K;
    checked: boolean;
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    onBlur: () => void;
  };
}

/**
 * Hook for managing form state with validation
 *
 * @example
 * const { values, errors, touched, getFieldProps, submit, isSubmitting } = useForm({
 *   initialValues: {
 *     email: '',
 *     password: '',
 *   },
 *   validators: {
 *     email: (value) => !value.includes('@') ? 'Invalid email' : null,
 *     password: (value) => value.length < 8 ? 'Password too short' : null,
 *   },
 *   onSubmit: async (values) => {
 *     await loginUser(values);
 *   },
 * });
 *
 * <form onSubmit={(e) => { e.preventDefault(); submit(); }}>
 *   <input {...getFieldProps('email')} />
 *   {touched.email && errors.email && <span>{errors.email}</span>}
 *   <input type="password" {...getFieldProps('password')} />
 *   <button type="submit" disabled={isSubmitting}>Login</button>
 * </form>
 */
export function useForm<T extends Record<string, unknown>>(
  config: UseFormConfig<T>
): FormState<T> & FormActions<T> {
  const {
    initialValues,
    validators = {},
    onSubmit,
    validateOnChange = true,
    validateOnBlur = true,
  } = config;

  const [values, setValuesState] = useState<T>(initialValues);
  const [errors, setErrorsState] = useState<Partial<{ [K in keyof T]: string | null }>>({});
  const [touched, setTouchedState] = useState<Partial<{ [K in keyof T]: boolean }>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitCount, setSubmitCount] = useState(0);

  const initialValuesRef = useRef(initialValues);
  const validatorsRef = useRef(validators);
  validatorsRef.current = validators;

  const onSubmitRef = useRef(onSubmit);
  onSubmitRef.current = onSubmit;

  // Calculate derived state
  const isValid = useMemo(() => {
    return Object.values(errors).every((error) => !error);
  }, [errors]);

  const isDirty = useMemo(() => {
    return Object.keys(values).some(
      (key) => values[key as keyof T] !== initialValuesRef.current[key as keyof T]
    );
  }, [values]);

  // Validate a single field
  const validateField = useCallback(
    <K extends keyof T>(field: K): string | null => {
      const validator = validatorsRef.current[field];
      if (!validator) return null;
      return validator(values[field], values as Record<string, unknown>);
    },
    [values]
  );

  // Validate all fields
  const validate = useCallback((): boolean => {
    const newErrors: Partial<{ [K in keyof T]: string | null }> = {};
    let isValid = true;

    for (const key of Object.keys(validatorsRef.current) as (keyof T)[]) {
      const error = validateField(key);
      if (error) {
        newErrors[key] = error;
        isValid = false;
      } else {
        newErrors[key] = null;
      }
    }

    setErrorsState(newErrors);
    return isValid;
  }, [validateField]);

  // Set a single value
  const setValue = useCallback(
    <K extends keyof T>(field: K, value: T[K]) => {
      setValuesState((prev) => ({ ...prev, [field]: value }));

      if (validateOnChange) {
        const validator = validatorsRef.current[field];
        if (validator) {
          const error = validator(value, values as Record<string, unknown>);
          setErrorsState((prev) => ({ ...prev, [field]: error }));
        }
      }
    },
    [validateOnChange, values]
  );

  // Set multiple values
  const setValues = useCallback((newValues: Partial<T>) => {
    setValuesState((prev) => ({ ...prev, ...newValues }));
  }, []);

  // Set a single error
  const setError = useCallback(<K extends keyof T>(field: K, error: string | null) => {
    setErrorsState((prev) => ({ ...prev, [field]: error }));
  }, []);

  // Set multiple errors
  const setErrors = useCallback(
    (newErrors: Partial<{ [K in keyof T]: string | null }>) => {
      setErrorsState((prev) => ({ ...prev, ...newErrors }));
    },
    []
  );

  // Set touched state for a field
  const setTouched = useCallback(
    <K extends keyof T>(field: K, isTouched = true) => {
      setTouchedState((prev) => ({ ...prev, [field]: isTouched }));

      if (validateOnBlur && isTouched) {
        const error = validateField(field);
        setErrorsState((prev) => ({ ...prev, [field]: error }));
      }
    },
    [validateOnBlur, validateField]
  );

  // Reset the form
  const reset = useCallback((newValues?: T) => {
    const resetValues = newValues ?? initialValuesRef.current;
    setValuesState(resetValues);
    setErrorsState({});
    setTouchedState({});
    setIsSubmitting(false);
  }, []);

  // Submit the form
  const submit = useCallback(async () => {
    setSubmitCount((prev) => prev + 1);

    // Mark all fields as touched
    const allTouched: Partial<{ [K in keyof T]: boolean }> = {};
    for (const key of Object.keys(values) as (keyof T)[]) {
      allTouched[key] = true;
    }
    setTouchedState(allTouched);

    // Validate
    const isValid = validate();
    if (!isValid) return;

    // Submit
    setIsSubmitting(true);
    try {
      await onSubmitRef.current?.(values);
    } finally {
      setIsSubmitting(false);
    }
  }, [values, validate]);

  // Get props for an input field
  const getFieldProps = useCallback(
    <K extends keyof T>(field: K) => ({
      name: field,
      value: values[field] as T[K],
      onChange: (
        e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
      ) => {
        setValue(field, e.target.value as T[K]);
      },
      onBlur: () => setTouched(field, true),
    }),
    [values, setValue, setTouched]
  );

  // Get props for a checkbox field
  const getCheckboxProps = useCallback(
    <K extends keyof T>(field: K) => ({
      name: field,
      checked: Boolean(values[field]),
      onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
        setValue(field, e.target.checked as T[K]);
      },
      onBlur: () => setTouched(field, true),
    }),
    [values, setValue, setTouched]
  );

  return {
    values,
    errors,
    touched,
    isValid,
    isDirty,
    isSubmitting,
    submitCount,
    setValue,
    setValues,
    setError,
    setErrors,
    setTouched,
    validate,
    validateField,
    reset,
    submit,
    getFieldProps,
    getCheckboxProps,
  };
}

/**
 * Hook for a single form field (useful for controlled inputs)
 *
 * @example
 * const email = useField('', (value) => !value.includes('@') ? 'Invalid email' : null);
 *
 * <input
 *   value={email.value}
 *   onChange={(e) => email.setValue(e.target.value)}
 *   onBlur={email.onBlur}
 * />
 * {email.touched && email.error && <span>{email.error}</span>}
 */
export function useField<T>(
  initialValue: T,
  validator?: Validator<T>
): {
  value: T;
  setValue: (value: T) => void;
  error: string | null;
  touched: boolean;
  dirty: boolean;
  onBlur: () => void;
  reset: () => void;
  validate: () => boolean;
} {
  const [value, setValue] = useState<T>(initialValue);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);

  const initialValueRef = useRef(initialValue);
  const validatorRef = useRef(validator);
  validatorRef.current = validator;

  const dirty = value !== initialValueRef.current;

  const validate = useCallback(() => {
    if (!validatorRef.current) return true;
    const error = validatorRef.current(value);
    setError(error);
    return !error;
  }, [value]);

  const handleSetValue = useCallback((newValue: T) => {
    setValue(newValue);
    if (validatorRef.current) {
      setError(validatorRef.current(newValue));
    }
  }, []);

  const onBlur = useCallback(() => {
    setTouched(true);
    validate();
  }, [validate]);

  const reset = useCallback(() => {
    setValue(initialValueRef.current);
    setError(null);
    setTouched(false);
  }, []);

  return {
    value,
    setValue: handleSetValue,
    error,
    touched,
    dirty,
    onBlur,
    reset,
    validate,
  };
}

/**
 * Hook for form wizard / multi-step forms
 *
 * @example
 * const wizard = useFormWizard({
 *   steps: [
 *     { id: 'personal', label: 'Personal Info' },
 *     { id: 'address', label: 'Address' },
 *     { id: 'review', label: 'Review' },
 *   ],
 * });
 *
 * wizard.currentStep // { id: 'personal', label: 'Personal Info' }
 * wizard.next();
 * wizard.back();
 * wizard.goTo('review');
 */
export function useFormWizard<T extends { id: string; label: string }>(config: {
  steps: T[];
  initialStep?: number;
  onStepChange?: (step: T, index: number) => void;
  onComplete?: () => void;
}): {
  currentStep: T;
  currentIndex: number;
  steps: T[];
  isFirst: boolean;
  isLast: boolean;
  progress: number;
  next: () => void;
  back: () => void;
  goTo: (stepId: string | number) => void;
  reset: () => void;
} {
  const { steps, initialStep = 0, onStepChange, onComplete } = config;
  const [currentIndex, setCurrentIndex] = useState(initialStep);

  const onStepChangeRef = useRef(onStepChange);
  onStepChangeRef.current = onStepChange;

  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const currentStep = steps[currentIndex];
  const isFirst = currentIndex === 0;
  const isLast = currentIndex === steps.length - 1;
  const progress = ((currentIndex + 1) / steps.length) * 100;

  const next = useCallback(() => {
    if (isLast) {
      onCompleteRef.current?.();
      return;
    }

    const nextIndex = currentIndex + 1;
    setCurrentIndex(nextIndex);
    onStepChangeRef.current?.(steps[nextIndex], nextIndex);
  }, [currentIndex, isLast, steps]);

  const back = useCallback(() => {
    if (isFirst) return;

    const prevIndex = currentIndex - 1;
    setCurrentIndex(prevIndex);
    onStepChangeRef.current?.(steps[prevIndex], prevIndex);
  }, [currentIndex, isFirst, steps]);

  const goTo = useCallback(
    (stepId: string | number) => {
      let targetIndex: number;

      if (typeof stepId === 'number') {
        targetIndex = stepId;
      } else {
        targetIndex = steps.findIndex((s) => s.id === stepId);
      }

      if (targetIndex >= 0 && targetIndex < steps.length) {
        setCurrentIndex(targetIndex);
        onStepChangeRef.current?.(steps[targetIndex], targetIndex);
      }
    },
    [steps]
  );

  const reset = useCallback(() => {
    setCurrentIndex(initialStep);
    onStepChangeRef.current?.(steps[initialStep], initialStep);
  }, [initialStep, steps]);

  return {
    currentStep,
    currentIndex,
    steps,
    isFirst,
    isLast,
    progress,
    next,
    back,
    goTo,
    reset,
  };
}

/**
 * Hook for managing form field arrays
 *
 * @example
 * const items = useFieldArray<{ name: string; quantity: number }>([]);
 *
 * items.append({ name: '', quantity: 1 });
 * items.remove(0);
 * items.update(1, { name: 'Updated', quantity: 5 });
 */
export function useFieldArray<T>(initialValue: T[] = []): {
  fields: T[];
  append: (item: T) => void;
  prepend: (item: T) => void;
  insert: (index: number, item: T) => void;
  remove: (index: number) => void;
  update: (index: number, item: T) => void;
  move: (from: number, to: number) => void;
  swap: (indexA: number, indexB: number) => void;
  replace: (items: T[]) => void;
  clear: () => void;
} {
  const [fields, setFields] = useState<T[]>(initialValue);

  const append = useCallback((item: T) => {
    setFields((prev) => [...prev, item]);
  }, []);

  const prepend = useCallback((item: T) => {
    setFields((prev) => [item, ...prev]);
  }, []);

  const insert = useCallback((index: number, item: T) => {
    setFields((prev) => {
      const next = [...prev];
      next.splice(index, 0, item);
      return next;
    });
  }, []);

  const remove = useCallback((index: number) => {
    setFields((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const update = useCallback((index: number, item: T) => {
    setFields((prev) => {
      const next = [...prev];
      next[index] = item;
      return next;
    });
  }, []);

  const move = useCallback((from: number, to: number) => {
    setFields((prev) => {
      const next = [...prev];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
  }, []);

  const swap = useCallback((indexA: number, indexB: number) => {
    setFields((prev) => {
      const next = [...prev];
      [next[indexA], next[indexB]] = [next[indexB], next[indexA]];
      return next;
    });
  }, []);

  const replace = useCallback((items: T[]) => {
    setFields(items);
  }, []);

  const clear = useCallback(() => {
    setFields([]);
  }, []);

  return {
    fields,
    append,
    prepend,
    insert,
    remove,
    update,
    move,
    swap,
    replace,
    clear,
  };
}

export default useForm;
