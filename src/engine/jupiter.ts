import { Connection, Keypair, VersionedTransaction, PublicKey } from "@solana/web3.js";
import fetch from "cross-fetch";
import { trackSimulatedTrade, checkPriceAlert } from "../logic/tracker";

const PUMP_API_URL = "https://public.jupiterapi.com";
const SOL_MINT = "So11111111111111111111111111111111111111112";

async function getTokenBalance(connection: Connection, wallet: PublicKey, mint: string): Promise<string> {
    try {
        const accounts = await connection.getTokenAccountsByOwner(wallet, {
            mint: new PublicKey(mint)
        });
        if (accounts.value.length === 0) return "0";
        
        const balance = await connection.getTokenAccountBalance(accounts.value[0].pubkey);
        return balance.value.amount;
    } catch (e) {
        return "0";
    }
}

export async function executeSwap(
    connection: Connection, 
    wallet: Keypair, 
    tokenAddr: string, 
    action: "BUY" | "SELL",
    amount?: number,
    isDryRun: boolean = false
) {
    const priceRes = await fetch(`https://api.jup.ag/price/v2?ids=${tokenAddr}`);
    const priceData = await priceRes.json();
    
    if (!priceData.data[tokenAddr]) {
        console.error(`[ERROR] Price data missing for ${tokenAddr}`);
        return;
    }

    const currentPrice = parseFloat(priceData.data[tokenAddr].price);
    const alertMessage = checkPriceAlert(currentPrice);

    if (alertMessage) {
        console.log(`\x1b[33m%s\x1b[0m`, alertMessage);
    }

    if (isDryRun) {
        trackSimulatedTrade(tokenAddr, action, currentPrice, amount || 0);
        
        console.log(`[DRY RUN] 🧪 Simulated ${action} at Market Price: $${currentPrice}`);
        console.log(`[DRY RUN] Wallet: ${wallet.publicKey.toBase58().slice(0, 8)}...`);
        
        await new Promise(r => setTimeout(r, 1000));
        
        return "SIM_SIG_" + Math.random().toString(36).slice(2);    }

    try {
        let inputMint = action === "BUY" ? SOL_MINT : tokenAddr;
        let outputMint = action === "BUY" ? tokenAddr : SOL_MINT;
        let swapAmount: string;

        if (action === "SELL") {
            swapAmount = await getTokenBalance(connection, wallet.publicKey, tokenAddr);
            if (swapAmount === "0" || swapAmount === "undefined") throw new Error("No tokens found to sell.");
            console.log(`[SELL] Selling all tokens (${swapAmount} raw units)...`);
        } else {
            const lamports = Math.floor(amount! * 1_000_000_000);
            swapAmount = lamports.toString();
            
            console.log(`[BUY] Attempting buy: ${amount} SOL (${swapAmount} lamports)`);
        }

        const jupQuoteUrl = `https://lite-api.jup.ag/swap/v1/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${swapAmount}&slippageBps=100`;
        const jupRes = await fetch(jupQuoteUrl);
        const jupData = await jupRes.json();

        let swapTransaction: string | undefined;
        if (jupData.error && jupData.errorCode === "TOKEN_NOT_TRADABLE") {
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
                    slippageBps: 1000
                })
            });

            const pumpData: any = await pumpSwapRes.json();
            swapTransaction = pumpData.swapTransaction;
            
            if (!swapTransaction) {
                throw new Error(`Pump.fun API failed to return a transaction. Error: ${JSON.stringify(pumpData)}`);
            }
        } else {
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

        if (!swapTransaction) {
            throw new Error("Critical: Transaction data is undefined. Skipping execution.");
        }

        const transaction = VersionedTransaction.deserialize(Buffer.from(swapTransaction, 'base64'));
        transaction.sign([wallet]);
        
        const signature = await connection.sendRawTransaction(transaction.serialize(), { 
            skipPreflight: true,
            maxRetries: 3 
        });
        
        console.log(`✅ ${action} Successful: https://solscan.io/tx/${signature}`);
        return signature;

    } catch (error: any) {
        console.error(`[ERROR] ${action} Failed:`, error.message || error);
    }
}