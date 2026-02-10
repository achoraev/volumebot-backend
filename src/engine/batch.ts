import { Connection, Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { generateSubWallets, distributeSol, reclaimAllFunds, clearSubWallets } from './utils';
import { executeSwap } from './jupiter';
import bs58 from "bs58";

export const startMakerCampaign = async (
    connection: Connection,
    mainWallet: Keypair,
    tokenAddr: string,
    targetTotalMakers: number, // e.g., 100
    settings: any
) => {
    let makersCreated = 0;

    while (makersCreated < targetTotalMakers) {
        console.log(`\n🚀 [BATCH] Starting batch for makers ${makersCreated + 1} - ${makersCreated + 10}`);

        // 1. Create fresh batch of 10
        const batchSize = 10;
        const walletsData = generateSubWallets(batchSize);
        const subWallets = walletsData.map(d => Keypair.fromSecretKey(bs58.decode(d.privateKey)));

        // 2. Fund the batch
        await distributeSol(connection, mainWallet, 0.05); // Fund with enough for 3 buys + fees

        // 3. Execute 30 trades across these 10 wallets
        // (Randomly pick a wallet from the batch for each of the 30 trades)
        for (let i = 0; i < 30; i++) {
            const currentWallet = subWallets[Math.floor(Math.random() * subWallets.length)];
            
            try {
                await executeSwap(
                    connection, 
                    currentWallet, 
                    tokenAddr, 
                    "BUY", 
                    false, // Live trading
                    settings.buyAmount
                );
                // Random delay between trades in a batch
                await new Promise(r => setTimeout(r, 2000 + Math.random() * 3000));
            } catch (err) {
                if (err instanceof Error) {
                    console.error(`[TRADE ERROR] Trade ${i+1} failed:`, err.message);
                } else {
                    console.error(`[TRADE ERROR] Trade ${i+1} failed:`, err);
                }
            }
        }

        // 4. Reclaim and Cleanup
        console.log(`🧹 [CLEANUP] Batch finished. Reclaiming SOL...`);
        await reclaimAllFunds(connection, mainWallet);
        clearSubWallets(); // Delete the json file so the next batch is fresh

        makersCreated += batchSize;
        console.log(`✅ [PROGRESS] Total Makers hit: ${makersCreated}/${targetTotalMakers}`);
    }

    console.log("🏁 [CAMPAIGN COMPLETE] Target makers reached.");
};