// backend/src/engine/utils.ts
import { Connection, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { Keypair, SystemProgram, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import fs from 'fs';
import bs58 from 'bs58';
import fetch from "cross-fetch";
import path from 'path';

const SUB_WALLETS_PATH = path.join(process.cwd(), "sub-wallets.json");
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

export const generateSubWallets = (count: number) => {
    const newWallets = [];
    for (let i = 0; i < count; i++) {
        const kp = Keypair.generate();
        newWallets.push({
            pubkey: kp.publicKey.toBase58(),
            privateKey: bs58.encode(kp.secretKey)
        });
    }
    fs.writeFileSync(SUB_WALLETS_PATH, JSON.stringify(newWallets, null, 2));
    console.log(`✅ Generated ${count} sub-wallets in ${SUB_WALLETS_PATH}`);
    return newWallets;
};

export const distributeSol = async (connection: Connection, mainWallet: Keypair, amountPerWallet: number) => {
    const subWallets = JSON.parse(fs.readFileSync(SUB_WALLETS_PATH, 'utf-8'));
    const lamports = amountPerWallet * 1_000_000_000;

    console.log(`[SYSTEM] Funding ${subWallets.length} wallets with ${amountPerWallet} SOL each...`);

    for (const walletInfo of subWallets) {
        const transaction = new Transaction().add(
            SystemProgram.transfer({
                fromPubkey: mainWallet.publicKey,
                toPubkey: new PublicKey(walletInfo.pubkey),
                lamports: lamports,
            })
        );
        
        const sig = await sendAndConfirmTransaction(connection, transaction, [mainWallet]);
        console.log(`💰 Funded ${walletInfo.pubkey.slice(0,6)}... | Sig: ${sig.slice(0,8)}`);
    }
};

export const reclaimAllFunds = async (connection: Connection, mainWallet: Keypair) => {
    if (!fs.existsSync(SUB_WALLETS_PATH)) return;
    
    const subWalletsData = JSON.parse(fs.readFileSync(SUB_WALLETS_PATH, 'utf-8'));
    console.log(`[RECLAIM] Starting sweep for ${subWalletsData.length} wallets...`);

    for (const data of subWalletsData) {
        try {
            const subKp = Keypair.fromSecretKey(bs58.decode(data.privateKey));
            const balance = await connection.getBalance(subKp.publicKey);

            if (balance < 5000) continue; // Skip if basically empty

            // Calculate exact amount to send (Balance minus transaction fee)
            const fee = 5000; 
            const amountToSend = balance - fee;

            const transaction = new Transaction().add(
                SystemProgram.transfer({
                    fromPubkey: subKp.publicKey,
                    toPubkey: mainWallet.publicKey,
                    lamports: amountToSend,
                })
            );

            const sig = await sendAndConfirmTransaction(connection, transaction, [subKp]);
            console.log(`💰 Swept ${amountToSend / LAMPORTS_PER_SOL} SOL from ${subKp.publicKey.toBase58().slice(0,6)}`);
        } catch (e: any) {
            console.error(`[RECLAIM ERROR] Failed for ${data.pubkey}:`, e.message);
        }
    }
    console.log("✅ Reclaim process complete.");
};

export const clearSubWallets = () => {
    if (fs.existsSync(SUB_WALLETS_PATH)) {
        fs.unlinkSync(SUB_WALLETS_PATH);
        console.log("🗑️ Local sub-wallet records deleted.");
    }
};