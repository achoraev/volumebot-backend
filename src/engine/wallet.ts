import {
    Connection,
    PublicKey,
    LAMPORTS_PER_SOL,
    Keypair,
    SystemProgram,
    Transaction,
    sendAndConfirmTransaction
} from "@solana/web3.js";
import { getAssociatedTokenAddress } from "@solana/spl-token";

import bs58 from "bs58";
import fs from "fs";
import path from "path";
import { executePumpSwap } from "./pump";
import { sleepWithAbort } from "../utils/utils";

const SUB_WALLETS_PATH = path.join(process.cwd(), "sub-wallets.json");

export const reclaimAllTokensAndSol = async (connection: Connection, mainWallet: Keypair, tokenMint: string, signal: AbortSignal) => {
    if (!fs.existsSync(SUB_WALLETS_PATH)) {
        console.log("⚠️  [RECLAIM] No sub-wallets found for reclaiming. Skipping...");
        return;
    }

    const subWalletsData = JSON.parse(fs.readFileSync(SUB_WALLETS_PATH, 'utf-8'));
    const mintPubkey = new PublicKey(tokenMint);

    console.log(`[RECLAIM] Starting reclaim for ${subWalletsData.length} wallets...`);

    for (const wallet of subWalletsData) {
        await reclaimAllTokensAndSolPerWallet(wallet, connection, tokenMint, signal);
        await sleepWithAbort(2000, signal);
        await reclaimAllFundsFromWallet(connection, mainWallet, wallet);
        console.log(`♻️ Fully Reclaimed: ${wallet.publicKey.toBase58().slice(0, 6)}`);
    }

    console.log("✅ All wallets processed for reclaiming.");
};


export async function reclaimAllTokensAndSolPerWallet(wallet: any, connection: Connection, tokenMint: string, signal: AbortSignal) {
    try {
        const subKp = Keypair.fromSecretKey(bs58.decode(wallet.secretKey));
        const ata = await getAssociatedTokenAddress(new PublicKey(tokenMint), subKp.publicKey);
        const tokenBalance = await connection.getTokenAccountBalance(ata).catch(() => ({ value: { uiAmount: 0 } }));

        if (tokenBalance.value.uiAmount && tokenBalance.value.uiAmount > 0) {
            console.log(`💼 [RECLAIM] Token balance for ${subKp.publicKey.toBase58().slice(0, 6)}: ${tokenBalance.value.uiAmount}`);

            await executePumpSwap(connection, subKp, tokenMint, "SELL", "100%");
        }

        // const balance = await connection.getBalance(subKp.publicKey);
        // console.log(`💰 [RECLAIM] SOL balance for ${subKp.publicKey.toBase58().slice(0, 6)}: ${balance} Lamports`);
        // console.log(`💰 [RECLAIM] SOL balance for ${subKp.publicKey.toBase58().slice(0, 6)}: ${balance / LAMPORTS_PER_SOL} SOL`);
        // if (balance < 5000) continue;
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
        // const transaction = new Transaction().add(
        //     SystemProgram.transfer({
        //         fromPubkey: subKp.publicKey,
        //         toPubkey: mainWallet.publicKey,
        //         lamports: balance - 5000,
        //     })
        // );
        // const { blockhash } = await connection.getLatestBlockhash();
        // transaction.recentBlockhash = blockhash;
        // transaction.sign(subKp); // Sign with sub-wallet to authorize close/transfer
        // const sig = await connection.sendRawTransaction(transaction.serialize());

    } catch (e: any) {
        console.error(`[RECLAIM ERROR] Sub-wallet ${wallet.publicKey.slice(0, 4)}:`, e.message);
    }
}

export async function loadWallets(): Promise<Keypair[]> {
    try {
        const walletPath = path.join(process.cwd(), "sub-wallets.json");
        const data = fs.readFileSync(walletPath, "utf-8");
        const json = JSON.parse(data);

        return json.map((w: any) =>
            Keypair.fromSecretKey(bs58.decode(w.secretKey))
        );
    } catch (error) {
        console.error("Could not load wallets. Will generate it in: ", path.join(process.cwd(), "sub-wallets.json"));
        const wallets = generateSubWallets(10);
        return wallets.map((w: any) => Keypair.fromSecretKey(bs58.decode(w.secretKey)));
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

export const generateSubWallets = (count: number) => {
    const walletPath = path.join(process.cwd(), "sub-wallets.json");
    if (fs.existsSync(walletPath)) {
        console.log(`⚠️  Sub wallets file already exists. Skipping wallet generation.`);
        return JSON.parse(fs.readFileSync(SUB_WALLETS_PATH, 'utf-8'));
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
    fs.writeFileSync(SUB_WALLETS_PATH, JSON.stringify(newWallets, null, 2));
    console.log(`✅ Generated ${count} sub-wallets in ${SUB_WALLETS_PATH}`);
    return newWallets;
};

export const distributeSolPerWallet = async (connection: Connection, mainWallet: Keypair, amountPerWallet: number, currentWallet: Keypair) => {
    console.log(`[SYSTEM] Funding ${currentWallet.publicKey} wallet with ${amountPerWallet} SOL`);

    const lamports = amountPerWallet * 1_000_000_000;
    const transaction = new Transaction().add(
        SystemProgram.transfer({
            fromPubkey: mainWallet.publicKey,
            toPubkey: currentWallet.publicKey,
            lamports: lamports,
        })
    );

    const sig = await sendAndConfirmTransaction(connection, transaction, [mainWallet]);
    console.log(`💰 Funded ${currentWallet.publicKey.toBase58().slice(0, 6)}... | Sig: ${sig.slice(0, 8)}`);
};

// export const distributeSol = async (connection: Connection, mainWallet: Keypair, amountPerWallet: number) => {
//     const subWallets = JSON.parse(fs.readFileSync(SUB_WALLETS_PATH, 'utf-8'));
//     const lamports = amountPerWallet * 1_000_000_000;

//     console.log(`[SYSTEM] Funding ${subWallets.length} wallets with ${amountPerWallet} SOL each...`);

//     for (const walletInfo of subWallets) {
//         const transaction = new Transaction().add(
//             SystemProgram.transfer({
//                 fromPubkey: mainWallet.publicKey,
//                 toPubkey: new PublicKey(walletInfo.address),
//                 lamports: lamports,
//             })
//         );

//         const sig = await sendAndConfirmTransaction(connection, transaction, [mainWallet]);
//         console.log(`💰 Funded ${walletInfo.address.slice(0, 6)}... | Sig: ${sig.slice(0, 8)}`);
//     }
// };

export const reclaimAllFundsFromWallet = async (connection: Connection, mainWallet: Keypair, currentWallet: Keypair) => {
    try {
        const balance = await connection.getBalance(currentWallet.publicKey);

        if (balance <= 5000) {
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
        console.log(`✅ Swept ${lamportsToTransfer / LAMPORTS_PER_SOL} SOL from ${currentWallet.publicKey.toBase58().slice(0, 6)}... | Sig: ${sig.slice(0, 8)}`);
    } catch (err) {
        console.error(`❌ Failed to sweep ${currentWallet.publicKey.toBase58()}:`, err);
    }
};

export async function withdrawAll() {
    const connection = new Connection(process.env.RPC_URL!, "confirmed");
    const mainWallet = Keypair.fromSecretKey(bs58.decode(process.env.MAIN_PRIVATE_KEY!));

    reclaimAllFunds(connection, mainWallet);
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

export { };