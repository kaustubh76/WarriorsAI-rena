# Warriors AI Arena - Tournament Structure

> Complete tournament system design for launch and ongoing competitions

---

## Table of Contents

1. [Launch Tournament](#1-launch-tournament)
2. [Weekly Tournaments](#2-weekly-tournaments)
3. [Monthly Championships](#3-monthly-championships)
4. [Seasonal Leagues](#4-seasonal-leagues)
5. [Special Events](#5-special-events)
6. [Prize Distribution](#6-prize-distribution)
7. [Rules & Regulations](#7-rules--regulations)
8. [Technical Implementation](#8-technical-implementation)
9. [Marketing & Promotion](#9-marketing--promotion)

---

## 1. Launch Tournament

### "Genesis Clash" - Inaugural Championship

The first official tournament to celebrate the 0G mainnet launch.

```
┌─────────────────────────────────────────────────────────────┐
│                      GENESIS CLASH                          │
│              Warriors AI Arena Launch Tournament            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   Duration:     7 Days                                      │
│   Format:       Swiss System → Single Elimination Finals    │
│   Entry:        Free (must own warrior NFT)                 │
│   Prize Pool:   5,000 CRwN + Exclusive NFT Rewards          │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Schedule

| Phase | Days | Description |
|-------|------|-------------|
| Registration | Day 1-2 | Sign up warriors, verify ownership |
| Swiss Rounds | Day 3-5 | 5 rounds, all participants |
| Elimination | Day 6 | Top 16 single elimination |
| Finals | Day 7 | Semi-finals + Grand Final |

### Swiss Round Structure

```
ROUND 1: Random pairing
    │
    ▼
ROUND 2: Winners vs Winners, Losers vs Losers
    │
    ▼
ROUND 3: Match by record (2-0 vs 2-0, 1-1 vs 1-1, etc.)
    │
    ▼
ROUND 4: Continue matching by record
    │
    ▼
ROUND 5: Final swiss round
    │
    ▼
TOP 16 ADVANCE (by win count, then tiebreakers)
```

### Tiebreaker Rules

1. **Win Count** - Most wins advances
2. **Total Damage Dealt** - Higher damage breaks tie
3. **Total Damage Received** - Lower damage breaks tie
4. **Head-to-Head** - If tied players faced each other
5. **Opponent Win %** - Strength of schedule

### Single Elimination Bracket (Top 16)

```
                    CHAMPION
                        │
            ┌───────────┴───────────┐
         FINALS                  FINALS
            │                       │
     ┌──────┴──────┐         ┌──────┴──────┐
   SEMI          SEMI      SEMI          SEMI
     │             │         │             │
  ┌──┴──┐      ┌──┴──┐   ┌──┴──┐      ┌──┴──┐
 QF    QF     QF    QF  QF    QF     QF    QF
  │     │      │     │   │     │      │     │
 R16   R16   R16   R16 R16   R16    R16   R16
```

### Launch Tournament Prizes

| Place | CRwN Prize | NFT Reward | Title |
|-------|------------|------------|-------|
| 1st | 2,000 CRwN | Genesis Champion NFT | "Genesis Champion" |
| 2nd | 1,000 CRwN | Genesis Finalist NFT | "Genesis Finalist" |
| 3rd-4th | 500 CRwN each | Genesis Semi NFT | "Genesis Contender" |
| 5th-8th | 200 CRwN each | - | "Genesis Elite" |
| 9th-16th | 50 CRwN each | - | "Genesis Warrior" |
| All Participants | - | Participation Badge | - |

---

## 2. Weekly Tournaments

### "Arena Clash" - Weekly Competition

Recurring tournaments every week to maintain engagement.

```
┌─────────────────────────────────────────────────────────────┐
│                      ARENA CLASH                            │
│                   Weekly Tournament                         │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   Frequency:    Every Saturday                              │
│   Duration:     Single Day (4-6 hours)                      │
│   Format:       Double Elimination                          │
│   Entry Fee:    50 CRwN                                     │
│   Prize Pool:   Entry fees + 500 CRwN bonus                 │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Weekly Schedule

| Time (UTC) | Event |
|------------|-------|
| Saturday 12:00 | Registration Opens |
| Saturday 14:00 | Registration Closes |
| Saturday 14:30 | Bracket Reveal |
| Saturday 15:00 | Tournament Begins |
| Saturday 19:00 | Finals (Estimated) |
| Saturday 20:00 | Prize Distribution |

### Double Elimination Format

```
                    WINNERS BRACKET
                          │
    ┌─────────────────────┼─────────────────────┐
    │                     │                     │
   W1                    W2                    W3
    │                     │                     │
    └──────────┬──────────┘                     │
               │                                │
              WF ◄──────────────────────────────┘
               │
               │ (Winner to Grand Final)
               │
         GRAND FINAL ◄─── (Loser to Losers Bracket)
               │
               │
               ▼
           CHAMPION


                    LOSERS BRACKET
                          │
    ┌─────────────────────┼─────────────────────┐
    │                     │                     │
   L1                    L2                    L3
(W1 losers)         (W2 losers)          (L1 winners
    │                     │               vs W3 losers)
    └──────────┬──────────┘                     │
               │                                │
              L4 ◄──────────────────────────────┘
               │
              LF (Losers Final)
               │
               └──────► GRAND FINAL
```

### Weekly Prize Distribution

**Example: 32 Participants @ 50 CRwN entry**

```
Total Entry Pool:    1,600 CRwN
Bonus Pool:            500 CRwN
Tournament Cut (10%):  160 CRwN (to treasury)
Prize Pool:          1,940 CRwN

Distribution:
1st Place:    970 CRwN (50%)
2nd Place:    485 CRwN (25%)
3rd Place:    291 CRwN (15%)
4th Place:    194 CRwN (10%)
```

### Rank-Specific Tournaments

| Tournament | Ranks Allowed | Entry Fee | Day |
|------------|---------------|-----------|-----|
| Rookie Rumble | UNRANKED only | 25 CRwN | Saturday |
| Bronze Brawl | BRONZE only | 50 CRwN | Saturday |
| Silver Showdown | SILVER only | 100 CRwN | Saturday |
| Gold Glory | GOLD only | 200 CRwN | Sunday |
| Platinum Pinnacle | PLATINUM only | 500 CRwN | Sunday |
| Open Arena | All Ranks | 100 CRwN | Sunday |

---

## 3. Monthly Championships

### "Crown Circuit" - Monthly Major

Premium monthly event with larger prizes and prestige.

```
┌─────────────────────────────────────────────────────────────┐
│                     CROWN CIRCUIT                           │
│                  Monthly Championship                       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   Frequency:    Last weekend of each month                  │
│   Duration:     2 Days (Saturday + Sunday)                  │
│   Format:       Group Stage → Playoffs                      │
│   Entry:        Qualification required OR 200 CRwN buy-in   │
│   Prize Pool:   10,000 CRwN minimum                         │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Qualification Paths

```
┌─────────────────────────────────────────────────────────────┐
│                  WAYS TO QUALIFY                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. WEEKLY POINTS                                           │
│     Top 4 finishers in weekly tournaments earn points       │
│     Top 16 point earners qualify automatically              │
│                                                             │
│  2. LEADERBOARD                                             │
│     Top 8 on monthly battle leaderboard qualify             │
│                                                             │
│  3. LAST CHANCE QUALIFIER                                   │
│     Friday before championship - open tournament            │
│     Top 8 finishers qualify                                 │
│                                                             │
│  4. BUY-IN                                                  │
│     Pay 200 CRwN entry fee for remaining spots              │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Monthly Format

**Day 1 - Group Stage (Saturday)**

```
32 Players → 8 Groups of 4

GROUP A          GROUP B          GROUP C    ...
┌─────┐          ┌─────┐          ┌─────┐
│ P1  │          │ P1  │          │ P1  │
│ P2  │          │ P2  │          │ P2  │
│ P3  │          │ P3  │          │ P3  │
│ P4  │          │ P4  │          │ P4  │
└─────┘          └─────┘          └─────┘

Round Robin within groups (each player fights 3 times)
Top 2 from each group advance (16 players)
```

**Day 2 - Playoffs (Sunday)**

```
16 Players → Single Elimination

        QUARTER FINALS (8 matches)
                 │
                 ▼
        SEMI FINALS (4 matches)
                 │
                 ▼
        3RD PLACE MATCH
                 │
                 ▼
          GRAND FINAL
```

### Monthly Championship Prizes

| Place | CRwN Prize | Exclusive Reward |
|-------|------------|------------------|
| 1st | 4,000 CRwN | Monthly Champion NFT + Title |
| 2nd | 2,500 CRwN | Monthly Finalist NFT |
| 3rd | 1,500 CRwN | Monthly Podium NFT |
| 4th | 1,000 CRwN | - |
| 5th-8th | 250 CRwN each | - |

### Circuit Points System

Points earned contribute to seasonal rankings:

| Weekly Finish | Points | Monthly Finish | Points |
|---------------|--------|----------------|--------|
| 1st | 100 | 1st | 500 |
| 2nd | 75 | 2nd | 350 |
| 3rd | 50 | 3rd | 250 |
| 4th | 35 | 4th | 175 |
| 5th-8th | 20 | 5th-8th | 100 |
| 9th-16th | 10 | 9th-16th | 50 |
| Participation | 5 | Participation | 25 |

---

## 4. Seasonal Leagues

### "Eternal Glory" - Seasonal Championship

3-month seasons culminating in a major championship.

```
┌─────────────────────────────────────────────────────────────┐
│                     ETERNAL GLORY                           │
│                  Seasonal Championship                      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   Season Length:   3 Months (12 weeks)                      │
│   Format:          Circuit Points Accumulation              │
│   Finals:          Top 32 compete for seasonal title        │
│   Prize Pool:      50,000 CRwN + Major NFT Rewards          │
│                                                             │
│   Seasons:                                                  │
│   - Season 1: Genesis (Jan-Mar)                             │
│   - Season 2: Rising (Apr-Jun)                              │
│   - Season 3: Conquest (Jul-Sep)                            │
│   - Season 4: Legends (Oct-Dec)                             │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Season Structure

```
WEEK 1-11: Accumulate Circuit Points
    │
    ├── Weekly Tournaments (12 events)
    ├── Monthly Championships (3 events)
    ├── Leaderboard Battles (ongoing)
    └── Special Events (varies)
    │
    ▼
WEEK 12: Season Finals
    │
    ├── Top 32 by Circuit Points qualify
    ├── 2-day championship event
    └── Seasonal Champion crowned
```

### Seasonal Finals Format

**Day 1 - Group Stage**
- 32 players → 8 groups of 4
- Round robin within groups
- Top 2 advance (16 players)

**Day 2 - Championship Bracket**
- 16 players single elimination
- Best-of-3 matches (Semi-finals onward)
- Grand Final: Best-of-5

### Seasonal Prizes

| Place | CRwN Prize | Exclusive Reward |
|-------|------------|------------------|
| Champion | 20,000 CRwN | Seasonal Legend NFT + Animated Title |
| 2nd | 10,000 CRwN | Seasonal Master NFT |
| 3rd-4th | 5,000 CRwN each | Seasonal Elite NFT |
| 5th-8th | 2,000 CRwN each | - |
| 9th-16th | 500 CRwN each | - |
| 17th-32nd | 250 CRwN each | Seasonal Competitor Badge |

### Season Pass (Optional Future Feature)

```
┌─────────────────────────────────────────────────────────────┐
│                     SEASON PASS                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   Cost: 500 CRwN per season                                 │
│                                                             │
│   Benefits:                                                 │
│   ├── Free entry to all weekly tournaments                  │
│   ├── Exclusive season cosmetics                            │
│   ├── Bonus circuit points (+10%)                           │
│   ├── Priority registration for events                      │
│   └── Season-exclusive warrior skins                        │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 5. Special Events

### Event Calendar

| Event | Frequency | Description |
|-------|-----------|-------------|
| Genesis Clash | Once | Launch tournament |
| Underdog Cup | Monthly | Low-rank warriors only |
| Chaos Arena | Monthly | Random trait modifications |
| Celebrity Showdown | Quarterly | Influencer/partner battles |
| Community Cup | Quarterly | Community-voted rules |
| Anniversary Tournament | Yearly | Birthday celebration |

### Underdog Cup

```
┌─────────────────────────────────────────────────────────────┐
│                     UNDERDOG CUP                            │
│            For UNRANKED & BRONZE Warriors Only              │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   Eligibility:  Warriors ranked UNRANKED or BRONZE          │
│   Entry:        Free                                        │
│   Format:       Single Elimination                          │
│   Prize:        Winner gets promoted + bonus traits         │
│                                                             │
│   Purpose:      Give new players competitive experience     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Chaos Arena

```
┌─────────────────────────────────────────────────────────────┐
│                     CHAOS ARENA                             │
│               Where Anything Can Happen                     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   Special Rules (randomly applied each match):              │
│                                                             │
│   - STAT SWAP: Two random traits are swapped               │
│   - MIRROR MODE: Both warriors have identical stats         │
│   - LUCK SURGE: All luck values doubled                     │
│   - DEFENSE DOWN: All defense reduced by 50%                │
│   - CRITICAL CHAOS: Success rates inverted                  │
│   - HEALING BANNED: RECOVER move disabled                   │
│   - SPEED BATTLE: Only 3 rounds instead of 5                │
│                                                             │
│   Entry:        100 CRwN                                    │
│   Prize:        2x entry pool to winner                     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Celebrity Showdown

Partner with influencers and Web3 personalities:

```
Format:
1. Invite 8-16 influencers/partners
2. Each mints or is gifted a warrior
3. Round-robin group stage
4. Single elimination playoffs
5. Stream live on Twitter/YouTube

Benefits:
- Exposure to influencer audiences
- Content creation opportunities
- Community engagement
- Partnership building
```

### Community Cup

Let the community design tournament rules:

```
Week 1: Rule Proposals
    │
    ▼
Week 2: Community Vote
    │
    ▼
Week 3: Tournament with Winning Rules
    │
    ▼
Week 4: Results & Next Proposal Cycle
```

**Example Community Rule Proposals:**
- "Only warriors minted in the last 30 days"
- "Single-stat tournament (highest STR only)"
- "Team battles (2v2 combined damage)"
- "Reverse ranking (lowest ranked warrior wins ties)"

---

## 6. Prize Distribution

### Prize Pool Sources

```
┌─────────────────────────────────────────────────────────────┐
│                   PRIZE POOL FUNDING                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   1. ENTRY FEES                                             │
│      90% of entry fees go to prize pool                     │
│      10% to tournament treasury                             │
│                                                             │
│   2. TREASURY ALLOCATION                                    │
│      Monthly budget for guaranteed prize pools              │
│      Funded by platform fees (5% of all bets)               │
│                                                             │
│   3. SPONSORSHIPS                                           │
│      Partner contributions to special events                │
│      Ecosystem grants from 0G                               │
│                                                             │
│   4. COMMUNITY POOL                                         │
│      Optional donations from community                      │
│      Used for bonus prizes                                  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Standard Distribution Formula

```
1st Place:    40% of prize pool
2nd Place:    25% of prize pool
3rd Place:    15% of prize pool
4th Place:    10% of prize pool
5th-8th:      2.5% each (10% total)
```

### NFT Rewards Tiers

| Tier | Awarded For | Rarity |
|------|-------------|--------|
| Champion | 1st place in Monthly/Seasonal | Legendary |
| Finalist | 2nd place in Monthly/Seasonal | Epic |
| Podium | 3rd-4th place in Monthly/Seasonal | Rare |
| Competitor | Top 16 in any tournament | Uncommon |
| Participant | Any tournament participation | Common |

### Title System

Permanent titles displayed on warrior profiles:

| Title | Requirement |
|-------|-------------|
| "Genesis Champion" | Win Genesis Clash |
| "Weekly Warrior" | Win any weekly tournament |
| "Monthly Master" | Win monthly championship |
| "Seasonal Legend" | Win seasonal finals |
| "Underdog Hero" | Win Underdog Cup |
| "Chaos Survivor" | Win Chaos Arena |
| "Triple Crown" | Win Weekly + Monthly + Seasonal |
| "Undefeated" | Win tournament without losing |

---

## 7. Rules & Regulations

### General Tournament Rules

```
┌─────────────────────────────────────────────────────────────┐
│                    TOURNAMENT RULES                         │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   ELIGIBILITY                                               │
│   1. Must own warrior NFT in registered wallet              │
│   2. One warrior per wallet per tournament                  │
│   3. Warrior must meet rank requirements                    │
│   4. Entry fee must be paid before registration closes      │
│                                                             │
│   MATCH RULES                                               │
│   5. Standard 5-round battle format                         │
│   6. AI controls all warrior moves                          │
│   7. No player intervention during battle                   │
│   8. Lowest total damage wins                               │
│   9. Ties broken by tiebreaker rules                        │
│                                                             │
│   CONDUCT                                                   │
│   10. No exploiting bugs or vulnerabilities                 │
│   11. No collusion between players                          │
│   12. No intentional disconnection/abandonment              │
│   13. Respect all participants and staff                    │
│                                                             │
│   DISPUTES                                                  │
│   14. All battles verified on-chain (final)                 │
│   15. Technical issues reviewed by tournament admin         │
│   16. Admin decisions are final                             │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Disqualification Offenses

| Offense | Penalty |
|---------|---------|
| Missed match (no-show) | Match forfeit |
| Bug exploitation | Tournament DQ + potential ban |
| Collusion | Both players DQ + season ban |
| Multiple entries | All entries DQ |
| Harassment | Immediate DQ + ban review |
| Wallet manipulation | Permanent ban |

### Match Dispute Process

```
1. Player reports issue within 10 minutes of match end
       │
       ▼
2. Tournament admin reviews on-chain data
       │
       ▼
3. Admin makes ruling within 30 minutes
       │
       ▼
4. Ruling is final (on-chain data is immutable)
```

### Fair Play Guidelines

- **Sportsmanship**: Win gracefully, lose gracefully
- **No sandbagging**: Don't intentionally lose to manipulate brackets
- **Report bugs**: If you find an exploit, report it
- **Help newcomers**: Community strength benefits everyone

---

## 8. Technical Implementation

### Tournament Smart Contract

```solidity
// Tournament.sol - Key Functions

struct Tournament {
    uint256 id;
    string name;
    uint256 entryFee;
    uint256 prizePool;
    uint256 maxParticipants;
    uint256 startTime;
    uint256 endTime;
    TournamentStatus status;
    RankRequirement rankReq;
}

struct Registration {
    address player;
    uint256 warriorId;
    uint256 timestamp;
    bool isActive;
}

struct Match {
    uint256 tournamentId;
    uint256 round;
    uint256 warrior1;
    uint256 warrior2;
    uint256 winner;
    uint256 warrior1Damage;
    uint256 warrior2Damage;
}

// Core functions
function createTournament(params) external onlyAdmin;
function register(uint256 warriorId) external payable;
function recordMatch(uint256 matchId, uint256 winner) external onlyArena;
function distributePrizes(uint256 tournamentId) external onlyAdmin;
function claimPrize(uint256 tournamentId) external;
```

### Backend Tournament Service

```typescript
// tournamentService.ts

interface TournamentManager {
  // Registration
  openRegistration(tournamentId: string): Promise<void>;
  closeRegistration(tournamentId: string): Promise<void>;
  registerParticipant(tournamentId: string, warriorId: string): Promise<void>;

  // Bracket Management
  generateBracket(tournamentId: string, format: BracketFormat): Promise<Bracket>;
  advanceWinner(matchId: string, winnerId: string): Promise<void>;

  // Match Execution
  scheduleMatch(matchId: string, time: Date): Promise<void>;
  executeMatch(matchId: string): Promise<MatchResult>;

  // Results
  calculateStandings(tournamentId: string): Promise<Standing[]>;
  distributePrizes(tournamentId: string): Promise<void>;
}
```

### Bracket Generation Algorithm

```typescript
// Swiss pairing algorithm
function swissPairing(players: Player[], round: number): Match[] {
  // Sort by current score
  const sorted = players.sort((a, b) => b.wins - a.wins);

  const matches: Match[] = [];
  const paired = new Set<string>();

  for (const player of sorted) {
    if (paired.has(player.id)) continue;

    // Find opponent with same score who hasn't played this player
    const opponent = sorted.find(p =>
      !paired.has(p.id) &&
      p.id !== player.id &&
      p.wins === player.wins &&
      !player.previousOpponents.includes(p.id)
    );

    if (opponent) {
      matches.push({ player1: player, player2: opponent });
      paired.add(player.id);
      paired.add(opponent.id);
    }
  }

  return matches;
}
```

### Database Schema

```sql
-- tournaments table
CREATE TABLE tournaments (
  id UUID PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  format VARCHAR(50) NOT NULL,
  entry_fee DECIMAL(18,2),
  prize_pool DECIMAL(18,2),
  max_participants INT,
  rank_requirement VARCHAR(20),
  start_time TIMESTAMP,
  end_time TIMESTAMP,
  status VARCHAR(20),
  created_at TIMESTAMP DEFAULT NOW()
);

-- registrations table
CREATE TABLE registrations (
  id UUID PRIMARY KEY,
  tournament_id UUID REFERENCES tournaments(id),
  wallet_address VARCHAR(42) NOT NULL,
  warrior_id INT NOT NULL,
  registered_at TIMESTAMP DEFAULT NOW(),
  is_active BOOLEAN DEFAULT true
);

-- matches table
CREATE TABLE matches (
  id UUID PRIMARY KEY,
  tournament_id UUID REFERENCES tournaments(id),
  round INT NOT NULL,
  bracket_position INT,
  warrior1_id INT NOT NULL,
  warrior2_id INT NOT NULL,
  winner_id INT,
  warrior1_damage INT,
  warrior2_damage INT,
  battle_tx_hash VARCHAR(66),
  completed_at TIMESTAMP
);

-- standings table
CREATE TABLE standings (
  id UUID PRIMARY KEY,
  tournament_id UUID REFERENCES tournaments(id),
  wallet_address VARCHAR(42) NOT NULL,
  warrior_id INT NOT NULL,
  wins INT DEFAULT 0,
  losses INT DEFAULT 0,
  damage_dealt INT DEFAULT 0,
  damage_received INT DEFAULT 0,
  circuit_points INT DEFAULT 0,
  final_position INT
);
```

### API Endpoints

```
Tournament Management:
POST   /api/tournaments                    - Create tournament
GET    /api/tournaments                    - List tournaments
GET    /api/tournaments/:id                - Get tournament details
PUT    /api/tournaments/:id/status         - Update status

Registration:
POST   /api/tournaments/:id/register       - Register for tournament
DELETE /api/tournaments/:id/register       - Withdraw registration
GET    /api/tournaments/:id/participants   - List participants

Brackets:
GET    /api/tournaments/:id/bracket        - Get current bracket
POST   /api/tournaments/:id/generate       - Generate bracket
GET    /api/tournaments/:id/matches        - List all matches
GET    /api/tournaments/:id/matches/:round - Get round matches

Results:
GET    /api/tournaments/:id/standings      - Get standings
POST   /api/tournaments/:id/distribute     - Distribute prizes
GET    /api/tournaments/:id/prizes         - Get prize distribution
```

---

## 9. Marketing & Promotion

### Pre-Tournament Promotion

**1 Week Before:**
```
- Announcement tweet thread
- Discord event creation
- Registration opens
- Prize pool reveal
```

**3 Days Before:**
```
- Participant spotlight posts
- Bracket predictions thread
- Reminder announcements
- Build hype with countdowns
```

**1 Day Before:**
```
- Final registration reminder
- Full participant list
- Match schedule reveal
- Pre-tournament predictions
```

### During Tournament

```
- Live tweet match results
- Update brackets in real-time
- Highlight exciting moments
- Interview winners between rounds
- Community predictions for next round
```

### Post-Tournament

```
- Champion announcement post
- Full results thread
- Highlight reel (if video)
- Winner interview/spotlight
- Announce next tournament
- Prize distribution confirmation
```

### Content Templates

**Tournament Announcement:**
```
TOURNAMENT ANNOUNCEMENT

[Tournament Name] is coming!

Format: [Format]
Date: [Date]
Entry: [Fee]
Prize Pool: [Amount]

Registration opens [Date]

Who's ready to compete?

[Link to register]
```

**Match Result:**
```
MATCH RESULT

[Warrior A] vs [Warrior B]

Round-by-round:
R1: [Move] vs [Move]
R2: [Move] vs [Move]
R3: [Move] vs [Move]
R4: [Move] vs [Move]
R5: [Move] vs [Move]

Final: [Winner] wins!
Damage: [X] vs [Y]

[Tournament Name] - [Round]
```

**Champion Announcement:**
```
YOUR [TOURNAMENT NAME] CHAMPION

Congratulations to [Winner]!

[Warrior Name] dominated the competition:
- [X] battles won
- [Y] total damage dealt
- [Z] damage taken

Prize: [Amount] CRwN + [NFT Reward]

The arena has crowned its champion.
```

---

## Appendix: Quick Reference

### Tournament Formats Summary

| Format | Best For | Duration |
|--------|----------|----------|
| Swiss | Large groups, fair matching | Multi-day |
| Single Elimination | Quick, dramatic | Single day |
| Double Elimination | Second chances | Single day |
| Round Robin | Small groups, complete rankings | Multi-day |
| Group → Playoffs | Large tournaments, comprehensive | Multi-day |

### Entry Fee Guidelines

| Tournament Type | Recommended Entry |
|-----------------|-------------------|
| Beginner/Rookie | Free or 25 CRwN |
| Weekly Standard | 50-100 CRwN |
| Monthly Championship | 100-200 CRwN |
| Seasonal Finals | Qualification or 500 CRwN |
| Special Events | Varies |

### Prize Pool Guidelines

| Total Participants | Minimum Prize Pool |
|--------------------|--------------------|
| 8-16 | 500 CRwN |
| 17-32 | 1,000 CRwN |
| 33-64 | 2,500 CRwN |
| 65-128 | 5,000 CRwN |
| 129+ | 10,000 CRwN |

---

*Tournament system ready for implementation. Adjust values based on community size and tokenomics.*
