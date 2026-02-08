import { Connection, Keypair, VersionedTransaction } from '@solana/web3.js';
import axios from 'axios';

const RAYDIUM_API_BASE = "https://transaction-v1.raydium.io";

export async function executeRaydiumDirectSwap(
    connection: Connection,
    wallet: Keypair,
    tokenAddr: string,
    action: "BUY" | "SELL",
    amountInLamports: number
) {
    const inputMint = action === "BUY" ? "So11111111111111111111111111111111111111112" : tokenAddr;
    const outputMint = action === "BUY" ? tokenAddr : "So11111111111111111111111111111111111111112";

    try {
        const { data: swapResponse } = await axios.get(`${RAYDIUM_API_BASE}/compute/swap-base-in`, {
            params: {
                inputMint,
                outputMint,
                amount: amountInLamports,
                slippageBps: 500,
                txVersion: 'V0'
            }
        });

        console.log(`[RAYDIUM] Swap response received. Preparing transactions...`);

        const { data: swapTransactions } = await axios.post(`${RAYDIUM_API_BASE}/transaction/swap-base-in`, {
            computeUnitPriceMicroLamports: "500000", // Priority fee
            swapResponse,
            txVersion: 'V0',
            wallet: wallet.publicKey.toBase58(),
            wrapSol: action === "BUY",
            unwrapSol: action === "SELL"
        });

        console.log(`[RAYDIUM] Transaction payload received. Signing and sending...`);
        console.log("DEBUG: Raydium API Response:", JSON.stringify(swapTransactions));

        // to here error is in next 30 rows
        if (!swapTransactions.success || !swapTransactions.data) {
            console.error("❌ RAYDIUM API REJECTION:", JSON.stringify(swapTransactions));
            throw new Error(`Raydium could not build transaction: ${swapTransactions.msg || "Unknown reason"}`);
        }
        
        const txDataArray = swapTransactions.data;
        if (!Array.isArray(txDataArray) || txDataArray.length === 0) {
            throw new Error("Raydium returned success but no transaction instructions found.");
        }
        
        console.log(`[RAYDIUM] Signing ${txDataArray.length} transaction(s)...`);

        const { blockhash } = await connection.getLatestBlockhash('confirmed');

        const allTxBuf = txDataArray.map((tx: any) => Buffer.from(tx.transaction, 'base64'));
        const transactions = allTxBuf.map((txBuf: Buffer) => VersionedTransaction.deserialize(txBuf));

        let lastSignature = "";
        for (const tx of transactions) {
            tx.message.recentBlockhash = blockhash;
            tx.sign([wallet]);

            lastSignature = await connection.sendRawTransaction(tx.serialize(), {
                skipPreflight: true,
                maxRetries: 2
            });

            await connection.confirmTransaction(lastSignature, "confirmed");
        }

        console.log(`✅ Raydium Swap Success: ${lastSignature}`);
        return lastSignature;
    } catch (error: any) {
        const rayError = error.response?.data?.msg || error.message;
        console.error("[RAYDIUM ERROR]", rayError);
        throw new Error(`Raydium swap failed: ${rayError}`);
    }
}