import { Keypair } from '@solana/web3.js';
import { runVolumeLoop } from '../engine/loop';
import { getRandomWallet } from '../engine/wallet';

export const activeBots = new Map<string, boolean>();
const abortControllers = new Map<string, AbortController>();

export const startVolumeLoop = (tokenAddress: string, settings: any) => {
    if (activeBots.get(tokenAddress)) return;

    let wallet: Keypair;
    try {
        wallet = getRandomWallet();
    } catch (err: any) {
        console.error(`[SYSTEM] Startup failed: ${err.message}`);
        return;
    }

    console.log(`[SYSTEM] Starting Bot for ${tokenAddress}`);
    console.log(`[MODE] ${settings.dryRun ? "🧪 DRY RUN ENABLED (Simulated)" : "⚠️ LIVE TRADING ENABLED (Real SOL)"}`);

    const controller = new AbortController();
    abortControllers.set(tokenAddress, controller);
    activeBots.set(tokenAddress, true);
    
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
    if (controller) {
        console.log(`[STOP] Requesting abort for ${tokenAddress}...`);
        controller.abort(); 
    }
    activeBots.set(tokenAddress, false);
};