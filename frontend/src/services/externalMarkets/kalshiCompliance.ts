/**
 * Kalshi Compliance Validation
 * Jurisdiction and eligibility checking for Kalshi trading
 *
 * Kalshi is a CFTC-regulated exchange available only to US residents
 * in eligible states who are 18+
 */

// ============================================
// CONSTANTS
// ============================================

/**
 * US States where Kalshi is available (as of 2024)
 * This list should be updated as Kalshi expands availability
 */
const KALSHI_ELIGIBLE_STATES = [
  'AL', // Alabama
  'AK', // Alaska
  'AZ', // Arizona
  'AR', // Arkansas
  'CA', // California
  'CO', // Colorado
  'CT', // Connecticut
  'DE', // Delaware
  'FL', // Florida
  'GA', // Georgia
  'HI', // Hawaii
  'ID', // Idaho
  'IL', // Illinois
  'IN', // Indiana
  'IA', // Iowa
  'KS', // Kansas
  'KY', // Kentucky
  'LA', // Louisiana
  'ME', // Maine
  'MD', // Maryland
  'MA', // Massachusetts
  'MI', // Michigan
  'MN', // Minnesota
  'MS', // Mississippi
  'MO', // Missouri
  'MT', // Montana
  'NE', // Nebraska
  'NV', // Nevada
  'NH', // New Hampshire
  'NJ', // New Jersey
  'NM', // New Mexico
  'NC', // North Carolina
  'ND', // North Dakota
  'OH', // Ohio
  'OK', // Oklahoma
  'OR', // Oregon
  'PA', // Pennsylvania
  'RI', // Rhode Island
  'SC', // South Carolina
  'SD', // South Dakota
  'TN', // Tennessee
  'TX', // Texas
  'UT', // Utah
  'VT', // Vermont
  'VA', // Virginia
  'WA', // Washington
  'WV', // West Virginia
  'WI', // Wisconsin
  'WY', // Wyoming
  'DC', // District of Columbia
];

/**
 * States where Kalshi is NOT available
 * NY requires specific license that Kalshi doesn't have
 */
const RESTRICTED_STATES = ['NY'];

/**
 * Minimum age requirement
 */
const MINIMUM_AGE = 18;

// ============================================
// TYPES
// ============================================

export interface UserEligibility {
  isEligible: boolean;
  reason?: string;
  state?: string;
  requiresAdditionalVerification?: boolean;
}

export interface EligibilityCheckParams {
  userState: string;
  isUSResident: boolean;
  age: number;
  hasCompletedKYC?: boolean;
}

// ============================================
// VALIDATION FUNCTIONS
// ============================================

/**
 * Check if a user is eligible to trade on Kalshi
 */
export function checkKalshiEligibility(
  params: EligibilityCheckParams
): UserEligibility {
  const { userState, isUSResident, age } = params;

  // Must be US resident
  if (!isUSResident) {
    return {
      isEligible: false,
      reason: 'Kalshi is only available to US residents',
    };
  }

  // Must be 18+
  if (age < MINIMUM_AGE) {
    return {
      isEligible: false,
      reason: `Must be ${MINIMUM_AGE} years or older to trade on Kalshi`,
    };
  }

  // Validate state
  const stateUpper = userState.toUpperCase().trim();

  // Check restricted states first
  if (RESTRICTED_STATES.includes(stateUpper)) {
    return {
      isEligible: false,
      reason: `Kalshi is not currently available in ${getStateName(stateUpper)}`,
      state: stateUpper,
    };
  }

  // Check if state is in eligible list
  if (!KALSHI_ELIGIBLE_STATES.includes(stateUpper)) {
    return {
      isEligible: false,
      reason: `Kalshi is not available in ${stateUpper}. Please check back later.`,
      state: stateUpper,
    };
  }

  // All checks passed
  return {
    isEligible: true,
    state: stateUpper,
  };
}

/**
 * Async version of eligibility check (for API use)
 */
export async function checkKalshiEligibilityAsync(
  params: EligibilityCheckParams
): Promise<UserEligibility> {
  return checkKalshiEligibility(params);
}

/**
 * Middleware-style function that throws on ineligibility
 */
export function requireKalshiEligibility(
  params: EligibilityCheckParams
): void {
  const eligibility = checkKalshiEligibility(params);

  if (!eligibility.isEligible) {
    throw new KalshiComplianceError(
      eligibility.reason || 'Not eligible for Kalshi trading'
    );
  }
}

/**
 * Check if a state code is valid
 */
export function isValidUSState(stateCode: string): boolean {
  const allStates = [...KALSHI_ELIGIBLE_STATES, ...RESTRICTED_STATES];
  return allStates.includes(stateCode.toUpperCase().trim());
}

/**
 * Get list of eligible states
 */
export function getEligibleStates(): string[] {
  return [...KALSHI_ELIGIBLE_STATES];
}

/**
 * Get list of restricted states
 */
export function getRestrictedStates(): string[] {
  return [...RESTRICTED_STATES];
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Get full state name from code
 */
function getStateName(code: string): string {
  const stateNames: Record<string, string> = {
    AL: 'Alabama',
    AK: 'Alaska',
    AZ: 'Arizona',
    AR: 'Arkansas',
    CA: 'California',
    CO: 'Colorado',
    CT: 'Connecticut',
    DE: 'Delaware',
    FL: 'Florida',
    GA: 'Georgia',
    HI: 'Hawaii',
    ID: 'Idaho',
    IL: 'Illinois',
    IN: 'Indiana',
    IA: 'Iowa',
    KS: 'Kansas',
    KY: 'Kentucky',
    LA: 'Louisiana',
    ME: 'Maine',
    MD: 'Maryland',
    MA: 'Massachusetts',
    MI: 'Michigan',
    MN: 'Minnesota',
    MS: 'Mississippi',
    MO: 'Missouri',
    MT: 'Montana',
    NE: 'Nebraska',
    NV: 'Nevada',
    NH: 'New Hampshire',
    NJ: 'New Jersey',
    NM: 'New Mexico',
    NY: 'New York',
    NC: 'North Carolina',
    ND: 'North Dakota',
    OH: 'Ohio',
    OK: 'Oklahoma',
    OR: 'Oregon',
    PA: 'Pennsylvania',
    RI: 'Rhode Island',
    SC: 'South Carolina',
    SD: 'South Dakota',
    TN: 'Tennessee',
    TX: 'Texas',
    UT: 'Utah',
    VT: 'Vermont',
    VA: 'Virginia',
    WA: 'Washington',
    WV: 'West Virginia',
    WI: 'Wisconsin',
    WY: 'Wyoming',
    DC: 'District of Columbia',
  };

  return stateNames[code] || code;
}

// ============================================
// ERROR CLASS
// ============================================

export class KalshiComplianceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'KalshiComplianceError';
  }
}
