import { Connection, Keypair, VersionedTransaction, PublicKey } from "@solana/web3.js";
import fetch from "cross-fetch";
import { trackSimulatedTrade, checkPriceAlert } from "../logic/tracker";
import { executeRaydiumDirectSwap } from './raydium';

const SOL_MINT = "So11111111111111111111111111111111111111112";
const JUP_SWAP_API_URL = "https://api.jup.ag/swap/v1";

const priceCache: Record<string, { price: number; timestamp: number }> = {};
const CACHE_DURATION_MS = 10 * 1000;

async function getPriceWithFallback(tokenAddr: string, forceRefresh: boolean = false): Promise<number | null> {
    const now = Date.now();

    if (!forceRefresh && priceCache[tokenAddr] && (now - priceCache[tokenAddr].timestamp) < CACHE_DURATION_MS) {
        return priceCache[tokenAddr].price;
    }

    try {
        const jupRes = await fetch(`https://api.jup.ag/price/v2?ids=${tokenAddr}`, {
            headers: {
                'x-api-key': process.env.JUPITER_API_KEY || ''
            }
        });

        if (jupRes.status === 401) {
            console.error("❌ Jupiter API Key is missing or invalid. Check your .env file.");
        }

        if (jupRes.ok) {
            const jupData = await jupRes.json();
            if (jupData.data && jupData.data[tokenAddr]) {
                const price = parseFloat(jupData.data[tokenAddr].price);
                priceCache[tokenAddr] = { price, timestamp: now };
                return price;
            }
        }

        console.log(`[PRICE] Jupiter missing data for ${tokenAddr.slice(0, 4)}. Trying DexScreener...`);
        const dexRes = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${tokenAddr}`);
        const dexData = await dexRes.json();

        if (dexData.pairs && dexData.pairs.length > 0) {
            const price = parseFloat(dexData.pairs[0].priceUsd);
            priceCache[tokenAddr] = { price, timestamp: now };
            return price;
        }

        return null;
    } catch (e) {
        console.error("[PRICE ERROR] Fetch failed:", e);
        return null;
    }
}

async function getTokenBalance(connection: Connection, wallet: PublicKey, mint: string): Promise<string> {
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

export async function executeSwap(
    connection: Connection,
    wallet: Keypair,
    tokenAddr: string,
    action: "BUY" | "SELL",
    isDryRun: boolean,
    amount?: number
) {

    console.log(isDryRun ? `[DRY RUN]` : `[LIVE]`, `Initiating ${action} for token ${tokenAddr} with amount: ${amount || "ALL"}`);

    const displayPrice = await getPriceWithFallback(tokenAddr);

    if (isDryRun) {
        console.log(`[DRY RUN] 🧪 Simulating ${action} @ ~$${displayPrice}`);
        return "SIM_SIG";
    }

    console.log(`[LIVE] ⚠️ Initiating real trade...`);
    const currentPrice = await getPriceWithFallback(tokenAddr, true);

    if (currentPrice === null) {
        console.warn(`⚠️ [WARNING] Could not find price for ${tokenAddr}. Bot will continue with trade but PnL tracking will be paused.`);
    }

    if (currentPrice !== null) {
        const alertMessage = checkPriceAlert(currentPrice);
        if (alertMessage) console.log(`\x1b[33m%s\x1b[0m`, alertMessage);
        if (isDryRun) trackSimulatedTrade(tokenAddr, action, currentPrice, amount || 0);
    }

    console.log(isDryRun ? `[DRY RUN]` : `[LIVE]`, `Preparing to ${action} at Market Price: $${currentPrice} for token ${tokenAddr}`);

    if (isDryRun) {
        trackSimulatedTrade(tokenAddr, action, currentPrice || 0, amount || 0);

        console.log(`[DRY RUN] 🧪 Simulated ${action} at Market Price: $${currentPrice}`);
        console.log(`[DRY RUN] Wallet: ${wallet.publicKey.toBase58().slice(0, 8)}...`);

        await new Promise(r => setTimeout(r, 1000));

        return "SIM_SIG_" + Math.random().toString(36).slice(2);
    }

    try {
        let inputMint = action === "BUY" ? SOL_MINT : tokenAddr;
        let outputMint = action === "BUY" ? tokenAddr : SOL_MINT;
        let swapAmount: string;

        if (action === "SELL") {
            swapAmount = await getTokenBalance(connection, wallet.publicKey, tokenAddr);
            if (!swapAmount || swapAmount === "0") throw new Error("No tokens found to sell.");
            console.log(`[SELL] Selling all tokens (${swapAmount} raw units)...`);
        } else {
            const lamports = Math.floor(amount! * 1_000_000_000);
            swapAmount = lamports.toString();

            console.log(`[BUY] Attempting buy: ${amount} SOL (${swapAmount} lamports)`);
        }

        const jupQuoteUrl = `${JUP_SWAP_API_URL}/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${swapAmount}&slippageBps=100`;
        console.log(`[JUPITER] Fetching quote from: ${jupQuoteUrl}`);

        const jupRes = await fetch(jupQuoteUrl, { headers: { 'x-api-key': process.env.JUPITER_API_KEY || '' } });

        console.log(`[JUPITER] Quote response status: ${jupRes.status} ${jupRes.statusText}`);
        const jupData = await jupRes.json();
        console.log(`[JUPITER] Quote fetched. Routes found: ${jupData.data?.length || 0}, Error: ${jupData.error || "None"}`);
        console.log(jupData.errorCode ? `[JUPITER] Quote error code: ${jupData.errorCode}` : "[JUPITER] No errorsCode detected.");

        // Raydium Direct Fallback for non-tradable tokens or zero routes
        if (jupRes.status === 400) {
            console.log(`[JUPITER] Quote error details: ${JSON.stringify(jupData)}`);

            if (jupData.errorCode === "TOKEN_NOT_TRADABLE" || jupData.error === "Routes found: 0") {
                console.log("🚀 Jupiter: Token not tradable. Falling back to Raydium Direct...");
                return await executeRaydiumDirectSwap(connection, wallet, tokenAddr, action, parseInt(swapAmount));
            }
        }

        let swapTransaction: string | undefined;

        console.log("🚀 Using Jupiter Raydium path...");

        const jupSwapRes = await fetch(`${JUP_SWAP_API_URL}/swap`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': process.env.JUPITER_API_KEY || ''
            },
            body: JSON.stringify({
                quoteResponse: jupData,
                userPublicKey: wallet.publicKey.toBase58(),
                wrapAndUnwrapSol: true,
                dynamicComputeUnitLimit: true,
                prioritizationFeeLamports: 'auto'
            })
        });

        console.log(`[JUPITER] Swap response status: ${jupSwapRes.status} ${jupSwapRes.statusText}`);

        const jupSwapData: any = await jupSwapRes.json();
        swapTransaction = jupSwapData.swapTransaction;

        if (!swapTransaction) {
            throw new Error("Critical: Transaction data is undefined. Skipping execution.");
        }

        const transaction = VersionedTransaction.deserialize(Buffer.from(swapTransaction, 'base64'));
        transaction.sign([wallet]);

        const signature = await connection.sendRawTransaction(transaction.serialize(), {
            skipPreflight: true,
            maxRetries: 2
        });

        console.log(`✅ ${action} Success: https://solscan.io/tx/${signature}`);
        return signature;

    } catch (error: any) {
        console.error(`[ERROR] ${action} Failed:`, error.message);
    }
}