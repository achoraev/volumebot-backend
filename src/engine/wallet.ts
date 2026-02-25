import {
    Connection,
    PublicKey,
    LAMPORTS_PER_SOL,
    Keypair,
    SystemProgram,
    Transaction,
    sendAndConfirmTransaction
} from "@solana/web3.js";
import { createCloseAccountInstruction, getAssociatedTokenAddress } from '@solana/spl-token';

import bs58 from "bs58";
import fs from "fs";
import path from "path";
import { executePumpSwap } from "./pump2";
import { checkBalancePerWallet, getMainWallet, getTimestamp, sleepWithAbort } from "../utils/utils";
import { HOLDERS_WALLET_FILE, SUBWALLETS_FILE, TOKEN_ADDRESS } from "../utils/constants";

const SUB_WALLETS_PATH = path.join(process.cwd(), SUBWALLETS_FILE);
const HOLDERS_WALLETS_PATH = path.join(process.cwd(), HOLDERS_WALLET_FILE);

// export const reclaimAllTokensAndSol = async (connection: Connection, mainWallet: Keypair, tokenMint: string, signal: AbortSignal) => {
//     if (!fs.existsSync(SUB_WALLETS_PATH)) {
//         console.log("⚠️  [RECLAIM] No sub-wallets found for reclaiming. Skipping...");
//         return;
//     }

//     const subWalletsData = JSON.parse(fs.readFileSync(SUB_WALLETS_PATH, 'utf-8'));

//     console.log(`[RECLAIM] Starting reclaim for ${subWalletsData.length} wallets...`);

//     for (const wallet of subWalletsData) {
//         await reclaimAllTokensPerWallet(connection, wallet, mainWallet, tokenMint);
//         await sleepWithAbort(2000, signal);
//         await reclaimAllSolFromWallet(connection, mainWallet, wallet);
//         console.log(`♻️ Fully Reclaimed: ${wallet.publicKey.toBase58().slice(0, 6)}`);
//     }

//     console.log("✅ All wallets processed for reclaiming.");
// };

export async function reclaimAllTokensPerWallet(connection: Connection, wallet: Keypair, mainWallet: Keypair, tokenMint: string) {
    try {

        console.log(`[RECLAIM] Checking token account for ${wallet.publicKey.toBase58()}... and token mint ${tokenMint}` );
        // const ata = await getAssociatedTokenAddress(new PublicKey(tokenMint), wallet.publicKey);
        
        const ata2 = await connection.getParsedTokenAccountsByOwner(
            wallet.publicKey,
            { mint: new PublicKey(tokenMint) },
            'processed'
        );

        const accountInfo = await connection.getAccountInfo(ata2.value[0]?.pubkey);

        if (!accountInfo) {
            console.log(`[RECLAIM] No token account found for ${wallet.publicKey.toBase58()}. Nothing to sell.`);
            return;
        }
        const tokenBalance = await connection.getTokenAccountBalance(ata2.value[0].pubkey);
        const rawAmount = BigInt(tokenBalance.value.amount);
        console.log(`[RECLAIM] Token balance for ${wallet.publicKey.toBase58()}: ${tokenBalance.value.uiAmount} (raw: ${rawAmount})`);

        if (rawAmount > BigInt(0)) {
            console.log(`💼 [RECLAIM] Found ${tokenBalance.value.uiAmount} tokens. Executing final sell...`);

            // Execute the swap using your high-speed retry logic
            const signature = await executePumpSwap(connection, wallet, tokenMint, "SELL", "100%");
            
            if (signature) {
                console.log(`✅ [RECLAIM] Successfully sold remaining tokens.`);
                // Wait for the ledger to update before the SOL reclaim starts
                await sleepWithAbort(2000, new AbortController().signal);
            }
        } else {
            console.log(`[RECLAIM] Token balance is already 0 for ${wallet.publicKey.toBase58()}.`);
        }

    } catch (e: any) {
        if (e.message.includes("could not find account")) {
            console.log(`[RECLAIM] ATA already closed for ${wallet.publicKey.toBase58()}.`);
        } else {
            console.error(`[RECLAIM ERROR] Sub-wallet ${wallet.publicKey.toBase58()}:`, e.message);
        }
    }
}

