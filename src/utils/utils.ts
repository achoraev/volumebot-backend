import { Connection, PublicKey, Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import fetch from "cross-fetch";
import bs58 from "bs58";

const CACHE_DURATION_MS = 10 * 1000;
const priceCache: Record<string, { price: number; timestamp: number }> = {};
const SAFETY_BUFFER = 0.01 * LAMPORTS_PER_SOL; // 0.01 SOL for fees/rent

export async function getPriceWithFallback(tokenAddr: string, forceRefresh: boolean = false): Promise<number | null> {
    const now = Date.now();
    if (!forceRefresh && priceCache[tokenAddr] && (now - priceCache[tokenAddr].timestamp) < CACHE_DURATION_MS) {
        return priceCache[tokenAddr].price;
    }

    try {
        const jupRes = await fetch(`https://api.jup.ag/price/v2?ids=${tokenAddr}`, {
            headers: { 'x-api-key': process.env.JUPITER_API_KEY || '' }
        });

        if (jupRes.ok) {
            const jupData = await jupRes.json();
            if (jupData.data && jupData.data[tokenAddr]) {
                const price = parseFloat(jupData.data[tokenAddr].price);
                priceCache[tokenAddr] = { price, timestamp: now };
                return price;
            }
        }

        const dexRes = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${tokenAddr}`);
        const dexData = await dexRes.json();
        if (dexData.pairs && dexData.pairs.length > 0) {
            const price = parseFloat(dexData.pairs[0].priceUsd);
            priceCache[tokenAddr] = { price, timestamp: now };
            return price;
        }

        return null;
    } catch (e) {
        console.error("[UTILS ERROR] Price fetch failed:", e);
        return null;
    }
}

export async function getTokenBalance(connection: Connection, wallet: PublicKey, mint: string): Promise<string> {
    try {
        const accounts = await connection.getParsedTokenAccountsByOwner(wallet, {
            mint: new PublicKey(mint)
        });
        if (accounts.value.length === 0) return "0";
        return accounts.value[0].account.data.parsed.info.tokenAmount.amount;
    } catch (e) {
        console.error("[UTILS ERROR] Failed to get token balance:", e);
        return "0";
    }
}

export async function checkBalance(connection: Connection, publicKey: PublicKey, requiredLamports: number) {
    const balance = await connection.getBalance(publicKey);
    const totalNeeded = requiredLamports + SAFETY_BUFFER;
    
    if (balance < totalNeeded) {
        throw new Error(`Insufficient SOL. Balance: ${(balance / LAMPORTS_PER_SOL).toFixed(4)}, Needed: ${(totalNeeded / LAMPORTS_PER_SOL).toFixed(4)}`);
    }
}

export function getRandomTargetBuys(settings: any) {
    const minBuys = parseInt(settings.minBuys);
    const maxBuys = parseInt(settings.maxBuys);

    if (isNaN(minBuys) || isNaN(maxBuys) || minBuys < 0 || maxBuys < 0 || minBuys > maxBuys) {
        throw new Error("Invalid buy count settings: ensure minBuys and maxBuys are valid numbers and minBuys <= maxBuys.");
    }

    return Math.floor(Math.random() * (maxBuys - minBuys + 1)) + minBuys;
}

export function getRandomBuyAmount(settings: any) {
    const minAmount = parseFloat(settings.minAmount);
    const maxAmount = parseFloat(settings.maxAmount);

    if (isNaN(minAmount) || isNaN(maxAmount) || minAmount <= 0 || maxAmount <= 0 || minAmount > maxAmount) {
        throw new Error("Invalid amount settings: ensure minAmount and maxAmount are valid positive numbers and minAmount <= maxAmount.");
    }

    return parseFloat((Math.random() * (maxAmount - minAmount) + minAmount).toFixed(4));
}

export function getRandomDelay(settings: any): number {
    const minDelay = parseInt(settings.minDelay);
    const maxDelay = parseInt(settings.maxDelay);

    if (isNaN(minDelay) || isNaN(maxDelay) || minDelay < 0 || maxDelay < 0 || minDelay > maxDelay) {
        throw new Error("Invalid delay settings: ensure minDelay and maxDelay are valid numbers and minDelay <= maxDelay.");
    }

    return Math.floor(Math.random() * (maxDelay - minDelay + 1) + minDelay) * 1000;
}

export const sleepWithAbort = (ms: number, signal: AbortSignal) => {
    console.log(`[WAIT] Sleeping for ${ms / 1000}s...`);
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(resolve, ms);

        signal.addEventListener('abort', () => {
            clearTimeout(timeout);
            resolve(null);
        }, { once: true });
    });
};

export function getMainWallet(): Keypair {
    try {
        const mainWallet = Keypair.fromSecretKey(bs58.decode(process.env.MAIN_PRIVATE_KEY!));
        return mainWallet;
    } catch (e) {
        throw new Error("Failed to load Main Wallet: Invalid private key");
    }
}

export async function confirmTx(connection: Connection, signature: string): Promise<boolean> {
    const start = Date.now();
    while (Date.now() - start < 45000) { // 45s timeout
        const { value } = await connection.getSignatureStatus(signature);
        if (value?.confirmationStatus === "confirmed" || value?.confirmationStatus === "finalized") {
            return !value.err;
        }
        await sleepWithAbort(1000, new AbortController().signal);
    }
    return false;
}