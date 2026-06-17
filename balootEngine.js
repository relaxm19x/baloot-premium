const SUITS = ['♠', '♥', '♦', '♣'];

const CARD_VALUES = {
    'صن': {
        '7':  { rank: 1, points: 0 },
        '8':  { rank: 2, points: 0 },
        '9':  { rank: 3, points: 0 },
        'J':  { rank: 4, points: 2 },
        'Q':  { rank: 5, points: 3 },
        'K':  { rank: 6, points: 4 },
        '10': { rank: 7, points: 10 },
        'A':  { rank: 8, points: 11 }
    },
    'حكم': {
        '7':  { rank: 1, points: 0 },
        '8':  { rank: 2, points: 0 },
        'Q':  { rank: 3, points: 3 },
        'K':  { rank: 4, points: 4 },
        '10': { rank: 5, points: 10 },
        'A':  { rank: 6, points: 11 },
        '9':  { rank: 7, points: 14 },
        'J':  { rank: 8, points: 20 }
    }
};

const SEQUENCE_ORDER = { '7':1, '8':2, '9':3, '10':4, 'J':5, 'Q':6, 'K':7, 'A':8 };

function createDeck() {
    let deck = [];
    for (let suit of SUITS) {
        for (let value of ['7', '8', '9', '10', 'J', 'Q', 'K', 'A']) {
            deck.push({ value: value, suit: suit });
        }
    }
    return deck;
}

function shuffleDeck(deck) {
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
}

function dealInitialCards(deck) {
    let playersCards = { 0: [], 1: [], 2: [], 3: [] };
    let currentDeck = [...deck];
    for (let round = 0; round < 2; round++) {
        for (let player = 0; player < 4; player++) {
            let count = (round === 0) ? 3 : 2;
            for (let c = 0; c < count; c++) {
                playersCards[player].push(currentDeck.pop());
            }
        }
    }
    let flipCard = currentDeck.pop();
    return { playersCards, flipCard, remainingDeck: currentDeck };
}

function dealRemainingCards(deck, buyerSeatIndex) {
    let playersCardsUpdate = { 0: [], 1: [], 2: [], 3: [] };
    let currentDeck = [...deck];
    for (let player = 0; player < 4; player++) {
        let count = (player === buyerSeatIndex) ? 2 : 3;
        for (let c = 0; c < count; c++) {
            if (currentDeck.length > 0) {
                playersCardsUpdate[player].push(currentDeck.pop());
            }
        }
    }
    return { playersCardsUpdate, remainingDeck: currentDeck };
}

function determineTrickWinner(tableCards, gameType, trumpSuit) {
    if (!tableCards || tableCards.length === 0) return null;
    const leadingSuit = tableCards[0].card.suit;
    let winningIndex = 0;
    let bestCard = tableCards[0].card;
    let totalPoints = 0;

    tableCards.forEach((item, index) => {
        const card = item.card;
        const isCurrentCardTrump = (gameType === 'حكم' && card.suit === trumpSuit);
        const mode = isCurrentCardTrump ? 'حكم' : 'صن';
        const cardData = CARD_VALUES[mode][card.value];
        totalPoints += cardData ? cardData.points : 0;

        if (index === 0) return;
        let isNewCardBetter = false;

        if (gameType === 'حكم') {
            const isBestCardTrump = (bestCard.suit === trumpSuit);
            if (isCurrentCardTrump && !isBestCardTrump) {
                isNewCardBetter = true;
            } else if (isCurrentCardTrump && isBestCardTrump) {
                if (CARD_VALUES['حكم'][card.value].rank > CARD_VALUES['حكم'][bestCard.value].rank) {
                    isNewCardBetter = true;
                }
            } else if (!isCurrentCardTrump && !isBestCardTrump) {
                if (card.suit === leadingSuit && bestCard.suit !== leadingSuit) {
                    isNewCardBetter = true;
                } else if (card.suit === leadingSuit && bestCard.suit === leadingSuit) {
                    if (CARD_VALUES['صن'][card.value].rank > CARD_VALUES['صن'][bestCard.value].rank) {
                        isNewCardBetter = true;
                    }
                }
            }
        } else {
            if (card.suit === leadingSuit && bestCard.suit !== leadingSuit) {
                isNewCardBetter = true;
            } else if (card.suit === leadingSuit && bestCard.suit === leadingSuit) {
                if (CARD_VALUES['صن'][card.value].rank > CARD_VALUES['صن'][bestCard.value].rank) {
                    isNewCardBetter = true;
                }
            }
        }

        if (isNewCardBetter) {
            bestCard = card;
            winningIndex = index;
        }
    });

    return { winnerSeatIndex: tableCards[winningIndex].seatIndex, pointsGained: totalPoints };
}

