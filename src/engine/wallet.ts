import {
    Connection,
    PublicKey,
    LAMPORTS_PER_SOL,
    Keypair,
    SystemProgram,
    Transaction,
    sendAndConfirmTransaction
} from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, createCloseAccountInstruction, getAssociatedTokenAddress } from '@solana/spl-token';

import bs58 from "bs58";
import fs from "fs";
import path from "path";
import { executePumpSwap } from "./pump";
import { getMainWallet, sleepWithAbort } from "../utils/utils";
import { SUBWALLETS_FILE } from "../utils/constants";

const SUB_WALLETS_PATH = path.join(process.cwd(), "sub-wallets.json");

export const reclaimAllTokensAndSol = async (connection: Connection, mainWallet: Keypair, tokenMint: string, signal: AbortSignal) => {
    if (!fs.existsSync(SUB_WALLETS_PATH)) {
        console.log("⚠️  [RECLAIM] No sub-wallets found for reclaiming. Skipping...");
        return;
    }

    const subWalletsData = JSON.parse(fs.readFileSync(SUB_WALLETS_PATH, 'utf-8'));

    console.log(`[RECLAIM] Starting reclaim for ${subWalletsData.length} wallets...`);

    for (const wallet of subWalletsData) {
        await reclaimAllTokensPerWallet(connection, wallet, mainWallet, tokenMint);
        await sleepWithAbort(2000, signal);
        await reclaimAllSolFromWallet(connection, mainWallet, wallet);
        console.log(`♻️ Fully Reclaimed: ${wallet.publicKey.toBase58().slice(0, 6)}`);
    }

    console.log("✅ All wallets processed for reclaiming.");
};


export async function reclaimAllTokensPerWallet(connection: Connection, wallet: Keypair, mainWallet: Keypair, tokenMint: string) {
    try {
        
        const ata = await getAssociatedTokenAddress(new PublicKey(tokenMint), wallet.publicKey);
        const tokenBalance = await connection.getTokenAccountBalance(ata).catch(() => ({ value: { uiAmount: 0 } }));

        if (tokenBalance.value.uiAmount && tokenBalance.value.uiAmount > 0) {
            console.log(`💼 [RECLAIM] Token balance from wallet ${wallet.publicKey.toBase58()}: ${tokenBalance.value.uiAmount}`);

            await executePumpSwap(connection, wallet, tokenMint, "SELL", "100%");
        }

        // // Todo Extract later new function that takes care of closing accounts
        // // const transaction = new Transaction().add(
        // //     createCloseAccountInstruction(
        // //         ata,                // Account to close
        // //         mainWallet.publicKey, // Destination for rent SOL
        // //         subKp.publicKey     // Owner of the account
        // //     ),
        // //     // Sweep the remaining SOL
        // //     SystemProgram.transfer({
        // //         fromPubkey: subKp.publicKey,
        // //         toPubkey: mainWallet.publicKey,
        // //         lamports: balance - 10000, // Leave a tiny bit for fee
        // //     })
        // // );
      
    } catch (e: any) {
        console.error(`[RECLAIM ERROR] Sub-wallet ${wallet.publicKey}:`, e.message);
    }
}

export async function loadWallets(): Promise<Keypair[]> {
    return await loadWalletsFromFile(SUBWALLETS_FILE);
}

export async function loadWalletsFromFile(file: string): Promise<Keypair[]> {
    const walletPath = path.join(process.cwd(), file);
    try {
        const data = fs.readFileSync(walletPath, "utf-8");
        const json = JSON.parse(data);

        return json.map((w: any) =>
            Keypair.fromSecretKey(bs58.decode(w.secretKey))
        );
    } catch (error) {
        console.error("Could not load wallets. Error: ", error);
        // const wallets = generateSubWallets(10, SUBWALLETS_FILE, true);
        // return wallets.map((w: any) => Keypair.fromSecretKey(bs58.decode(w.secretKey)));
        return [];
    }
}

export async function getAllBalances() {
    const connection = new Connection(process.env.RPC_URL!);
    const wallets = await loadWallets();

    const publicKeys = wallets.map(w => w.publicKey);

    const accounts = await connection.getMultipleAccountsInfo(publicKeys);

    return accounts.map((acc, index) => ({
        address: publicKeys[index].toBase58(),
        balance: acc ? acc.lamports / LAMPORTS_PER_SOL : 0,
        status: acc ? (acc.lamports / LAMPORTS_PER_SOL < 0.01 ? "LOW" : "OK") : "EMPTY"
    }));
}

// export const getRandomWallet = (): Keypair => {
//     try {
//         const filePath = path.join(process.cwd(), "wallets.json");
//         const data = fs.readFileSync(filePath, 'utf8');
//         const privateKeys = JSON.parse(data);

//         if (!Array.isArray(privateKeys) || privateKeys.length === 0) {
//             throw new Error("wallets.json is empty or invalid (must be an array).");
//         }

//         const randomIndex = Math.floor(Math.random() * privateKeys.length);
//         const randomKey = privateKeys[randomIndex];

//         console.log(`✅ Loaded random wallet: ${randomKey.publicKey}`);

//         return Keypair.fromSecretKey(bs58.decode(randomKey.secretKey));
//     } catch (error: any) {
//         console.error("❌ Failed to load random wallet:", error.message + (error.stack ? "\n" + error.stack : ""));

