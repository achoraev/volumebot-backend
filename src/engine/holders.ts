import { Connection, Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import { distributeSolPerWallet, generateSubWallets, reclaimAllSolFromWallet } from "./wallet";
import { executeSwap } from "./jupiter";
import { getMainWallet, sleepWithAbort } from "../utils/utils";

export async function buyHolders(tokenAddress: string, holders: number, amountPerHolder: number) {
    const connection = new Connection(process.env.RPC_URL!, "confirmed");

    let holderWallets = await generateSubWallets(holders, "holders-wallets.json", false);

    if (holderWallets.length < holders) {
        holderWallets = await generateSubWallets(holders, "holders-wallets.json", true);
    }

    for (const holder of holderWallets.slice(0, holders)) {
        try {
            const wallet = Keypair.fromSecretKey(bs58.decode(holder.secretKey));

            await distributeSolPerWallet(connection, getMainWallet(), amountPerHolder, wallet);

            console.log(`[HOLDERS] Funded holder wallet ${wallet.publicKey.toBase58()} with ${amountPerHolder} SOL for token ${tokenAddress}`);

            await sleepWithAbort(3000, new AbortController().signal);

            console.log(`[HOLDERS] Executing buy for token ${tokenAddress} from holder wallet ${wallet.publicKey.toBase58()}`);
            await executeSwap(connection, wallet, tokenAddress, "BUY", false, 0.0012);

            console.log(`[HOLDERS] Executed buy for holder wallet ${wallet.publicKey.toBase58()}`);
            await sleepWithAbort(2000, new AbortController().signal);
            await reclaimAllSolFromWallet(connection, wallet, getMainWallet());
            await sleepWithAbort(5000, new AbortController().signal);
        } catch (error) {
            console.error(`[HOLDERS ERROR] Failed to process holder wallet ${holder.publicKey}:`, error);
        }
    }

    console.log("[HOLDERS] Completed buying for all holder wallets.");
}