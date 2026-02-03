let totalFeesPaid = 0;
let totalTrades = 0;

export const trackTrade = (fee: number) => {
    totalFeesPaid += fee;
    totalTrades += 1;
};

export const getStats = () => ({
    totalFeesPaid,
    totalTrades,
    estimatedSolLoss: totalFeesPaid + (totalTrades * 0.0005)
});