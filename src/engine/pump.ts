import { Keypair, VersionedTransaction, Connection } from "@solana/web3.js";
import fetch from "cross-fetch";

export async function executePumpSwap(
    connection: Connection,
    wallet: Keypair,
    mint: string,
    action: "BUY" | "SELL",
    amount: number | string,
    slippage: number = 10 // PumpPortal uses actual percentage (e.g., 10 for 10%)
) {
    try {
        const finalAmount = action === "SELL" ? "100%" : amount;
        console.log(`[PUMP] Initiating ${action} for ${mint}... Amount: ${finalAmount} ${action === "BUY" ? "SOL" : "tokens"}, Slippage: ${slippage}%`);

        const response = await fetch(`https://pumpportal.fun/api/trade-local`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                publicKey: wallet.publicKey.toBase58(),
                action: action.toLowerCase(), // "buy" or "sell"
                mint: mint,
                amount: finalAmount,
                denominatedInSol: action === "BUY" ? "true" : "false",
                slippage: slippage, 
                priorityFee: 0.0005, // Tip for faster landing
                pool: "pump" 
            })
        });

        if (!response.ok) {
            const text = await response.text();
            throw new Error(`PumpPortal API Error (${response.status}): ${text}`);
        }

        const solBalance = await connection.getBalance(wallet.publicKey);

        if (solBalance < 5000) {
            console.log(`⚠️  [RECLAIM] Insufficient SOL balance for ${wallet.publicKey.toBase58().slice(0, 6)} to make a sale. Skipping...`);
            return null;
        }

        console.log(`[PUMP] Response status: ${response.status} ${response.statusText}`);

        const arrayBuffer = await response.arrayBuffer();
        const txBuffer = Buffer.from(arrayBuffer);

        if (txBuffer.length === 0) {
            throw new Error("PumpPortal returned an empty transaction buffer.");
        }

        const tx = VersionedTransaction.deserialize(new Uint8Array(txBuffer));
        
        const { blockhash } = await connection.getLatestBlockhash('confirmed');
        tx.message.recentBlockhash = blockhash;
        
        tx.sign([wallet]);

        console.log(`[PUMP] Transaction signed. Sending to network...`);

        const signature = await connection.sendRawTransaction(tx.serialize(), { 
            skipPreflight: true,
            maxRetries: 2
        });

        console.log(`✅ Pump.fun Success: https://solscan.io/tx/${signature}`);
        return signature;
    } catch (e: any) {
        console.error("[PUMP ERROR]", e.message + (e.stack ? "\n" + e.stack : ""));
        throw e;
    }
}