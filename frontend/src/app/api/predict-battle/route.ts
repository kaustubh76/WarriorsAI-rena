/**
 * API Route: Battle Prediction
 * Uses 0G AI to predict battle outcomes before markets open
 */

import { NextRequest, NextResponse } from 'next/server';

interface WarriorStats {
  strength: number;
  wit: number;
  charisma: number;
  defence: number;
  luck: number;
}

interface PredictionRequest {
  warrior1Id: string;
  warrior2Id: string;
  warrior1Stats: WarriorStats;
  warrior2Stats: WarriorStats;
}

interface PredictionResponse {
  success: boolean;
  warrior1Id: string;
  warrior2Id: string;
  prediction: 'warrior1' | 'warrior2';
  confidence: number;
  warrior1WinProbability: number;
  warrior2WinProbability: number;
  analysis: {
    strengthAdvantage: string;
    keyFactors: string[];
    riskFactors: string[];
  };
  suggestedOdds: {
    warrior1: number;
    warrior2: number;
  };
  error?: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: PredictionRequest = await request.json();
    const { warrior1Id, warrior2Id, warrior1Stats, warrior2Stats } = body;

    // Validate input
    if (!warrior1Id || !warrior2Id || !warrior1Stats || !warrior2Stats) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Calculate power scores
    const power1 = calculatePowerScore(warrior1Stats);
    const power2 = calculatePowerScore(warrior2Stats);

    // Calculate win probabilities
    const totalPower = power1 + power2;
    const warrior1Probability = (power1 / totalPower) * 100;
    const warrior2Probability = (power2 / totalPower) * 100;

    // Determine prediction
    const prediction: 'warrior1' | 'warrior2' = warrior1Probability > 50 ? 'warrior1' : 'warrior2';
    const confidence = Math.abs(warrior1Probability - 50) * 2; // 0-100%

    // Generate analysis
    const analysis = generateAnalysis(warrior1Stats, warrior2Stats, power1, power2);

    const response: PredictionResponse = {
      success: true,
      warrior1Id,
      warrior2Id,
      prediction,
      confidence: Math.round(confidence * 10) / 10,
      warrior1WinProbability: Math.round(warrior1Probability * 10) / 10,
      warrior2WinProbability: Math.round(warrior2Probability * 10) / 10,
      analysis,
      suggestedOdds: {
        warrior1: Math.round(warrior1Probability),
        warrior2: Math.round(warrior2Probability)
      }
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Battle prediction error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

/**
 * Calculate warrior power score based on stats
 */
function calculatePowerScore(stats: WarriorStats): number {
  // Weighted power calculation
  // Strength and Defence are most important for battles
  return (
    stats.strength * 1.3 +  // High impact on damage dealt
    stats.defence * 1.2 +    // High impact on damage taken
    stats.wit * 0.9 +        // Affects move effectiveness
    stats.luck * 0.8 +       // Critical hits and dodges
    stats.charisma * 0.5     // Minor influence
  );
}

/**
 * Generate detailed battle analysis
 */
function generateAnalysis(
  stats1: WarriorStats,
  stats2: WarriorStats,
  power1: number,
  power2: number
): {
  strengthAdvantage: string;
  keyFactors: string[];
  riskFactors: string[];
} {
  const keyFactors: string[] = [];
  const riskFactors: string[] = [];

  // Analyze strength comparison
  const strengthDiff = stats1.strength - stats2.strength;
  if (Math.abs(strengthDiff) > 1000) {
    if (strengthDiff > 0) {
      keyFactors.push('Warrior 1 has superior strength for higher damage output');
    } else {
      keyFactors.push('Warrior 2 has superior strength for higher damage output');
    }
  }

  // Analyze defence
  const defenceDiff = stats1.defence - stats2.defence;
  if (Math.abs(defenceDiff) > 1000) {
    if (defenceDiff > 0) {
      keyFactors.push('Warrior 1 has better defence, reducing incoming damage');
    } else {
      keyFactors.push('Warrior 2 has better defence, reducing incoming damage');
    }
  }

  // Analyze wit
  const witDiff = stats1.wit - stats2.wit;
  if (Math.abs(witDiff) > 800) {
    if (witDiff > 0) {
      keyFactors.push('Warrior 1\'s wit gives tactical advantage');
    } else {
      keyFactors.push('Warrior 2\'s wit gives tactical advantage');
    }
  }

  // Analyze luck
  const luckDiff = stats1.luck - stats2.luck;
  if (Math.abs(luckDiff) > 500) {
    if (luckDiff > 0) {
      keyFactors.push('Warrior 1 has higher luck for critical hits');
    } else {
      keyFactors.push('Warrior 2 has higher luck for critical hits');
    }
  }

  // Identify risk factors
  const powerDiff = Math.abs(power1 - power2);
  if (powerDiff < power1 * 0.1) {
    riskFactors.push('Very close matchup - outcome could go either way');
  }

  if (stats1.luck > 7000 || stats2.luck > 7000) {
    riskFactors.push('High luck stats increase unpredictability');
  }

  if (stats1.charisma > 8000 || stats2.charisma > 8000) {
    riskFactors.push('High charisma may influence crowd support effects');
  }

  // Determine overall advantage
  let strengthAdvantage: string;
  const diff = power1 - power2;
  const percentage = Math.abs(diff) / Math.max(power1, power2) * 100;

  if (percentage < 5) {
    strengthAdvantage = 'Evenly matched';
  } else if (percentage < 15) {
    strengthAdvantage = diff > 0 ? 'Slight advantage to Warrior 1' : 'Slight advantage to Warrior 2';
  } else if (percentage < 30) {
    strengthAdvantage = diff > 0 ? 'Moderate advantage to Warrior 1' : 'Moderate advantage to Warrior 2';
  } else {
    strengthAdvantage = diff > 0 ? 'Strong advantage to Warrior 1' : 'Strong advantage to Warrior 2';
  }

  return {
    strengthAdvantage,
    keyFactors: keyFactors.length > 0 ? keyFactors : ['No significant individual stat advantages'],
    riskFactors: riskFactors.length > 0 ? riskFactors : ['Standard battle conditions expected']
  };
}

// GET endpoint for fetching stored predictions
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const battleId = searchParams.get('battleId');

  if (!battleId) {
    return NextResponse.json(
      { error: 'battleId is required' },
      { status: 400 }
    );
  }

  // In production, fetch from database or cache
  return NextResponse.json({
    battleId,
    status: 'no_prediction',
    message: 'Submit a POST request with warrior stats to get a prediction'
  });
}
