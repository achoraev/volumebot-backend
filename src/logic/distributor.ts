import { 
    Connection, 
    Keypair, 
    SystemProgram, 
    Transaction, 
    sendAndConfirmTransaction, 
    LAMPORTS_PER_SOL 
} from "@solana/web3.js";
import { loadWallets } from "../engine/wallet";
import bs58 from "bs58";

export async function withdrawAll() {
    const connection = new Connection(process.env.RPC_URL!, "confirmed");
    const mainWallet = Keypair.fromSecretKey(bs58.decode(process.env.MAIN_PRIVATE_KEY!));
    const childWallets = await loadWallets();

    console.log(`🔄 Sweeping funds from ${childWallets.length} wallets back to Main...`);

    for (const wallet of childWallets) {
        try {
            const balance = await connection.getBalance(wallet.publicKey);
            
            if (balance < 5000) continue; 

            const transaction = new Transaction().add(
                SystemProgram.transfer({
                    fromPubkey: wallet.publicKey,
                    toPubkey: mainWallet.publicKey,
                    lamports: balance - 5000,
                })
            );

            const sig = await sendAndConfirmTransaction(connection, transaction, [wallet]);
            console.log(`✅ Swept ${balance / LAMPORTS_PER_SOL} SOL from ${wallet.publicKey.toBase58().slice(0,4)}...`);
        } catch (err) {
            console.error(`❌ Failed to sweep ${wallet.publicKey.toBase58()}:`, err);
        }
    }
}

export async function distributeFunds(amountPerWallet: number) {
    const connection = new Connection(process.env.RPC_URL!, "confirmed");
    const mainWallet = Keypair.fromSecretKey(bs58.decode(process.env.MAIN_PRIVATE_KEY!));
    const childWallets = await loadWallets();

    const transaction = new Transaction();

    console.log(`💸 Preparing to distribute ${amountPerWallet} SOL to ${childWallets.length} wallets...`);

    childWallets.forEach((wallet) => {
        const transferInstruction = SystemProgram.transfer({
            fromPubkey: mainWallet.publicKey,
            toPubkey: wallet.publicKey,
            lamports: amountPerWallet * LAMPORTS_PER_SOL,
        });
        transaction.add(transferInstruction);
    });

    try {
        const signature = await sendAndConfirmTransaction(
            connection, 
            transaction, 
            [mainWallet]
        );
        console.log(`✅ Success! Distributed funds in one TX: ${signature}`);
        return signature;
    } catch (err) {
        console.error("❌ Distribution failed:", err);
        throw err;
    }
}