let totalFeesPaid = 0;
let totalTrades = 0;
let lastAlertedPrice: number | null = null;

export const checkPriceAlert = (currentPrice: number) => {
    if (!lastAlertedPrice) {
        lastAlertedPrice = currentPrice;
        return;
    }

    const priceChange = ((currentPrice - lastAlertedPrice) / lastAlertedPrice) * 100;

    if (Math.abs(priceChange) >= 10) {
        const direction = priceChange > 0 ? "🚀 UP" : "🔻 DOWN";
        const message = `[ALERT] Price moved ${direction} by ${Math.abs(priceChange).toFixed(2)}%!`;
        
        console.log(`\x1b[33m%s\x1b[0m`, message);
        console.log(`Current: $${currentPrice.toFixed(6)} | Last: $${lastAlertedPrice.toFixed(6)}`);

        lastAlertedPrice = currentPrice;
        
        return message;
    }
    return null;
};

export const trackTrade = (fee: number) => {
    totalFeesPaid += fee;
    totalTrades += 1;
};

export const getStats = () => ({
    totalFeesPaid,
    totalTrades,
    estimatedSolLoss: totalFeesPaid + (totalTrades * 0.0005)
});

interface VirtualPosition {
    entryPrice: number;
    amountTokens: number;
    totalInvested: number;
}

const activePositions = new Map<string, VirtualPosition>();

export const trackSimulatedTrade = (
    token: string, 
    action: "BUY" | "SELL", 
    price: number, 
    amountSol: number
) => {
    if (action === "BUY") {
        const tokensBought = amountSol / price;
        const current = activePositions.get(token) || { entryPrice: 0, amountTokens: 0, totalInvested: 0 };
        
        activePositions.set(token, {
            entryPrice: price, 
            amountTokens: current.amountTokens + tokensBought,
            totalInvested: current.totalInvested + amountSol
        });
        
        console.log(`[SIM-STATS] Buy Logged: ${tokensBought.toFixed(2)} tokens at $${price.toFixed(6)}`);
    } else {
        const position = activePositions.get(token);
        if (!position) return { pnlSol: 0, pnlPercent: 0 };

        const revenueSol = position.amountTokens * price;
        const pnlSol = revenueSol - position.totalInvested;
        const pnlPercent = (pnlSol / position.totalInvested) * 100;

        console.log(`[SIM-STATS] Sell Logged: Total PnL: ${pnlSol.toFixed(4)} SOL (${pnlPercent.toFixed(2)}%)`);
        
        activePositions.delete(token);
        return { pnlSol, pnlPercent };
    }
};