import { Connection, Keypair } from "@solana/web3.js";
import fetch from "cross-fetch";
import { trackSimulatedTrade } from "../logic/tracker";
import { executePumpSwap } from './pump2';
import { getPriceWithFallback, getTokenBalance } from "../utils/utils";

const SOL_MINT = "So11111111111111111111111111111111111111112";
const JUP_SWAP_API_URL = "https://api.jup.ag/swap/v1";

async function getJupiterSwapTx(wallet: string, input: string, output: string, amount: string) {
    const quoteUrl = `${JUP_SWAP_API_URL}/quote?inputMint=${input}&outputMint=${output}&amount=${amount}&slippageBps=100`;
    const quoteRes = await fetch(quoteUrl, { headers: { 'x-api-key': process.env.JUPITER_API_KEY || '' } });
    const quoteData = await quoteRes.json();

    if (quoteRes.status === 400 || !quoteData.routePlan) return null;

    const swapRes = await fetch(`${JUP_SWAP_API_URL}/swap`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.JUPITER_API_KEY || '' },
        body: JSON.stringify({
            quoteResponse: quoteData,
            userPublicKey: wallet,
            wrapAndUnwrapSol: true,
            prioritizationFeeLamports: 'auto'
        })
    });

    const swapData: any = await swapRes.json();
    return swapData.swapTransaction;
}

export async function executeSwap(
    connection: Connection,
    wallet: Keypair,
    tokenAddr: string,
    action: "BUY" | "SELL",
    isDryRun: boolean,
    amount?: number
) {
    const walletAddr = wallet.publicKey.toBase58();
    
    // 1. Price & Simulation Logic
    const currentPrice = await getPriceWithFallback(tokenAddr, true);
    if (isDryRun) {
        console.log(`[DRY RUN] 🧪 Simulating ${action} @ ~$${currentPrice}`);
        trackSimulatedTrade(tokenAddr, action, currentPrice || 0, amount || 0);
        return "SIM_" + Math.random().toString(36).slice(2);
    }

    // 2. Determine Amounts
    let swapAmountLamports: string;
    if (action === "SELL") {
        swapAmountLamports = await getTokenBalance(connection, wallet.publicKey, tokenAddr);
        if (swapAmountLamports === "0") throw new Error("No tokens to sell.");
    } else {
        swapAmountLamports = Math.floor(amount! * 1_000_000_000).toString();
    }

    try {
        const input = action === "BUY" ? SOL_MINT : tokenAddr;
        const output = action === "BUY" ? tokenAddr : SOL_MINT;

        // // 3. TRY JUPITER (Primary)
        // console.log(`[SWAP] Checking Jupiter for ${tokenAddr.slice(0, 6)}...`);
        // const jupTx = await getJupiterSwapTx(walletAddr, input, output, swapAmountLamports);

        // if (jupTx) {
        //     const transaction = VersionedTransaction.deserialize(Buffer.from(jupTx, 'base64'));
        //     transaction.sign([wallet]);
        //     const sig = await connection.sendRawTransaction(transaction.serialize(), { skipPreflight: true });
        //     console.log(`✅ Jupiter Success: ${sig}`);
        //     return sig;
        // }

        // // 4. FALLBACK TO RAYDIUM
        // console.log("🚀 Jupiter unavailable. Trying Raydium Direct...");
        // return await executeRaydiumDirectSwap(connection, wallet, tokenAddr, action, parseInt(swapAmountLamports));

        throw new Error("ROUTE_NOT_FOUND");
    } catch (error: any) {
        // 5. FINAL FALLBACK TO PUMP.FUN
        if (error.message.includes("ROUTE_NOT_FOUND") || error.message.includes("TOKEN_NOT_TRADABLE")) {
            // console.log("📍 Raydium/Jup failed. Final fallback: PumpPortal...");
            return await executePumpSwap(connection, wallet, tokenAddr, action, amount || 0);
        }
        throw error;
    }
}