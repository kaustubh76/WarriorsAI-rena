/**
 * Demo Data Seeder for Arbitrage System
 * Creates sample data for testing and demonstration
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding arbitrage demo data...\n');

  // 1. Create External Markets
  console.log('Creating external markets...');

  const polyBTC = await prisma.externalMarket.upsert({
    where: { id: 'poly_btc_100k' },
    update: {},
    create: {
      id: 'poly_btc_100k',
      source: 'polymarket',
      externalId: '0x1234567890abcdef',
      question: 'Will Bitcoin hit $100k by March 2026?',
      description: 'Bitcoin price prediction market',
      category: 'Crypto',
      tags: '["bitcoin","crypto","price"]',
      yesPrice: 4500, // 45%
      noPrice: 5500, // 55%
      volume: '2300000',
      liquidity: '450000',
      endTime: new Date('2026-03-31'),
      status: 'active',
      outcome: null,
      sourceUrl: 'https://polymarket.com/market/btc-100k',
    },
  });

  const kalshiBTC = await prisma.externalMarket.upsert({
    where: { id: 'kalshi_btc_100k' },
    update: {},
    create: {
      id: 'kalshi_btc_100k',
      source: 'kalshi',
      externalId: 'BTCUSD-26MAR-100K',
      question: 'Will Bitcoin be above $100,000 on March 31, 2026?',
      description: 'Bitcoin price forecast',
      category: 'Finance',
      tags: '["bitcoin","cryptocurrency"]',
      yesPrice: 4800, // 48%
      noPrice: 5200, // 52%
      volume: '890000',
      liquidity: '180000',
      endTime: new Date('2026-03-31'),
      status: 'active',
      outcome: null,
      sourceUrl: 'https://kalshi.com/markets/btc-100k',
    },
  });

  console.log(`✅ Created markets: ${polyBTC.id}, ${kalshiBTC.id}\n`);

  // 2. Create Matched Market Pair
  console.log('Creating matched market pair...');

  const matchedPair = await prisma.matchedMarketPair.upsert({
    where: {
      polymarketId_kalshiId: {
        polymarketId: polyBTC.id,
        kalshiId: kalshiBTC.id,
      },
    },
    update: {},
    create: {
      polymarketId: polyBTC.id,
      polymarketQuestion: polyBTC.question,
      polymarketYesPrice: polyBTC.yesPrice,
      polymarketNoPrice: polyBTC.noPrice,
      polymarketVolume: polyBTC.volume,
      kalshiId: kalshiBTC.id,
      kalshiQuestion: kalshiBTC.question,
      kalshiYesPrice: kalshiBTC.yesPrice,
      kalshiNoPrice: kalshiBTC.noPrice,
      kalshiVolume: kalshiBTC.volume,
      similarity: 0.95,
      priceDifference: 7.0, // 7% spread
      hasArbitrage: true,
      arbitrageStrategy: JSON.stringify({
        buyYesOn: 'polymarket',
        buyNoOn: 'kalshi',
        potentialProfit: 7.5,
      }),
      isActive: true,
    },
  });

  console.log(`✅ Created matched pair: ${matchedPair.id}\n`);

  // 3. Create More Opportunities
  console.log('Creating additional opportunities...');

  const opportunities = [
    {
      poly: {
        id: 'poly_fed_rate',
        externalId: '0xfed123',
        question: 'Will Fed cut rates in Q1 2026?',
        yesPrice: 6200,
        noPrice: 3800,
      },
      kalshi: {
        id: 'kalshi_fed_rate',
        externalId: 'FED-26Q1-CUT',
        question: 'Federal Reserve rate cut in Q1 2026?',
        yesPrice: 6500,
        noPrice: 3500,
      },
      spread: 3.0,
    },
    {
      poly: {
        id: 'poly_trump_2024',
        externalId: '0xtrump',
        question: 'Will Trump win 2024 election?',
        yesPrice: 5300,
        noPrice: 4700,
      },
      kalshi: {
        id: 'kalshi_pres_2024',
        externalId: 'PRES-2024-TRUMP',
        question: 'Trump wins presidency in 2024?',
        yesPrice: 5500,
        noPrice: 4500,
      },
      spread: 2.0,
    },
  ];

  for (const opp of opportunities) {
    const poly = await prisma.externalMarket.upsert({
      where: { id: opp.poly.id },
      update: {},
      create: {
        id: opp.poly.id,
        source: 'polymarket',
        externalId: opp.poly.externalId,
        question: opp.poly.question,
        yesPrice: opp.poly.yesPrice,
        noPrice: opp.poly.noPrice,
        volume: '500000',
        liquidity: '100000',
        endTime: new Date('2026-12-31'),
        status: 'active',
        sourceUrl: `https://polymarket.com/market/${opp.poly.id}`,
      },
    });

    const kalshi = await prisma.externalMarket.upsert({
      where: { id: opp.kalshi.id },
      update: {},
      create: {
        id: opp.kalshi.id,
        source: 'kalshi',
        externalId: opp.kalshi.externalId,
        question: opp.kalshi.question,
        yesPrice: opp.kalshi.yesPrice,
        noPrice: opp.kalshi.noPrice,
        volume: '300000',
        liquidity: '60000',
        endTime: new Date('2026-12-31'),
        status: 'active',
        sourceUrl: `https://kalshi.com/markets/${opp.kalshi.id}`,
      },
    });

    await prisma.matchedMarketPair.upsert({
      where: {
        polymarketId_kalshiId: {
          polymarketId: poly.id,
          kalshiId: kalshi.id,
        },
      },
      update: {},
      create: {
        polymarketId: poly.id,
        polymarketQuestion: poly.question,
        polymarketYesPrice: poly.yesPrice,
        polymarketNoPrice: poly.noPrice,
        polymarketVolume: poly.volume,
        kalshiId: kalshi.id,
        kalshiQuestion: kalshi.question,
        kalshiYesPrice: kalshi.yesPrice,
        kalshiNoPrice: kalshi.noPrice,
        kalshiVolume: kalshi.volume,
        similarity: 0.92,
        priceDifference: opp.spread,
        hasArbitrage: opp.spread > 0,
        isActive: true,
      },
    });

    console.log(`✅ Created opportunity: ${poly.question.slice(0, 40)}...`);
  }

  console.log('\n✨ Demo data seeded successfully!');
  console.log('\nYou can now:');
  console.log('1. Visit /api/arena/arbitrage-opportunities?minSpread=2');
  console.log('2. See 3 arbitrage opportunities');
  console.log('3. Create an arbitrage battle with the UI components');
  console.log('\n📊 Summary:');
  console.log(`- External Markets: 6`);
  console.log(`- Matched Pairs: 3`);
  console.log(`- Arbitrage Opportunities: 3`);
}

main()
  .catch((e) => {
    console.error('❌ Error seeding data:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
