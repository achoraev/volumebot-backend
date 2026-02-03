import { Connection, Keypair, VersionedTransaction } from '@solana/web3.js';
import fetch from 'cross-fetch';

/**
 * Executes a swap using Jupiter V6 API
 * @param wallet The child wallet performing the trade
 * @param outputMint The token address you want to buy/volume
 * @param amountInSol Amount of SOL to spend
 */
export async function createVolume(wallet: Keypair, outputMint: string, amountInSol: number) {
    const connection = new Connection(process.env.RPC_URL || "https://api.mainnet-beta.solana.com");

    try {
        // 1. Get the Quote (Price and Route)
        const amountInLamports = Math.floor(amountInSol * 1_000_000_000);
        const quoteUrl = `https://quote-api.jup.ag/v6/quote?inputMint=So11111111111111111111111111111111111111112&outputMint=${outputMint}&amount=${amountInLamports}&slippageBps=100`;
        
        const quoteResponse = await (await fetch(quoteUrl)).json();

        if (!quoteResponse.outAmount) {
            throw new Error("Unable to get quote from Jupiter");
        }

        // 2. Get the Swap Transaction
        const swapResponse = await (
            await fetch('https://quote-api.jup.ag/v6/swap', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    quoteResponse,
                    userPublicKey: wallet.publicKey.toString(),
                    wrapAndUnwrapSol: true,
                    // Optional: Add priority fees here to ensure trades land
                    prioritizationFeeLamports: 50000 
                })
            })
        ).json();

        // 3. Deserialize and Sign the Transaction
        const swapTransactionBuf = Buffer.from(swapResponse.swapTransaction, 'base64');
        var transaction = VersionedTransaction.deserialize(swapTransactionBuf);
        
        transaction.sign([wallet]);

        // 4. Send the Transaction
        const signature = await connection.sendRawTransaction(transaction.serialize(), {
            skipPreflight: true,
            maxRetries: 2
        });

        console.log(`[SUCCESS] Trade executed by ${wallet.publicKey.toBase58().slice(0,6)}: https://solscan.io/tx/${signature}`);
        return signature;

    } catch (error) {
        console.error(`[ERROR] Swap failed:`, error);
        throw error;
    }
}