
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { activeBots } from '../logic/looper';
import { executeSwap } from '../engine/jupiter';
import { getTokenBalance } from './utils';

export async function runVolumeLoop(wallet: Keypair, token: string, settings: any, signal: AbortSignal) {
    let buyCount = 0;
    let targetBuys = Math.floor(Math.random() * (settings.maxBuys - settings.minBuys + 1)) + settings.minBuys;
    const connection = new Connection(process.env.RPC_URL!);
    const dryRun = settings.dryRun;
    const min = parseFloat(settings.minAmount);
    const max = parseFloat(settings.maxAmount);
    const minD = parseInt(settings.minDelay);
    const maxD = parseInt(settings.maxDelay);

    console.log(`[LOOP] Starting volume for ${token}. Initial target: ${targetBuys} buys. Mode: ${dryRun ? 'DRY' : 'LIVE'}`);

    if (signal.aborted) return;

    while (activeBots.get(token) === true) {

        if (signal.aborted) {
            console.log(`[LOOP] 🛑 Stop signal received for ${token}. Exiting loop...`);
            break;
        }

        try {
            if (buyCount < targetBuys) {
                console.log( `[LOOP] Preparing to BUY. Current count: ${buyCount}/${targetBuys}. Wallet: ${wallet.publicKey.toBase58()}` );

                const randomBuyAmount = Math.random() * (max - min) + min;
                const finalAmount = parseFloat(randomBuyAmount.toFixed(4));

                if (isNaN(finalAmount)) {
                    throw new Error("Invalid Buy Amount: Calculations resulted in NaN. Check settings keys.");
                }

                console.log(`[LOOP] Step ${buyCount + 1}/${targetBuys}: BUY ${finalAmount} SOL from wallet: ${wallet.publicKey.toBase58()}`);
                await executeSwap(connection, wallet, token, "BUY", dryRun, finalAmount);
                buyCount++;
            } else {
                console.log(`[LOOP] Target ${targetBuys} reached. Preparing to SELL ALL...`);

                if (dryRun) {
                    await executeSwap(connection, wallet, token, "SELL", true, 0);
                } else {
                    const balance = parseInt(await getTokenBalance(connection, wallet.publicKey, token));
                    
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

            
            const delay = Math.floor(Math.random() * (maxD - minD + 1) + minD) * 1000;
            console.log(`Delay is: ${delay}`);
            console.log(`[WAIT] Sleeping for ${delay / 1000}s...`);

            await sleepWithAbort(delay, signal);

            // await new Promise((resolve, reject) => {
            //     const timer = setTimeout(resolve, delay);
            //     signal.addEventListener('abort', () => {
            //         clearTimeout(timer);
            //         reject(new Error('AbortError'));
            //     }, { once: true });
            // });

        } catch (e: any) {
            if (e.message === 'AbortError') throw e;
            console.error(`[LOOP ERROR]`, e.message);
            await sleepWithAbort(5000, signal);
        }
    }
    console.log(`[STOP] Loop for ${token} terminated.`);
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