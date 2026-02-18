import { Connection, Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import { distributeSolPerWallet, generateSubWalletsInFile } from "./wallet";
import { executeSwap } from "./jupiter";

export async function buyHolders(tokenAddress : string, amount: number) {
    const connection = new Connection(process.env.RPC_URL!, "confirmed");
    const mainWallet = Keypair.fromSecretKey(bs58.decode(process.env.MAIN_PRIVATE_KEY!));

    const holderWallets = generateSubWalletsInFile(amount, "./holders-wallets.json");

    for (const holder of holderWallets) {
        try {
            const wallet = Keypair.fromSecretKey(bs58.decode(holder.secretKey));
    
            distributeSolPerWallet(connection, mainWallet, 0.002, wallet);
    
            console.log(`[HOLDERS] Funded holder wallet ${wallet.publicKey.toBase58()} with 0.002 SOL`);
            
            executeSwap(connection, wallet, tokenAddress, "BUY", false, 0.001);
    
            console.log(`[HOLDERS] Executed buy for holder wallet ${wallet.publicKey.toBase58()}`);
        } catch (error) {
            console.error(`[HOLDERS ERROR] Failed to process holder wallet ${holder.publicKey}:`, error);
        }
    }


    console.log("[HOLDERS] Completed buying for all holder wallets.");
}