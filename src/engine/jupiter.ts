import { Connection, Keypair, VersionedTransaction, PublicKey } from "@solana/web3.js";
import fetch from "cross-fetch";

const PUMP_API_URL = "https://public.jupiterapi.com";
const SOL_MINT = "So11111111111111111111111111111111111111112";

async function getTokenBalance(connection: Connection, wallet: PublicKey, mint: string): Promise<string> {
    try {
        const accounts = await connection.getTokenAccountsByOwner(wallet, {
            mint: new PublicKey(mint)
        });
        if (accounts.value.length === 0) return "0";
        
        const balance = await connection.getTokenAccountBalance(accounts.value[0].pubkey);
        return balance.value.amount; // Returns raw amount with decimals (e.g., "1000000")
    } catch (e) {
        return "0";
    }
}

export async function executeSwap(
    connection: Connection, 
    wallet: Keypair, 
    tokenAddr: string, 
    action: "BUY" | "SELL",
    amount?: number // Only needed for BUY. For SELL, we'll sell 100% of balance.
) {
    try {
        let inputMint = action === "BUY" ? SOL_MINT : tokenAddr;
        let outputMint = action === "BUY" ? tokenAddr : SOL_MINT;
        let swapAmount: string;

        if (action === "SELL") {
            swapAmount = await getTokenBalance(connection, wallet.publicKey, tokenAddr);
            if (swapAmount === "0") throw new Error("No tokens found to sell.");
            console.log(`[SELL] Selling all tokens (${swapAmount} units)...`);
        } else {
            swapAmount = amount!.toString();
            console.log(`[BUY] Buying tokens for ${amount} lamports...`);
        }

        // 1. Try Jupiter Path
        const jupQuoteUrl = `https://lite-api.jup.ag/swap/v1/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${swapAmount}&slippageBps=100`;
        const jupRes = await fetch(jupQuoteUrl);
        const jupData = await jupRes.json();

        let swapTransaction: string;

        if (jupData.error && jupData.errorCode === "TOKEN_NOT_TRADABLE") {
            // 2. Pump.fun Curve Path
            console.log("📍 Using Pump.fun curve route...");
            const pumpSwapRes = await fetch(`${PUMP_API_URL}/pump-fun/swap`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    wallet: wallet.publicKey.toBase58(),
                    type: action,
                    mint: tokenAddr,
                    inAmount: swapAmount,
                    priorityFeeLevel: "high",
                    slippageBps: 300 // Slightly higher slippage for sells on the curve
                })
            });

            const pumpData: any = await pumpSwapRes.json();
            swapTransaction = pumpData.swapTransaction;
        } else {
            // 3. Jupiter/Raydium Path
            console.log("🚀 Using Jupiter Raydium path...");
            const jupSwapRes = await fetch('https://lite-api.jup.ag/swap/v1/swap', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    quoteResponse: jupData,
                    userPublicKey: wallet.publicKey.toBase58(),
                    wrapAndUnwrapSol: true
                })
            });

            const jupSwapData: any = await jupSwapRes.json();
            swapTransaction = jupSwapData.swapTransaction;
        }

        // 4. Execution
        const transaction = VersionedTransaction.deserialize(Buffer.from(swapTransaction, 'base64'));
        transaction.sign([wallet]);
        const signature = await connection.sendRawTransaction(transaction.serialize(), { skipPreflight: true });
        
        console.log(`✅ ${action} Successful: https://solscan.io/tx/${signature}`);
        return signature;

    } catch (error) {
        console.error(`[ERROR] ${action} Failed:`, error);
    }
}