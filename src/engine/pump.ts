import { Keypair, VersionedTransaction, Connection } from "@solana/web3.js";
import fetch from "cross-fetch";
import bs58 from "bs58";

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
        console.log(`[PUMP] Initiating ${action} for token ${mint} Amount: ${finalAmount} ${action === "BUY" ? "SOL" : "tokens"}, Slippage: ${slippage}%`);

        const solBalance = await connection.getBalance(wallet.publicKey);

        if (solBalance < 5000) {
            console.log(`⚠️  [RECLAIM] Insufficient SOL balance for ${wallet.publicKey.toBase58()} to make a sale. Skipping...`);
            return null;
        }

        const response = await fetch(`https://pumpportal.fun/api/trade-local`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                publicKey: wallet.publicKey.toBase58(),
                action: action.toLowerCase(),
                mint: mint,
                amount: finalAmount,
                denominatedInSol: action === "BUY" ? "true" : "false",
                slippage: slippage,
                priorityFee: 0.0005,
                pool: "auto"
            })
        });

        if (!response.ok) {
            const text = await response.text();
            throw new Error(`PumpPortal API Error (${response.status}): ${text}`);
        }

        if (response.status === 200) {
            const data = await response.arrayBuffer();
            const tx = VersionedTransaction.deserialize(new Uint8Array(data));
            const signerKeyPair = Keypair.fromSecretKey(bs58.decode(wallet.publicKey.toBase58()));
            tx.sign([signerKeyPair]);
            const signature = await connection.sendTransaction(tx)
            console.log(`✅ Pump.fun Success: https://solscan.io/tx/${signature}`);
            return signature;
        } else {
            console.log(response.statusText);
            console.log(`❌ Pump.fun ${action} failed for token ${mint}. Response: ${await response.text()}`);
        }
    } catch (e: any) {
        console.error("[PUMP ERROR]", e.message + (e.stack ? "\n" + e.stack : ""));
        throw e;
    }
}