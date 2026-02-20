import { Connection, Keypair, VersionedTransaction } from "@solana/web3.js";
import fetch from "cross-fetch";
import { confirmTx, getTimestamp, sleepWithAbort } from "../utils/utils";

export async function executePumpSwap(
    connection: Connection,
    wallet: Keypair,
    mint: string,
    action: "BUY" | "SELL",
    amount: number | string,
    slippage: number = 25, // Start higher for volume bots
    maxRetries: number = 3
) {
    let currentPriorityFee = 0.0006; // Slightly higher starting fee
    let currentSlippage = Number(slippage);
    const finalAmount = action === "SELL" ? "100%" : amount;

    console.log(`[PUMP] Initiating ${action} | Amount: ${finalAmount} | Initial Slippage: ${currentSlippage}%`);

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const solBalance = await connection.getBalance(wallet.publicKey);
            const solBalanceInSol = solBalance / 1_000_000_000;

            // 1. Precise Balance Check
            const requiredSol = currentPriorityFee + (action === "BUY" ? parseFloat(amount.toString()) : 0.001);
            if (solBalanceInSol < requiredSol) {
                console.log(`⚠️ [${getTimestamp()}] [BALANCE] ${wallet.publicKey.toBase58().slice(0,6)} has ${solBalanceInSol.toFixed(4)} SOL. Need ${requiredSol.toFixed(4)} SOL.`);
                return null;
            }

            console.log(`[${getTimestamp()}] [PUMP] Attempt ${attempt}/${maxRetries} | Fee: ${currentPriorityFee} | Slippage: ${currentSlippage}%`);

            const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash({
                commitment: "processed" // Speed over finality for blockhashes
            });

            const response = await fetch(`https://pumpportal.fun/api/trade-local`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    publicKey: wallet.publicKey.toBase58(),
                    action: action.toLowerCase(),
                    mint: mint,
                    amount: finalAmount,
                    denominatedInSol: action === "BUY" ? "true" : "false",
                    slippage: currentSlippage, // Numeric
                    priorityFee: currentPriorityFee, // Numeric
                    pool: "pump"
                })
            });

            if (!response.ok) {
                const text = await response.text();
                if (response.status === 400) throw new Error(`400 Bad Request: ${text}`);
                throw new Error(`API Error: ${text}`);
            }

            const arrayBuffer = await response.arrayBuffer();
            const tx = VersionedTransaction.deserialize(new Uint8Array(arrayBuffer));
            
            tx.message.recentBlockhash = blockhash;
            tx.sign([wallet]);

            // 2. Send with high maxRetries at the RPC level
            const signature = await connection.sendRawTransaction(tx.serialize(), {
                skipPreflight: true,
                maxRetries: 2, // Allow the RPC to try re-sending for us
                preflightCommitment: "processed"
            });

            console.log(`📡 [${getTimestamp()}] [Attempt ${attempt}] Tx: ${signature.slice(0, 8)}...`);

            // const isConfirmed = await confirmTx(connection, signature);
            const isConfirmed = await confirmTx(connection, signature, "processed");

            if (isConfirmed) {
                console.log(`✅ [${getTimestamp()}] Success: https://solscan.io/tx/${signature}`);
                return signature;
            }

            // --- ESCALATION ON FAILURE ---
            console.warn(`⚠️ [${getTimestamp()}] Attempt ${attempt} failed (Likely 0x1771 Slippage). Increasing buffers...`);
            
            // Boost both fee and slippage aggressively
            currentPriorityFee += 0.002; 
            currentSlippage = 99; // 25% -> 40% -> 55%

        } catch (e: any) {
            console.error(`[${getTimestamp()}] [PUMP ERROR] Attempt ${attempt}:`, e.message);
            
            if (e.message.includes("400")) throw e; // Stop if payload is wrong
            if (attempt === maxRetries) throw e;
            
            await sleepWithAbort(1500, new AbortController().signal);
        }
    }
}