function isValidMove(card, playerHand, tableCards, gameType, trumpSuit) {
    if (!tableCards || tableCards.length === 0) return true;
    const leadingSuit = tableCards[0].card.suit;
    const hasLeadingSuit = playerHand.some(c => c.suit === leadingSuit);

    if (hasLeadingSuit && card.suit !== leadingSuit) return false;

    if (gameType === 'حكم' && !hasLeadingSuit) {
        const hasTrumpCards = playerHand.some(c => c.suit === trumpSuit);
        if (hasTrumpCards && card.suit !== trumpSuit) {
            const currentWinnerInfo = determineTrickWinner(tableCards, gameType, trumpSuit);
            const myPartnerSeat = (tableCards[0].seatIndex + 2) % 4;
            if (currentWinnerInfo && currentWinnerInfo.winnerSeatIndex === myPartnerSeat) return true;
            return false; 
        }
    }
    return true;
}

function checkPlayerProjects(hand, gameType, trumpSuit) {
    if (!hand || hand.length < 8) return { name: "لا يوجد", points: 0 };

    if (gameType === 'حكم' && trumpSuit) {
        const hasKing = hand.some(c => c.value === 'K' && c.suit === trumpSuit);
        const hasQueen = hand.some(c => c.value === 'Q' && c.suit === trumpSuit);
        if (hasKing && hasQueen) return { name: "بلوت (ملك وملكة الحكم)", points: 20 };
    }

    let valueCounts = {};
    hand.forEach(c => valueCounts[c.value] = (valueCounts[c.value] || 0) + 1);
    
    if (gameType === 'صن' && valueCounts['A'] === 4) {
        return { name: "أربعمية (400 آس)", points: 400 }; 
    }

    for (let val of ['A', 'K', 'Q', 'J', '10']) {
        if (valueCounts[val] === 4) return { name: "مئة (4 متشابهة)", points: 100 };
    }

    let suitGroups = { '♠': [], '♥': [], '♦': [], '♣': [] };
    hand.forEach(c => {
        if (SEQUENCE_ORDER[c.value]) suitGroups[c.suit].push(SEQUENCE_ORDER[c.value]);
    });

    let maxSequence = 0;
    for (let suit in suitGroups) {
        let sorted = suitGroups[suit].sort((a, b) => a - b);
        let currentSeq = 1;
        let localMax = 0;
        for (let i = 0; i < sorted.length - 1; i++) {
            if (sorted[i+1] === sorted[i] + 1) {
                currentSeq++;
            } else if (sorted[i+1] !== sorted[i]) {
                if (currentSeq > localMax) localMax = currentSeq;
                currentSeq = 1;
            }
        }
        if (currentSeq > localMax) localMax = currentSeq;
        if (localMax > maxSequence) maxSequence = localMax;
    }

    if (maxSequence >= 5) return { name: "مئة (100 متسلسلة)", points: 100 };
    if (maxSequence === 4) return { name: "خمسين (50 متسلسلة)", points: 50 };
    if (maxSequence === 3) return { name: "سرا (3 متسلسلة)", points: 20 };

    return { name: "لا يوجد", points: 0 };
}

module.exports = {
    createDeck, shuffleDeck, dealInitialCards, dealRemainingCards, determineTrickWinner, isValidMove, checkPlayerProjects
};