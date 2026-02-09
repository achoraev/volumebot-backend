// backend/src/engine/utils.ts
import { Connection, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import fetch from "cross-fetch";

const CACHE_DURATION_MS = 10 * 1000;
const priceCache: Record<string, { price: number; timestamp: number }> = {};
const SAFETY_BUFFER = 0.01 * LAMPORTS_PER_SOL; // 0.01 SOL for fees/rent

export async function getPriceWithFallback(tokenAddr: string, forceRefresh: boolean = false): Promise<number | null> {
    const now = Date.now();
    if (!forceRefresh && priceCache[tokenAddr] && (now - priceCache[tokenAddr].timestamp) < CACHE_DURATION_MS) {
        return priceCache[tokenAddr].price;
    }

    try {
        // Try Jupiter Price API v2
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

        // Fallback to DexScreener
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