/**
 * AI Debate Strategy Service (Optional 0G Enhancement)
 *
 * Pre-generates a debate strategy for a warrior before battle starts.
 * A single 0G inference call per warrior produces a strategy that enriches
 * all 5 rounds of argument generation.
 *
 * Fully optional — returns null if 0G is unavailable or times out (5s limit).
 * Battle proceeds with context-aware template generation as fallback.
 */

import { internalFetch } from '@/lib/api/internalFetch';

export interface DebateStrategy {
  /** One-sentence core argument for the side */
  keyThesis: string;
  /** What the opponent will likely attack */
  keyWeakness: string;
  /** Strongest single piece of evidence to reference */
  bestEvidence: string;
  /** Preferred rhetorical approach */
  rhetoricalStyle: 'analytical' | 'aggressive' | 'persuasive' | 'defensive';
}

/**
 * Generate a debate strategy using 0G inference.
 * Returns null if 0G is unavailable or times out.
 */
export async function generateDebateStrategy(
  side: 'yes' | 'no',
  marketQuestion: string,
  category: string | undefined,
  yesPrice: number,
  noPrice: number,
): Promise<DebateStrategy | null> {
  const baseUrl = (process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000').trim();

  const prompt = `You are a debate strategist for a prediction market battle. The market asks: "${marketQuestion}"${category ? ` (Category: ${category})` : ''}
Current pricing: YES ${yesPrice.toFixed(1)}%, NO ${noPrice.toFixed(1)}%.
You must argue the ${side.toUpperCase()} side. Provide a concise debate strategy as valid JSON with these exact fields:
{"keyThesis":"<one compelling sentence for ${side.toUpperCase()}>","keyWeakness":"<the strongest counterargument you must address>","bestEvidence":"<one specific, factual piece of evidence supporting ${side.toUpperCase()}>","rhetoricalStyle":"<one of: analytical, aggressive, persuasive, defensive>"}
Respond with ONLY the JSON object, no other text.`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const response = await internalFetch(`${baseUrl}/api/0g/inference`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, maxTokens: 250, temperature: 0.7 }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) return null;

    const data = await response.json();
    if (!data.success || !data.response) return null;

    // Extract JSON from response (may contain surrounding text)
    const jsonMatch = data.response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]);
    if (!parsed.keyThesis || !parsed.keyWeakness || !parsed.bestEvidence || !parsed.rhetoricalStyle) return null;

    // Validate rhetoricalStyle
    const validStyles = ['analytical', 'aggressive', 'persuasive', 'defensive'];
    if (!validStyles.includes(parsed.rhetoricalStyle)) {
      parsed.rhetoricalStyle = 'analytical';
    }

    return parsed as DebateStrategy;
  } catch {
    // 0G unavailable, timeout, or parse error — battle proceeds without AI strategy
    return null;
  }
}

/**
 * Generate strategies for both warriors in parallel.
 * Each call independently returns null on failure.
 */
export async function generateBattleStrategies(
  marketQuestion: string,
  category: string | undefined,
  yesPrice: number,
  noPrice: number,
): Promise<{ yesStrategy: DebateStrategy | null; noStrategy: DebateStrategy | null }> {
  const [yesStrategy, noStrategy] = await Promise.all([
    generateDebateStrategy('yes', marketQuestion, category, yesPrice, noPrice),
    generateDebateStrategy('no', marketQuestion, category, yesPrice, noPrice),
  ]);
  return { yesStrategy, noStrategy };
}
