import { Keypair, VersionedTransaction, Connection } from "@solana/web3.js";
import fetch from "cross-fetch";
import { confirmTx } from "../utils/utils"; // Import the helper we created

export async function executePumpSwap(
    connection: Connection,
    wallet: Keypair,
    mint: string,
    action: "BUY" | "SELL",
    amount: number | string,
    slippage: number = 15, // Higher slippage (15%) recommended for retries
    maxRetries: number = 3
) {
    let currentPriorityFee = 0.0005; // Starting Tip
    const finalAmount = action === "SELL" ? "100%" : amount;

    console.log(`[PUMP] Initiating ${action} for token ${mint} Amount: ${finalAmount} ${action === "BUY" ? "SOL" : "tokens"}, Slippage: ${slippage}%`);

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const solBalance = await connection.getBalance(wallet.publicKey);
            if (solBalance < 5000) {
                console.log(`⚠️ [BALANCE] Wallet ${wallet.publicKey.toBase58()} too low. Skipping.`);
                console.log (`💡 Tip: Ensure the wallet has enough SOL to cover fees for retries. Current balance: ${solBalance} `);
                return null;
            }

            console.log(`[PUMP] Attempt ${attempt}/${maxRetries} | Fee: ${currentPriorityFee} SOL | ${action} ${finalAmount}`);

            const response = await fetch(`https://pumpportal.fun/api/trade-local`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    publicKey: wallet.publicKey.toBase58(),
                    action: action.toLowerCase(),
                    mint: mint,
                    amount: finalAmount,
                    denominatedInSol: action === "BUY" ? "true" : "false",
                    slippage: slippage,
                    priorityFee: currentPriorityFee,
                    pool: "pump"
                })
            });

            if (!response.ok) {
                const text = await response.text();
                throw new Error(`PumpPortal API Error (${response.status}): ${text}`);
            }

            const arrayBuffer = await response.arrayBuffer();
            const tx = VersionedTransaction.deserialize(new Uint8Array(arrayBuffer));

            // 2. Refresh Blockhash & Sign
            const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
            tx.message.recentBlockhash = blockhash;
            tx.sign([wallet]);

            // 3. Send Transaction
            const signature = await connection.sendRawTransaction(tx.serialize(), {
                skipPreflight: true, // We check success manually via confirmation
                maxRetries: 0        // We are handling retries in this loop
            });

            console.log(`📡 Sent: ${signature.slice(0, 8)}... Waiting for confirmation.`);

            // 4. Confirm using the helper function
            const isConfirmed = await confirmTx(connection, signature);

            if (isConfirmed) {
                console.log(`✅ Success: https://solscan.io/tx/${signature}`);
                return signature;
            }

            // 5. Escalation: If not confirmed, increase fee and try again
            console.warn(`⚠️ Attempt ${attempt} failed to land. Escalating fee...`);
            currentPriorityFee += 0.0005;

        } catch (e: any) {
            console.error(`[PUMP ERROR] Attempt ${attempt}:`, e.message);
            
            if (e.message.includes("400")) {
                console.error("❌ Critical: Malformed request. Check if mint address or amount is valid.");
                throw e; 
            }

            if (attempt === maxRetries) throw e;
            await new Promise(res => setTimeout(res, 2000));
        }
    }
}