export async function closeAccountAndSweepSol(
    connection: Connection,
    subWallet: Keypair,
    mainWallet: Keypair,
    tokenMint: string
) {
    try {

        const ata = await connection.getParsedTokenAccountsByOwner(
            subWallet.publicKey,
            { mint: new PublicKey(tokenMint) },
            'processed'
        );

        const accountInfo = await connection.getAccountInfo(ata.value[0]?.pubkey);
        const transaction = new Transaction();

        if (accountInfo) {
            transaction.add(
                createCloseAccountInstruction(
                    ata.value[0].pubkey,
                    subWallet.publicKey,
                    subWallet.publicKey
                )
            );
        }

        const balance = await connection.getBalance(subWallet.publicKey);
        if (balance > 5000) {
            transaction.add(
                SystemProgram.transfer({
                    fromPubkey: subWallet.publicKey,
                    toPubkey: mainWallet.publicKey,
                    lamports: balance - 10000,
                })
            );
        }

        if (transaction.instructions.length > 0) {
            const signature = await sendAndConfirmTransaction(connection, transaction, [subWallet]);
            console.log(`✨ [CLOSED & SWEPT] Signature: ${signature}`);
        }
    } catch (e: any) {
        console.error("❌ Cleanup failed:", e.message);
    }
}

export async function loadWallets(): Promise<Keypair[]> {
    return await loadWalletsFromFile(SUBWALLETS_FILE);
}

