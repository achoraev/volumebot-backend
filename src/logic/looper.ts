import { Keypair } from '@solana/web3.js';
import { runVolumeLoop } from '../engine/loop';
import bs58 from 'bs58';

export const activeBots = new Map<string, boolean>();
const abortControllers = new Map<string, AbortController>();

export const startVolumeLoop = (tokenAddress: string, settings: any) => {
    if (activeBots.get(tokenAddress)) return;

    console.log(`[SYSTEM] Starting Bot for ${tokenAddress}`);
    console.log(`[MODE] ${settings.dryRun ? "🧪 DRY RUN ENABLED (Simulated)" : "⚠️ LIVE TRADING ENABLED (Real SOL)"}`);

    const controller = new AbortController();
    abortControllers.set(tokenAddress, controller);
    activeBots.set(tokenAddress, true);

    const workerKey = process.env.MAIN_PRIVATE_KEY;
    if (!workerKey) {
        console.error("❌ CRITICAL: MAIN_PRIVATE_KEY is missing in .env");
        return;
    }

    const wallet = Keypair.fromSecretKey(bs58.decode(workerKey));
    
    runVolumeLoop(wallet, tokenAddress, settings, controller.signal)
        .catch((err) => {
            if (err.name === 'AbortError') {
                console.log(`[STOP] ${tokenAddress} loop aborted.`);
            } else {
                console.error(`[LOOP ERROR] ${err.message}`);
            }
        })
        .finally(() => {
            activeBots.delete(tokenAddress);
            abortControllers.delete(tokenAddress);
            console.log(`[CLEANUP] Bot state cleared for ${tokenAddress}`);
        });
};

export const stopVolumeLoop = (tokenAddress: string) => {
    const controller = abortControllers.get(tokenAddress);
    console.log(controller + " controller")
    if (controller) {
        console.log(`[STOP] Requesting abort for ${tokenAddress}...`);
        controller.abort(); 
    }
    activeBots.set(tokenAddress, false);
};