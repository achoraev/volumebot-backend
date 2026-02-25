import e, { Router, Request, Response } from 'express';
import { Connection, PublicKey, LAMPORTS_PER_SOL, Transaction, SystemProgram, sendAndConfirmTransaction, Keypair } from '@solana/web3.js';
import { startVolumeLoop, stopVolumeLoop } from '../logic/looper';
import { getAllBalances, getAllBalancesPerFile, loadWalletsFromFile } from '../engine/wallet';
import { getStats } from '../logic/tracker';
import { sanitizeSettings } from '../utils/sanitizer';
import bs58 from 'bs58';
import { distributeFunds, withdrawAll } from '../engine/wallet';
import { buyHolders } from '../engine/holders';
import { HOLDERS_WALLET_FILE, HOLDERS_WALLET_PATH, SUB_WALLETS_PATH, TOKEN_ADDRESS } from '../utils/constants';
import { getTimestamp } from '../utils/utils';
import { createAssociatedTokenAccountInstruction, createTransferInstruction, getAssociatedTokenAddress } from '@solana/spl-token';

const connection = new Connection("https://api.mainnet-beta.solana.com");

const router = Router();

router.get('/stats', (req: Request, res: Response) => {
    try {
        const stats = getStats();
        res.json(stats);
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch stats" });
    }
});

router.post('/start-bot', async (req: Request, res: Response) => {
    const { tokenAddress, settings: rawSettings } = req.body;

    if (!tokenAddress) {
        console.warn("[API] Start Bot failed: No token address provided");
        return res.status(400).json({ error: "Token address required" });
    }

    try {
        new PublicKey(tokenAddress);
    } catch (err) {
        return res.status(400).json({ error: "Invalid Solana token address format" });
    }

    const settings = sanitizeSettings(rawSettings);

    console.log(`[${getTimestamp()}] [API] Starting bot for ${tokenAddress} with settings:`, settings);

    try {
        startVolumeLoop(tokenAddress, settings);
        res.json({ message: "Bot started successfully!", settings });
    } catch (err) {
        res.status(500).json({ error: "Failed to start bot" });
    }

    console.log(`\n[${getTimestamp()}] [API] Bot started for ${tokenAddress}`);
});

router.post('/stop-bot', (req: Request, res: Response) => {
    const { tokenAddress } = req.body;
    if (!tokenAddress) return res.status(400).json({ error: "Token address required" });

    stopVolumeLoop(tokenAddress);
    console.log(`[API] Stop signal sent for ${tokenAddress}`);
    res.json({ message: `Stopping bot for ${tokenAddress}...` });
});

router.post('/distribute', async (req: Request, res: Response) => {
    try {
        const { amount } = req.body;
        const fundAmount = typeof amount === 'number' ? amount : 0.01;
        console.log(`[API] Distributing ${fundAmount} SOL to all workers...`);
        const sig = await distributeFunds(fundAmount);
        res.json({ message: `Successfully distributed ${fundAmount} SOL!`, signature: sig });
    } catch (err) {
        console.error("Funding Error: ", err);
        res.status(500).json({ error: "Funding failed. Check Main Wallet balance." });
    }
});

router.post('/withdraw', async (req: Request, res: Response) => {
    try {
        await withdrawAll();
        res.json({ message: "All funds swept to Main Wallet" });
    } catch (err) {
        res.status(500).json({ error: "Withdrawal failed" });
    }
});

router.post('/holders', async (req: Request, res: Response) => {
    try {
        console.log(`[API] Call Api with body: ${req.body.tokenAddress}`);
        const tokenAddress = req.body.tokenAddress || TOKEN_ADDRESS;

        // Todo - Add settings for number of holders and amount per holder
        await buyHolders(tokenAddress, 10, 0.007);
        res.json({ message: "Holder buys executed successfully!" });
    } catch (err) {
        res.status(500).json({ error: "Failed to execute holder buys" });
    }
});

router.get('/balances', async (req: Request, res: Response) => {
    try {
        const balances = await getAllBalances();
        res.json(balances);
    } catch (err) {
        console.error("Balance Fetch Error: ", err);
        res.status(500).json({ error: "Failed to fetch balances" });
    }
});

router.get('/holder-balances', async (req: Request, res: Response) => {
    try {
        const tokenAddress = req.query.tokenAddress as string;
        
        console.log(`[API] Fetching holder balances for token: ${tokenAddress}`);
        
        const balances = await getAllBalancesPerFile(HOLDERS_WALLET_FILE, tokenAddress);

        res.json(balances);
    } catch (err) {
        console.error("Holder Balance Fetch Error: ", err);
        res.status(500).json({ error: "Failed to fetch holder balances" });
    }
});

router.post('/reclaim-all', async (req: Request, res: Response) => {
    const { destination, type, tokenMint } = req.body;
    const filePath = type === 'makers' ? SUB_WALLETS_PATH : HOLDERS_WALLET_PATH;
    const connection = new Connection(process.env.RPC_URL!);
    const destPubkey = new PublicKey(destination);

    console.log('Destination for reclaim: ', destination, destPubkey.toBase58());
    
    try {
        const wallets = await loadWalletsFromFile(filePath);
        let totalReclaimed = 0;

        for (const wallet of wallets) {
            const transaction = new Transaction();

            // 1. Check for Tokens
            if (tokenMint) {
                const mintPubkey = new PublicKey(tokenMint);
                const sourceATA = await getAssociatedTokenAddress(mintPubkey, wallet.publicKey);
                const destATA = await getAssociatedTokenAddress(mintPubkey, destPubkey);

                try {
                    const tokenAccount = await connection.getTokenAccountBalance(sourceATA);
                    if (tokenAccount.value.uiAmount && tokenAccount.value.uiAmount > 0) {
                        // Create destination ATA if it doesn't exist
                        const accountInfo = await connection.getAccountInfo(destATA);
                        if (!accountInfo) {
                            transaction.add(createAssociatedTokenAccountInstruction(
                                wallet.publicKey, destATA, destPubkey, mintPubkey
                            ));
                        }
                        
                        transaction.add(createTransferInstruction(
                            sourceATA, destATA, wallet.publicKey, BigInt(tokenAccount.value.amount)
                        ));
                    }
                } catch (e) { /* No token account found, skip */ }
            }

            // 2. Check for SOL
            const solBalance = await connection.getBalance(wallet.publicKey);
            if (solBalance > 2000000) { // ~0.002 SOL minimum
                transaction.add(SystemProgram.transfer({
                    fromPubkey: wallet.publicKey,
                    toPubkey: destPubkey,
                    lamports: solBalance - 1500000, // Leave tiny buffer for fees
                }));
            }

            if (transaction.instructions.length > 0) {
                await sendAndConfirmTransaction(connection, transaction, [wallet]);
                totalReclaimed++;
            }
        }
        res.json({ success: true, count: totalReclaimed });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

export default router;