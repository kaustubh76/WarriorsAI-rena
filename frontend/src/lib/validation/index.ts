/**
 * Form Validation Utilities
 * Type-safe validation for forms and user input
 */

export type ValidationResult = {
  valid: boolean;
  error?: string;
};

export type Validator<T> = (value: T) => ValidationResult;

/**
 * Combine multiple validators into one
 */
export function combine<T>(...validators: Validator<T>[]): Validator<T> {
  return (value: T) => {
    for (const validator of validators) {
      const result = validator(value);
      if (!result.valid) {
        return result;
      }
    }
    return { valid: true };
  };
}

/**
 * Make a validator optional (allows undefined/null)
 */
export function optional<T>(validator: Validator<T>): Validator<T | undefined | null> {
  return (value) => {
    if (value === undefined || value === null || value === '') {
      return { valid: true };
    }
    return validator(value as T);
  };
}

// ==================== String Validators ====================

export const string = {
  /**
   * Validate that string is not empty
   */
  required: (message = 'This field is required'): Validator<string> => {
    return (value) => {
      if (!value || value.trim() === '') {
        return { valid: false, error: message };
      }
      return { valid: true };
    };
  },

  /**
   * Validate minimum string length
   */
  minLength: (min: number, message?: string): Validator<string> => {
    return (value) => {
      if (value.length < min) {
        return {
          valid: false,
          error: message || `Must be at least ${min} characters`,
        };
      }
      return { valid: true };
    };
  },

  /**
   * Validate maximum string length
   */
  maxLength: (max: number, message?: string): Validator<string> => {
    return (value) => {
      if (value.length > max) {
        return {
          valid: false,
          error: message || `Must be at most ${max} characters`,
        };
      }
      return { valid: true };
    };
  },

  /**
   * Validate string matches a regex pattern
   */
  pattern: (regex: RegExp, message = 'Invalid format'): Validator<string> => {
    return (value) => {
      if (!regex.test(value)) {
        return { valid: false, error: message };
      }
      return { valid: true };
    };
  },

  /**
   * Validate email format
   */
  email: (message = 'Invalid email address'): Validator<string> => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return string.pattern(emailRegex, message);
  },

  /**
   * Validate URL format
   */
  url: (message = 'Invalid URL'): Validator<string> => {
    return (value) => {
      try {
        new URL(value);
        return { valid: true };
      } catch {
        return { valid: false, error: message };
      }
    };
  },

  /**
   * Validate string contains no HTML/script tags (XSS prevention)
   */
  noHtml: (message = 'HTML tags are not allowed'): Validator<string> => {
    return (value) => {
      if (/<[^>]*>/.test(value) || /javascript:/i.test(value)) {
        return { valid: false, error: message };
      }
      return { valid: true };
    };
  },

  /**
   * Validate alphanumeric only
   */
  alphanumeric: (message = 'Only letters and numbers allowed'): Validator<string> => {
    return string.pattern(/^[a-zA-Z0-9]*$/, message);
  },
};

// ==================== Number Validators ====================

export const number = {
  /**
   * Validate number is required (not NaN)
   */
  required: (message = 'This field is required'): Validator<number> => {
    return (value) => {
      if (isNaN(value)) {
        return { valid: false, error: message };
      }
      return { valid: true };
    };
  },

  /**
   * Validate minimum value
   */
  min: (min: number, message?: string): Validator<number> => {
    return (value) => {
      if (value < min) {
        return {
          valid: false,
          error: message || `Must be at least ${min}`,
        };
      }
      return { valid: true };
    };
  },

  /**
   * Validate maximum value
   */
  max: (max: number, message?: string): Validator<number> => {
    return (value) => {
      if (value > max) {
        return {
          valid: false,
          error: message || `Must be at most ${max}`,
        };
      }
      return { valid: true };
    };
  },

  /**
   * Validate value is within range
   */
  range: (min: number, max: number, message?: string): Validator<number> => {
    return combine(
      number.min(min, message || `Must be between ${min} and ${max}`),
      number.max(max, message || `Must be between ${min} and ${max}`)
    );
  },

  /**
   * Validate value is an integer
   */
  integer: (message = 'Must be a whole number'): Validator<number> => {
    return (value) => {
      if (!Number.isInteger(value)) {
        return { valid: false, error: message };
      }
      return { valid: true };
    };
  },

  /**
   * Validate value is positive
   */
  positive: (message = 'Must be a positive number'): Validator<number> => {
    return (value) => {
      if (value <= 0) {
        return { valid: false, error: message };
      }
      return { valid: true };
    };
  },
};

// ==================== Ethereum/Blockchain Validators ====================

export const ethereum = {
  /**
   * Validate Ethereum address format
   */
  address: (message = 'Invalid Ethereum address'): Validator<string> => {
    return (value) => {
      if (!/^0x[a-fA-F0-9]{40}$/.test(value)) {
        return { valid: false, error: message };
      }
      return { valid: true };
    };
  },

  /**
   * Validate transaction hash format
   */
  txHash: (message = 'Invalid transaction hash'): Validator<string> => {
    return (value) => {
      if (!/^0x[a-fA-F0-9]{64}$/.test(value)) {
        return { valid: false, error: message };
      }
      return { valid: true };
    };
  },

  /**
   * Validate amount is valid for blockchain (positive, reasonable precision)
   */
  amount: (
    minAmount = 0,
    maxAmount = Number.MAX_SAFE_INTEGER
  ): Validator<number> => {
    return combine(
      number.min(minAmount, `Amount must be at least ${minAmount}`),
      number.max(maxAmount, `Amount must be at most ${maxAmount}`),
      (value) => {
        // Check for reasonable decimal places (18 is ETH max)
        const decimalPlaces = (value.toString().split('.')[1] || '').length;
        if (decimalPlaces > 18) {
          return { valid: false, error: 'Too many decimal places' };
        }
        return { valid: true };
      }
    );
  },
};

// ==================== Form Validation ====================

export type FormErrors<T> = Partial<Record<keyof T, string>>;
export type FormValidators<T> = Partial<Record<keyof T, Validator<unknown>>>;

/**
 * Validate an entire form object
 *
 * @example
 * const errors = validateForm(formData, {
 *   email: string.email(),
 *   amount: number.positive(),
 *   address: ethereum.address(),
 * });
 *
 * if (Object.keys(errors).length > 0) {
 *   // Handle errors
 * }
 */
export function validateForm<T extends Record<string, unknown>>(
  data: T,
  validators: FormValidators<T>
): FormErrors<T> {
  const errors: FormErrors<T> = {};

  for (const [field, validator] of Object.entries(validators)) {
    if (validator) {
      const value = data[field as keyof T];
      const result = validator(value);
      if (!result.valid && result.error) {
        errors[field as keyof T] = result.error;
      }
    }
  }

  return errors;
}

/**
 * Check if form has any errors
 */
export function hasErrors<T>(errors: FormErrors<T>): boolean {
  return Object.keys(errors).length > 0;
}

/**
 * Get first error message from form errors
 */
export function getFirstError<T>(errors: FormErrors<T>): string | undefined {
  const values = Object.values(errors);
  return values[0] as string | undefined;
}
