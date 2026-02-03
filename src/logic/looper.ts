import { Keypair, Connection } from '@solana/web3.js';
import { runVolumeLoop } from '../engine/loop';
import bs58 from 'bs58';

export const activeBots = new Map<string, boolean>();

export const startVolumeLoop = (tokenAddress: string, settings: any) => {
    const workerKey = process.env.MAIN_PRIVATE_KEY!; 
    const wallet = Keypair.fromSecretKey(bs58.decode(workerKey));
    
    const botId = tokenAddress;
    activeBots.set(botId, true);

    runVolumeLoop(wallet, tokenAddress, settings).catch(console.error);
};

export const stopVolumeLoop = (tokenAddress: string) => {
    activeBots.set(tokenAddress, false);
};