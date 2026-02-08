
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { activeBots } from '../logic/looper';
import { executeSwap } from '../engine/jupiter';
import { checkPriceAlert } from '../logic/tracker';

export async function runVolumeLoop(wallet: Keypair, token: string, settings: any, signal: AbortSignal) {
    let buyCount = 0;
    let targetBuys = Math.floor(Math.random() * (settings.maxBuys - settings.minBuys + 1)) + settings.minBuys;
    const connection = new Connection(process.env.RPC_URL!);
    const dryRun = settings.dryRun;

    console.log(`[LOOP] Starting volume for ${token}. Initial target: ${targetBuys} buys. Mode: ${dryRun ? 'DRY' : 'LIVE'}`);

    if (signal.aborted) return;

    while (activeBots.get(token) === true) {

        if (signal.aborted) {
            console.log(`[LOOP] 🛑 Stop signal received for ${token}. Exiting loop...`);
            break;
        }

        try {
            if (buyCount < targetBuys) {
                const min = parseFloat(settings.minAmount || 0.01);
                const max = parseFloat(settings.maxAmount || 0.02);
                const randomBuyAmount = Math.random() * (max - min) + min;
                const finalAmount = parseFloat(randomBuyAmount.toFixed(4));

                if (isNaN(finalAmount)) {
                    throw new Error("Invalid Buy Amount: Calculations resulted in NaN. Check settings keys.");
                }

                console.log(`[LOOP] Step ${buyCount + 1}/${targetBuys}: BUY ${finalAmount} SOL`);
                await executeSwap(connection, wallet, token, "BUY", dryRun, finalAmount);
                buyCount++;
            } else {
                console.log(`[LOOP] Target ${targetBuys} reached. Preparing to SELL ALL...`);

                if (dryRun) {
                    await executeSwap(connection, wallet, token, "SELL", true, 0);
                } else {
                    const balance = await getTokenBalance(connection, wallet.publicKey, token);
                    
                    if (balance > 0) {
                        console.log(`[SELL] Selling balance: ${balance} (raw units)`);
                        await executeSwap(connection, wallet, token, "SELL", false, balance);
                    } else {
                        console.log("[SELL] No tokens found to sell. Skipping to next cycle.");
                    }
                }

                buyCount = 0;
                targetBuys = Math.floor(Math.random() * (settings.maxBuys - settings.minBuys + 1)) + settings.minBuys;
                console.log(`[LOOP] Cycle reset. New target: ${targetBuys} buys.`);
            }

            const minD = parseInt(settings.minDelay || 10);
            const maxD = parseInt(settings.maxDelay || 30);
            const delay = Math.floor(Math.random() * (maxD - minD + 1) + minD) * 1000;
            
            console.log(`[WAIT] Sleeping for ${delay / 1000}s...`);

            await sleepWithAbort(delay * 1000, signal);

            await new Promise((resolve, reject) => {
                const timer = setTimeout(resolve, delay);
                signal.addEventListener('abort', () => {
                    clearTimeout(timer);
                    reject(new Error('AbortError'));
                }, { once: true });
            });

        } catch (e: any) {
            if (e.message === 'AbortError') throw e;
            console.error(`[LOOP ERROR]`, e.message);
            await sleepWithAbort(5000, signal);
        }
    }
    console.log(`[STOP] Loop for ${token} terminated.`);
}

async function getTokenBalance(connection: Connection, wallet: PublicKey, mint: string): Promise<number> {
    try {
        const parsedTokenAccounts = await connection.getParsedTokenAccountsByOwner(
            wallet,
            { mint: new PublicKey(mint) }
        );

        if (parsedTokenAccounts.value.length === 0) return 0;

        // Get the amount in raw units (taking decimals into account)
        const amount = parsedTokenAccounts.value[0].account.data.parsed.info.tokenAmount.amount;
        return parseInt(amount);
    } catch (e) {
        console.error("[BALANCE ERROR] Could not fetch token balance:", e);
        return 0;
    }
}

const sleepWithAbort = (ms: number, signal: AbortSignal) => {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(resolve, ms);
        
        signal.addEventListener('abort', () => {
            clearTimeout(timeout);
            resolve(null); 
        }, { once: true });
    });
};