export async function loadWalletsFromFile(file: string): Promise<Keypair[]> {

    try {
        const data = fs.readFileSync(file, "utf-8");
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

export async function getTokenBalance(
    connection: Connection,
    walletAddress: PublicKey,
    tokenMintAddress: string
): Promise<{ uiAmount: number; rawAmount: string }> {
    try {        
        const ata = await getAssociatedTokenAddress(new PublicKey(tokenMintAddress), walletAddress);

        const balanceResponse = await connection.getTokenAccountBalance(ata);

        return {
            uiAmount: balanceResponse.value.uiAmount ?? 0,
            rawAmount: balanceResponse.value.amount
        };

    } catch (e: any) {
        if (e.message.includes("could not find account") || e.message.includes("invalid account data")) {
            return { uiAmount: 0, rawAmount: "0" };
        }
        
        console.error(`❌ Error fetching balance for ${walletAddress.toBase58()}:`, e.message);
        return { uiAmount: 0, rawAmount: "0" };
    }
}

export async function getAllBalances() {
    return await getAllBalancesPerFile(SUB_WALLETS_PATH, TOKEN_ADDRESS);
}

export async function getAllBalancesPerFile(file: string, tokenMint?: string) {
    const connection = new Connection(process.env.RPC_URL!);
    const wallets = await loadWalletsFromFile(file || HOLDERS_WALLETS_PATH);
    const publicKeys = wallets.map(w => w.publicKey);

    // Get SOL balances
    const accounts = await connection.getMultipleAccountsInfo(publicKeys);

    // Fetch Token Balances (Optional but recommended for your UI)
    const results = await Promise.all(publicKeys.map(async (pk, index) => {
        const acc = accounts[index];
        const solBalance = acc ? acc.lamports / LAMPORTS_PER_SOL : 0;
        
        let tokenBalance = 0;

        if (tokenMint) {
            try {
                const tokenAccounts = await connection.getParsedTokenAccountsByOwner(pk, {
                    mint: new PublicKey(tokenMint),
                    programId: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA")
                });
                
                tokenBalance = tokenAccounts.value.reduce((acc, curr) => 
                    acc + curr.account.data.parsed.info.tokenAmount.uiAmount, 0
                );
            } catch (e) {
                tokenBalance = 0;
            }
        }

        return {
            address: pk.toBase58(),
            balance: solBalance,
            tokenBalance: tokenBalance, // ✅ Now the frontend will see this
            status: solBalance < 0.01 ? "LOW" : "OK"
        };
    }));

    return results;
}

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
    console.log(`[${getTimestamp()}] [WALLET] Funding ${currentWallet.publicKey} wallet with ${amountPerWallet} SOL`);

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
    console.log(`💰 [${getTimestamp()}] Funded ${currentWallet.publicKey.toBase58()} | Sig: ${sig.slice(0, 8)}`);
};

export const reclaimAllSolFromWallet = async (connection: Connection, currentWallet: Keypair, mainWallet: Keypair) => {
    try {
        const balance = await checkBalancePerWallet(connection, currentWallet);
        console.log(`🔄 [${getTimestamp()}] Reclaiming SOL from ${currentWallet.publicKey.toBase58()} (Balance: ${balance / LAMPORTS_PER_SOL} SOL)`);

        const lamportsToTransfer = Math.max(balance - 5000, 0);
        const transaction = new Transaction().add(
            SystemProgram.transfer({
                fromPubkey: currentWallet.publicKey,
                toPubkey: mainWallet.publicKey,
                lamports: lamportsToTransfer,
            })
        );

        const sig = await sendAndConfirmTransaction(connection, transaction, [currentWallet]);
        console.log(`✅ [${getTimestamp()}] Swept ${lamportsToTransfer / LAMPORTS_PER_SOL} SOL from ${currentWallet.publicKey.toBase58()} | Sig: ${sig.slice(0, 8)}`);
    } catch (err) {
        console.error(`❌ [${getTimestamp()}] Failed to sweep ${currentWallet.publicKey.toBase58()}:`, err);
    }
};

export async function withdrawAll() {
    await reclaimAllFundsFromFile(getMainWallet(), SUB_WALLETS_PATH);
    await reclaimAllFundsFromFile(getMainWallet(), HOLDERS_WALLETS_PATH);
}

// export const reclaimAllFunds = async (mainWallet: Keypair) => {
//     if (!fs.existsSync(SUB_WALLETS_PATH)) return;

//     reclaimAllFundsFromFile(mainWallet, SUB_WALLETS_PATH);
// };

export const reclaimAllFundsFromFile = async (mainWallet: Keypair, file: string) => {
    const connection = new Connection(process.env.RPC_URL!, "confirmed");

    if (!fs.existsSync(file)) return;

    const childWallets = await loadWalletsFromFile(file);

    console.log(`[RECLAIM] Starting sweep for ${childWallets.length} wallets from file ${file}...`);

    for (const wallet of childWallets) {
        try {
            if (file.includes(SUBWALLETS_FILE)) {
                await reclaimAllTokensPerWallet(connection, wallet, mainWallet, TOKEN_ADDRESS);
                await closeAccountAndSweepSol(connection, wallet, mainWallet, TOKEN_ADDRESS);
            }

            const balance = await checkBalancePerWallet(connection, wallet);

            if (balance < 5000) {
                console.log(`⚠️  Wallet ${wallet.publicKey.toBase58()} has insufficient funds to sweep (Balance: ${balance / LAMPORTS_PER_SOL} SOL). Skipping...`);
                continue;
            }

            const transaction = new Transaction().add(
                SystemProgram.transfer({
                    fromPubkey: wallet.publicKey,
                    toPubkey: mainWallet.publicKey,
                    lamports: balance - 5000,
                })
            );

            const sig = await sendAndConfirmTransaction(connection, transaction, [wallet]);
            console.log(`💸 Swept ${balance / LAMPORTS_PER_SOL} SOL from ${wallet.publicKey.toBase58()} | Sig: ${sig.slice(0, 8)}`);
        } catch (err) {
            console.error(`❌ Failed to sweep ${wallet.publicKey.toBase58()}:`, err);
            return;
        }
    }
    console.log("✅ All funds withdrawn to Main Wallet.");
}

export async function distributeFunds(amountPerWallet: number) {
    const connection = new Connection(process.env.RPC_URL!, "confirmed");
    const mainWallet = Keypair.fromSecretKey(bs58.decode(process.env.MAIN_PRIVATE_KEY!));
    const childWallets = await loadWalletsFromFile(SUBWALLETS_FILE);

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