import { createVolume } from "../engine/jupiter";
import { loadWallets } from "../engine/wallet";

export async function startVolumeLoop(tokenAddr: string) {
    const wallets = await loadWallets();
    
    async function runSingleTrade() {
        // 1. Pick a random child wallet from your list
        const randomWallet = wallets[Math.floor(Math.random() * wallets.length)];
        
        // 2. Pick a random amount (e.g., between 0.01 and 0.02 SOL)
        const randomAmount = (Math.random() * (0.02 - 0.01) + 0.01).toFixed(4);

        console.log(`[LOOP] Wallet ${randomWallet.publicKey.toBase58().slice(0,6)} trading ${randomAmount} SOL`);

        try {
            await createVolume(randomWallet, tokenAddr, parseFloat(randomAmount));
        } catch (err) {
            console.error("Trade failed, skipping to next...");
        }

        // 3. Set a random delay before the next trade (e.g., 30 to 60 seconds)
        const nextDelay = Math.floor(Math.random() * (60000 - 30000) + 30000);
        
        console.log(`Next trade in ${nextDelay / 1000} seconds...`);
        setTimeout(runSingleTrade, nextDelay);
    }

    runSingleTrade();
}