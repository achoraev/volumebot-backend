import { Connection, Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import { distributeSolPerWallet, generateSubWallets, reclaimAllSolFromWallet, withdrawAll } from "./wallet";
import { executeSwap } from "./jupiter";
import { getMainWallet, sleepWithAbort } from "../utils/utils";

export async function buyHolders(tokenAddress: string, holders: number, amountPerHolder: number) {
    const connection = new Connection(process.env.RPC_URL!, "confirmed");

    const holderWallets = await generateSubWallets(holders, "holders-wallets.json");

    for (const holder of holderWallets.slice(0, holders)) {
        try {
            const wallet = Keypair.fromSecretKey(bs58.decode(holder.secretKey));

            await distributeSolPerWallet(connection, getMainWallet(), amountPerHolder, wallet);

            console.log(`[HOLDERS] Funded holder wallet ${wallet.publicKey.toBase58()} with 0.003 SOL`);

            await sleepWithAbort(2000, new AbortController().signal);

            console.log(`[HOLDERS] Executing buy for token ${tokenAddress} from holder wallet ${wallet.publicKey.toBase58()}`);
            await executeSwap(connection, wallet, tokenAddress, "BUY", false, 0.0015);

            console.log(`[HOLDERS] Executed buy for holder wallet ${wallet.publicKey.toBase58()}`);
            await sleepWithAbort(2000, new AbortController().signal);
            await reclaimAllSolFromWallet(connection, holder, getMainWallet());
        } catch (error) {
            console.error(`[HOLDERS ERROR] Failed to process holder wallet ${holder.publicKey}:`, error);
        }
    }

    console.log("[HOLDERS] Completed buying for all holder wallets.");
}