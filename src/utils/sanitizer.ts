export function sanitizeSettings(rawSettings: any) {
    return {
        minAmount: parseFloat(rawSettings.minAmmount || rawSettings.minAmount || 0.01),
        maxAmount: parseFloat(rawSettings.maxAmmount || rawSettings.maxAmount || 0.02),
        
        minBuys: Math.max(1, parseInt(rawSettings.minBuys || 1)),
        maxBuys: Math.max(1, parseInt(rawSettings.maxBuys || 3)),
        
        minDelay: Math.max(1, parseInt(rawSettings.minDelay || 10)),
        maxDelay: Math.max(1, parseInt(rawSettings.maxDelay || 30)),
        
        buyAmount: parseFloat(rawSettings.buyAmount || rawSettings.minAmount || 0.01)
    };
}