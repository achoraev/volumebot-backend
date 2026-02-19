import { Connection, Keypair } from "@solana/web3.js";
import { executeSwap } from '../engine/jupiter';
import { getTokenBalance, getRandomTargetBuys, getRandomBuyAmount, getRandomDelay, sleepWithAbort, getMainWallet } from '../utils/utils';
import { generateSubWallets, distributeSolPerWallet, reclaimAllTokensPerWallet as reclaimAllTokensPerWallet } from './wallet';
import bs58 from "bs58";

export async function runVolumeLoop(token: string, settings: any, signal: AbortSignal) {
    const connection = new Connection(process.env.RPC_URL!);
    const dryRun = settings.dryRun;

    console.log(`[LOOP] Starting volume for ${token}. Mode: ${dryRun ? 'DRY' : 'LIVE'}`);

    if (signal.aborted) {
        console.log(`[LOOP] 🛑 Stop signal received for ${token}. Exiting loop...`);
        return;
    }

    // Generate sub-wallets for this loop iteration and choose one randomly to execute trades from
    const batchSize = 10;
    const walletsData: { secretKey: string }[] = generateSubWallets(batchSize, "sub-wallets.json");

    const subWallets = walletsData.map(d => Keypair.fromSecretKey(bs58.decode(d.secretKey)));
    const currentWallet = subWallets[Math.floor(Math.random() * subWallets.length)];

    // Todo use connected wallet
    const fundingAmountPerWallet = (settings.maxAmount * settings.maxBuys) * 1.5;
    await distributeSolPerWallet(connection, getMainWallet(), parseFloat(fundingAmountPerWallet.toFixed(4)), currentWallet);

    try {
        await executeVolumeTrades(connection, currentWallet, token, settings, signal);
    } catch (e: any) {
        if (e.message === 'AbortError') throw e;
        console.error(`[LOOP ERROR]`, e.message);
        await sleepWithAbort(3000, signal);
    }

    console.log(`[LOOP] Restarting loop for ${token} with new random target...`);
}

async function executeVolumeTrades(
    connection: Connection,
    currentWallet: Keypair,
    token: string,
    settings: any,
    signal: AbortSignal
) {
    let buyCount = 0;
    const targetBuys = getRandomTargetBuys(settings);

    for (let i = 0; i <= targetBuys; i++) {
        if (signal.aborted) {
            console.log(`[LOOP] 🛑 Stop signal received during pre-trade checks for ${token}. Exiting loop...`);
            return;
        }
        const delay = getRandomDelay(settings);
        await sleepWithAbort(delay, signal);

        if (buyCount < targetBuys) {
            const randomBuyAmount = getRandomBuyAmount(settings);
            console.log(`[LOOP] Step ${buyCount + 1}/${targetBuys}: BUY ${randomBuyAmount} SOL from wallet: ${currentWallet.publicKey.toBase58()}`);
            buyCount++;
            await executeSwap(connection, currentWallet, token, "BUY", settings.dryRun, randomBuyAmount);
        } else {
            console.log(`[LOOP] Target ${targetBuys} reached. Preparing to SELL ALL...`);

            if (settings.dryRun) {
                await executeSwap(connection, currentWallet, token, "SELL", true, 0);
            } else {
                console.log(`[SELL] Fetching token balance for wallet: ${currentWallet.publicKey.toBase58()}...`);
                const balance = await getTokenBalance(connection, currentWallet.publicKey, token);

                await sleepWithAbort(2000, signal);
                console.log(`[SELL] Current token balance: ${balance} (raw units)`);
                if (parseFloat(balance) > 0) {
                    console.log(`[SELL] Selling balance: ${balance} (raw units)`);
                    await executeSwap(connection, currentWallet, token, "SELL", false, parseFloat(balance));
                } else {
                    console.log("[SELL] No tokens found to sell. Skipping to next cycle.");
                }
            }
        }
    }

    await reclaimAllTokensPerWallet(connection, currentWallet, getMainWallet(), token);

    console.log(`[LOOP] Completed target buys and sells for ${token}. Ending volume loop.`);
}