//         const workerKey = process.env.MAIN_PRIVATE_KEY;
//         if (workerKey) return Keypair.fromSecretKey(bs58.decode(workerKey));
//         throw new Error("No valid wallet found in wallets.json or .env");
//     }
// };

export const generateSubWallets = (count: number, file: string, forceGenerate: boolean) => {
    const walletPath = path.join(process.cwd(), file);
    if (fs.existsSync(walletPath) && !forceGenerate) {
        console.log(`⚠️  Sub wallets file already exists. Skipping wallet generation.`);
        return JSON.parse(fs.readFileSync(walletPath, 'utf-8'));
    }

    const newWallets = [];
    for (let i = 0; i < count; i++) {
        const kp = Keypair.generate();
        newWallets.push({
            id: i + 1,
            address: kp.publicKey.toBase58(),
            secretKey: bs58.encode(kp.secretKey)
        });
    }
    fs.writeFileSync(walletPath, JSON.stringify(newWallets, null, 2));
    console.log(`✅ Generated ${count} sub-wallets in ${walletPath}`);
    return newWallets;
};

export const distributeSolPerWallet = async (connection: Connection, mainWallet: Keypair, amountPerWallet: number, currentWallet: Keypair) => {
    console.log(`[WALLET] Funding ${currentWallet.publicKey} wallet with ${amountPerWallet} SOL`);

    const lamports = amountPerWallet * 1_000_000_000;
    const transaction = new Transaction().add(
        SystemProgram.transfer({
            fromPubkey: mainWallet.publicKey,
            toPubkey: currentWallet.publicKey,
            lamports: lamports,
        })
    );

    const { blockhash } = await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    const sig = await sendAndConfirmTransaction(connection, transaction, [mainWallet]);
    console.log(`💰 Funded ${currentWallet.publicKey.toBase58()} | Sig: ${sig.slice(0, 8)}`);
};

export const reclaimAllSolFromWallet = async (connection: Connection, currentWallet: Keypair, mainWallet: Keypair) => {
    try {
        const balance = await connection.getBalance(currentWallet.publicKey);
        console.log(`🔄 Reclaiming SOL from ${currentWallet.publicKey.toBase58()} (Balance: ${balance / LAMPORTS_PER_SOL} SOL)`);

        if (balance < 5000) {
            console.log(`⚠️  Wallet ${currentWallet.publicKey.toBase58()} has insufficient funds to reclaim (Balance: ${balance / LAMPORTS_PER_SOL} SOL). Skipping...`);
            return;
        }

        const lamportsToTransfer = Math.max(balance - 5000, 0);
        const transaction = new Transaction().add(
            SystemProgram.transfer({
                fromPubkey: currentWallet.publicKey,
                toPubkey: mainWallet.publicKey,
                lamports: lamportsToTransfer,
            })
        );

        const sig = await sendAndConfirmTransaction(connection, transaction, [currentWallet]);
        console.log(`✅ Swept ${lamportsToTransfer / LAMPORTS_PER_SOL} SOL from ${currentWallet.publicKey.toBase58()} | Sig: ${sig.slice(0, 8)}`);
    } catch (err) {
        console.error(`❌ Failed to sweep ${currentWallet.publicKey.toBase58()}:`, err);
    }
};

export async function withdrawAll() {
    const connection = new Connection(process.env.RPC_URL!, "confirmed");

    reclaimAllFunds(connection, getMainWallet());
}

export const reclaimAllFunds = async (connection: Connection, mainWallet: Keypair) => {
    if (!fs.existsSync(SUB_WALLETS_PATH)) return;

    const childWallets = await loadWallets();

    console.log(`[RECLAIM] Starting sweep for ${childWallets.length} wallets...`);

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
            console.log(`✅ Swept ${balance / LAMPORTS_PER_SOL} SOL from ${wallet.publicKey.toBase58().slice(0, 4)}...`);
        } catch (err) {
            console.error(`❌ Failed to sweep ${wallet.publicKey.toBase58()}:`, err);
            return;
        }
    }
    console.log("✅ All funds withdrawn to Main Wallet.");
};

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


export async function reclaimRent(con: Connection, wallet: Keypair) {

    const connection = con;
    const myWallet = wallet;

    // todo load wallets from file
    const accounts = await loadWallets()

    const transaction = new Transaction();

    // Todo not implemented yet

    // for (let index = 0; index < accounts.length; index++) {
    //     const element = array[index];


        
    // }




    // accounts.forEach((accountInfo) => {
    //     const amount = accountInfo.account.data.parsed.info.tokenAmount.uiAmount;
    //     const pubkey = accountInfo.pubkey;

    //     // 2. Check if the balance is zero
    //     if (amount === 0) {
    //         console.log(`Adding empty account to close list: ${pubkey.toBase58()}`);
            
    //         // 3. Add the close instruction
    //         transaction.add(
    //             createCloseAccountInstruction(
    //                 pubkey,    // Account to close
    //                 myWallet,  // Destination for the SOL refund
    //                 myWallet   // Owner of the account
    //             )
    //         );
    //     }
    // });

    // const sig = await sendAndConfirmTransaction(connection, transaction, [wallet]);

}

export { };