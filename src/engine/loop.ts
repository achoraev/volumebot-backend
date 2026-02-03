
import { Connection, Keypair, VersionedTransaction, PublicKey } from "@solana/web3.js";
import { activeBots } from '../logic/looper';
import { executeSwap } from '../engine/jupiter';

export async function runVolumeLoop(wallet: Keypair, token: string, settings: any) {
    let buyCount = 0;
    let targetBuys = Math.floor(Math.random() * (settings.maxBuys - settings.minBuys + 1)) + settings.minBuys;
    const connection = new Connection(process.env.RPC_URL!);

    while (activeBots.get(token) === true) {
        try {
            if (buyCount < targetBuys) {
                await executeSwap(connection, wallet, token, "BUY", settings.buyAmount);
                buyCount++;
            } else {
                await executeSwap(connection, wallet, token, "SELL");
                buyCount = 0;
                targetBuys = Math.floor(Math.random() * (settings.maxBuys - settings.minBuys + 1)) + settings.minBuys;
            }

            const delay = Math.floor(Math.random() * (settings.maxDelay - settings.minDelay + 1) + settings.minDelay) * 1000;
            await new Promise(r => setTimeout(r, delay));
        } catch (e) {
            await new Promise(r => setTimeout(r, 5000));
        }
    }
}