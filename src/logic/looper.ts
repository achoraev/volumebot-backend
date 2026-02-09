import { Keypair } from '@solana/web3.js';
import { runVolumeLoop } from '../engine/loop';
import bs58 from 'bs58';
import fs from 'fs';
import path from 'path';

export const activeBots = new Map<string, boolean>();
const abortControllers = new Map<string, AbortController>();

const getRandomWallet = (): Keypair => {
    try {
        const filePath = path.join(process.cwd(), "wallets.json");
        const data = fs.readFileSync(filePath, 'utf8');
        const privateKeys = JSON.parse(data);

        if (!Array.isArray(privateKeys) || privateKeys.length === 0) {
            throw new Error("wallets.json is empty or invalid (must be an array).");
        }

        const randomIndex = Math.floor(Math.random() * privateKeys.length);
        const randomKey = privateKeys[randomIndex];

        console.log(randomKey.address + " is the random address");
        console.log(randomKey.secretKey + " is the random secret key");

        return Keypair.fromSecretKey(bs58.decode(randomKey.secretKey));
    } catch (error: any) {
        console.error("❌ Failed to load random wallet:", error.message + (error.stack ? "\n" + error.stack : ""));

        const workerKey = process.env.MAIN_PRIVATE_KEY;
        if (workerKey) return Keypair.fromSecretKey(bs58.decode(workerKey));
        throw new Error("No valid wallet found in wallets.json or .env");
    }
};

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