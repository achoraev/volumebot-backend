import { Connection, Keypair, VersionedTransaction } from '@solana/web3.js';
import axios from 'axios';
import { checkBalance } from './utils';

const RAYDIUM_API_BASE = "https://transaction-v1.raydium.io";
const MAX_RETRIES = 3;
const INITIAL_SLIPPAGE = 100; // 1%

export async function executeRaydiumDirectSwap(
    connection: Connection,
    wallet: Keypair,
    tokenAddr: string,
    action: "BUY" | "SELL",
    amountInLamports: number
) {

    if (action === "BUY") {
        await checkBalance(connection, wallet.publicKey, amountInLamports);
    }

    const inputMint = action === "BUY" ? "So11111111111111111111111111111111111111112" : tokenAddr;
    const outputMint = action === "BUY" ? tokenAddr : "So11111111111111111111111111111111111111112";

    let lastError = null;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            const currentSlippage = INITIAL_SLIPPAGE + (attempt - 1) * 200;
            console.log(`[RAYDIUM] Attempt ${attempt}/${MAX_RETRIES} with slippage: ${currentSlippage / 100}%`);

            const { data: quoteRes } = await axios.get(`${RAYDIUM_API_BASE}/compute/swap-base-in`, {
                params: {
                    inputMint,
                    outputMint,
                    amount: amountInLamports,
                    slippageBps: 1000,
                    txVersion: 'V0'
                }
            });

            if (!quoteRes.success) throw new Error(`Quote Failed: ${quoteRes.msg}`);
            const swapResponse = quoteRes.data;

            if (!swapResponse) {
                throw new Error("Raydium compute failed to return a valid quote.");
            }

            console.log(`[RAYDIUM] Quote success. Building transaction...`);

            const { data: swapTransactions } = await axios.post(`${RAYDIUM_API_BASE}/transaction/swap-base-in`, {
                computeUnitPriceMicroLamports: (500000 * attempt).toString(),
                swapResponse,
                txVersion: 'V0',
                wallet: wallet.publicKey.toBase58(),
                wrapSol: action === "BUY",
                unwrapSol: action === "SELL"
            });

            //  from Raydium API docs, the payload should look like this:
            // const { data: swapTransactions } = await axios.post(
            //     `${RAYDIUM_API_BASE}/transaction/swap-base-in`, 
            //     {
            //       computeUnitPriceMicroLamports: String(priorityFee),
            //       swapResponse,
            //       txVersion,
            //       wallet: owner.publicKey.toBase58(),
            //       wrapSol: isInputSol,
            //       unwrapSol: isOutputSol,
            //       inputAccount: isInputSol ? undefined : inputTokenAcc?.toBase58(),
            //       outputAccount: isOutputSol ? undefined : outputTokenAcc?.toBase58(),
            //     }
            //   )

            console.log(`[RAYDIUM] Transaction payload received. Signing and sending...`);
            console.log("DEBUG: Raydium API Response:", JSON.stringify(swapTransactions));

            if (!swapTransactions.success || !swapTransactions.data) {
                console.error("❌ RAYDIUM API REJECTION:", JSON.stringify(swapTransactions));
                throw new Error(`Raydium could not build transaction: ${swapTransactions.msg || "Unknown reason"}`);
            }

            const txDataArray = swapTransactions.data;
            if (!Array.isArray(txDataArray) || txDataArray.length === 0) {
                throw new Error("Raydium returned success but no transaction instructions found.");
            }

            if (!swapTransactions.success) {
                console.error("❌ Raydium Build Error:", swapTransactions.msg);

                if (swapTransactions.msg?.includes("TokenProgram")) {
                    throw new Error("This token requires Token-2022 support. Check mint extensions.");
                }

                throw new Error(swapTransactions.msg || "Failed to build Raydium transaction.");
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


            // const allTxBuf = swapTransactions.data.map((tx) => Buffer.from(tx.transaction, 'base64'))
            // const allTransactions = allTxBuf.map((txBuf) => isV0Tx ? VersionedTransaction.deserialize(txBuf) : Transaction.from(txBuf))

            // for (const tx of allTransactions) {
            //     const transaction = tx as VersionedTransaction
            //     transaction.sign([owner])
            //     const txId = await connection.sendTransaction(transaction, { skipPreflight: true })
                
            //     const { lastValidBlockHeight, blockhash } = await connection.getLatestBlockhash({
            //       commitment: 'finalized',
            //     })
                
            //     await connection.confirmTransaction(
            //       { blockhash, lastValidBlockHeight, signature: txId },
            //       'confirmed'
            //     )
            // }

            console.log(`✅ Raydium Success on attempt ${attempt}: ${lastSignature}`);
            return lastSignature;
        } catch (error: any) {
            lastError = error;
            const errorMsg = error.response?.data?.msg || error.message;
            console.error(`⚠️ Attempt ${attempt} failed: ${errorMsg} and error: ${JSON.stringify(error.response?.data)}`);

            if (attempt < MAX_RETRIES) {
                const waitTime = attempt * 1000;
                await new Promise(res => setTimeout(res, waitTime));
            } else {
                console.error("❌ All Raydium attempts failed.");
                throw new Error(`Raydium swap failed after ${MAX_RETRIES} attempts: ${lastError.message}`);
            }
        }
    }
}