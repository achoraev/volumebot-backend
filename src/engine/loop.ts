import { Connection, Keypair } from "@solana/web3.js";
import { executeSwap } from '../engine/jupiter';
import { getTokenBalance, getRandomTargetBuys, getRandomBuyAmount, getRandomDelay, sleepWithAbort, getMainWallet, getTimestamp } from '../utils/utils';
import { generateSubWallets, distributeSolPerWallet, reclaimAllTokensPerWallet, reclaimAllSolFromWallet, withdrawAll } from './wallet';
import bs58 from "bs58";
import { SUBWALLETS_FILE } from "../utils/constants";

let currentWalletIndex = 0;

export async function runVolumeLoop(token: string, settings: any, signal: AbortSignal) {
    const connection = new Connection(process.env.RPC_URL!);
    const dryRun = settings.dryRun;

    console.log(`[${getTimestamp()}] [LOOP] Starting volume for ${token}. Mode: ${dryRun ? 'DRY' : 'LIVE'}`);

    if (signal.aborted) return;

    const batchSize = 10;
    const walletsData = generateSubWallets(batchSize, SUBWALLETS_FILE, false);
    const subWallets = walletsData.map((d: { secretKey: string }) =>
        Keypair.fromSecretKey(bs58.decode(d.secretKey))
    );

    const currentWallet = subWallets[currentWalletIndex % subWallets.length];

    console.log(`🚀 [${getTimestamp()}] [NEXT MAKER] Processing wallet: ${currentWallet.publicKey.toBase58()}`);

    currentWalletIndex++;

    // Calculate funding for this specific wallet
    const fundingAmountPerWallet = (settings.maxAmount * settings.maxBuys) * 1.5;

    try {
        // 3. Fund the current wallet in the sequence
        await distributeSolPerWallet(
            connection,
            getMainWallet(),
            parseFloat(fundingAmountPerWallet.toFixed(4)),
            currentWallet
        );

        // 4. Execute the trades for this wallet
        await executeVolumeTrades(connection, currentWallet, token, settings, signal);

        // 5. Cleanup this wallet before moving to the next
        console.log(`🧹 [${getTimestamp()}] [CLEANUP] Reclaiming from ${currentWallet.publicKey.toBase58().slice(0, 6)}`);
        // await reclaimAllTokensPerWallet(connection, currentWallet, getMainWallet(), token);
        // await sleepWithAbort(3000, signal);
        // await reclaimAllSolFromWallet(connection, currentWallet, getMainWallet());
        await withdrawAll();

    } catch (e: any) {
        if (e.message === 'AbortError') throw e;
        console.error(`[${getTimestamp()}] [MAKER ERROR]`, e.message);
        // Even if it fails, try to reclaim remaining SOL so it's not lost
        await reclaimAllTokensPerWallet(connection, currentWallet, getMainWallet(), token).catch(() => { });
        await sleepWithAbort(3000, signal);
        await reclaimAllSolFromWallet(connection, currentWallet, getMainWallet()).catch(() => { });
        await sleepWithAbort(3000, signal);
    }

    console.log(`[${getTimestamp()}] [LOOP] Restarting loop for ${token} with new random target...`);
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
            console.log(`[${getTimestamp()}] [LOOP] 🛑 Stop signal received during pre-trade checks for ${token}. Exiting loop...`);
            return;
        }
        const delay = getRandomDelay(settings);
        await sleepWithAbort(delay, signal);

        if (buyCount < targetBuys) {
            const randomBuyAmount = getRandomBuyAmount(settings);
            console.log(`[${getTimestamp()}] [LOOP] Step ${buyCount + 1}/${targetBuys}: BUY ${randomBuyAmount} SOL from wallet: ${currentWallet.publicKey.toBase58()}`);
            buyCount++;
            await executeSwap(connection, currentWallet, token, "BUY", settings.dryRun, randomBuyAmount);
        } else {
            console.log(`[${getTimestamp()}] [LOOP] Target ${targetBuys} reached. Preparing to SELL ALL...`);

            if (settings.dryRun) {
                await executeSwap(connection, currentWallet, token, "SELL", true, 0);
            } else {
                console.log(`[${getTimestamp()}] [SELL] Fetching token balance for wallet: ${currentWallet.publicKey.toBase58()}...`);
                const balance = await getTokenBalance(connection, currentWallet.publicKey, token);

                await sleepWithAbort(3000, signal);
                console.log(`[${getTimestamp()}] [SELL] Current token balance: ${balance} (raw units)`);
                if (parseFloat(balance) > 0) {
                    console.log(`[${getTimestamp()}] [SELL] Selling balance: ${balance} (raw units)`);
                    await executeSwap(connection, currentWallet, token, "SELL", false, parseFloat(balance));
                    await sleepWithAbort(3000, signal);
                } else {
                    console.log(`[${getTimestamp()}] [SELL] No token balance to sell for wallet: ${currentWallet.publicKey.toBase58()}. Skipping sell step.`);
                }
            }
        }
    }

    // await reclaimAllTokensPerWallet(connection, currentWallet, getMainWallet(), token);
    // await sleepWithAbort(2000, signal);
    // await reclaimAllSolFromWallet(connection, currentWallet, getMainWallet());

    console.log(`[${getTimestamp()}] [LOOP] Completed target buys and sells for ${token}. Ending volume loop.`);
}