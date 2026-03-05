import e, { Router, Request, Response } from 'express';
import { Connection, PublicKey, LAMPORTS_PER_SOL, Transaction, SystemProgram, sendAndConfirmTransaction, Keypair } from '@solana/web3.js';
import { startVolumeLoop, stopVolumeLoop } from '../logic/looper';
import { getAllBalances, getAllBalancesPerFile, loadWalletsFromFile, reclaimAllTokensPerWallet } from '../engine/wallet';
import { getStats } from '../logic/tracker';
import { sanitizeSettings } from '../utils/sanitizer';
import bs58 from 'bs58';
import { distributeFunds, withdrawAll } from '../engine/wallet';
import { buyHolders } from '../engine/holders';
import { HOLDERS_WALLET_FILE, HOLDERS_WALLET_PATH, SUB_WALLETS_PATH, SUBWALLETS_FILE, TOKEN_ADDRESS } from '../utils/constants';
import { getMainWalletPublicKey, getTimestamp, sleepWithAbort } from '../utils/utils';
import { createAssociatedTokenAccountInstruction, createCloseAccountInstruction, createTransferInstruction, getAssociatedTokenAddress } from '@solana/spl-token';

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
        const { amount, walletType } = req.body;
        const finalAmount = !isNaN(parseFloat(amount)) && parseFloat(amount) > 0 ? parseFloat(amount) : 0.01;
        const file = walletType === 'holders' ? HOLDERS_WALLET_FILE : SUBWALLETS_FILE;
        console.log(`[API] Distributing ${finalAmount} SOL to all ${walletType} wallets`);
        const sig = await distributeFunds(finalAmount, file);
        res.json({ message: `Successfully funded ${walletType} wallets ` + (sig ? `with transaction: ${sig}` : "without transaction signature") });
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

        const balances = await getAllBalancesPerFile(HOLDERS_WALLET_FILE, tokenAddress);

        res.json(balances);
    } catch (err) {
        console.log("Holder Balance Fetch Error: ", err);
        res.status(500).json({ error: "Failed to fetch holder balances" });
    }
});

router.post('/reclaim-all', async (req: Request, res: Response) => {
    const { destination, type, tokenMint } = req.body;
    const filePath = type === 'makers' ? SUB_WALLETS_PATH : HOLDERS_WALLET_PATH;
    const connection = new Connection(process.env.RPC_URL!);
    const destPubkey = new PublicKey(destination);

    console.log(`[${getTimestamp()}] [RECLAIM] Starting reclaim process for ${type} wallets to destination ${destPubkey.toBase58()} with token mint ${tokenMint}...`);

    try {
        const wallets = await loadWalletsFromFile(filePath);
        let totalReclaimed = 0;

        const mintPubkey = new PublicKey(tokenMint);
        const mintInfo = await connection.getAccountInfo(mintPubkey);
        
        for (const wallet of wallets) {
            const transaction = new Transaction();

            try {
                if (mintInfo) {

                    const tokenProgramId = mintInfo.owner;
                    
                    console.log(`[RECLAIM] Checking tokens for ${wallet.publicKey.toBase58()} with mint ${mintPubkey.toBase58()} using token program ${tokenProgramId.toBase58()}`);

                    const sourceATA = await getAssociatedTokenAddress(mintPubkey, wallet.publicKey, false, tokenProgramId);
                    const destATA = await getAssociatedTokenAddress(mintPubkey, destPubkey, false, tokenProgramId);
                    
                    const sourceAtaInfo = await connection.getAccountInfo(sourceATA);

                    if (sourceAtaInfo) {
                        const tokenBalance = await connection.getTokenAccountBalance(sourceATA);
                        
                        if (tokenBalance.value.uiAmount && tokenBalance.value.uiAmount > 0) {

                            console.log(`[RECLAIM] Token balance for ${wallet.publicKey.toBase58()}: ${tokenBalance.value.uiAmount} tokens. Preparing transfer to ${destPubkey.toBase58()}...`);
                            const destAtaInfo = await connection.getAccountInfo(destATA);
                            
                            if (!destAtaInfo) {
                                transaction.add(
                                    createAssociatedTokenAccountInstruction(
                                        wallet.publicKey, 
                                        destATA, 
                                        destPubkey, 
                                        mintPubkey,
                                        tokenProgramId
                                    )
                                );
                            }
                    
                            transaction.add(
                                createTransferInstruction(
                                    sourceATA, 
                                    destATA, 
                                    wallet.publicKey, 
                                    BigInt(tokenBalance.value.amount),
                                    [],
                                    tokenProgramId
                                )
                            );

                            console.log(`✅ [RECLAIM] Successfully transfer remaining tokens.`);
                        }
                        
                        console.log(`[RECLAIM] Adding close account instruction for ${sourceATA.toBase58()}...`);
                        transaction.add(
                            createCloseAccountInstruction(
                                sourceATA,
                                getMainWalletPublicKey(),
                                wallet.publicKey,
                                [],
                                tokenProgramId
                            )
                        );
                    }
                }
            } catch (e) {
                console.log(`[RECLAIM] Token check failed for ${wallet.publicKey.toBase58()}, skipping tokens.`);
            }

            await sleepWithAbort(1000, new AbortController().signal);

            // 2. SOL RECLAIM LOGIC
            const solBalance = await connection.getBalance(wallet.publicKey);
            const BUFFER = 5000;

            if (solBalance > BUFFER) {
                console.log(`[${getTimestamp()}] [RECLAIM] SOL balance for ${wallet.publicKey.toBase58()}: ${solBalance / LAMPORTS_PER_SOL} SOL`);

                transaction.add(SystemProgram.transfer({
                    fromPubkey: wallet.publicKey,
                    toPubkey: destPubkey,
                    lamports: solBalance - BUFFER,
                }));
            } else {
                console.log(`[${getTimestamp()}] [RECLAIM] Insufficient SOL balance to reclaim from ${wallet.publicKey.toBase58()} (Balance: ${solBalance / LAMPORTS_PER_SOL} SOL). Skipping...`);
            }

            if (transaction.instructions.length > 0) {
                try {
                    await sendAndConfirmTransaction(connection, transaction, [wallet]);
                    totalReclaimed++;
                    console.log(`✅ Reclaimed wallet ${totalReclaimed}/${wallets.length}`);
                } catch (txErr: any) {
                    console.error(`❌ Failed to reclaim ${wallet.publicKey.toBase58()}:`, txErr.message);
                }
            } else {
                console.log(`[RECLAIM] No assets to reclaim for ${wallet.publicKey.toBase58()}. Skipping transaction.`);
            }
        }
        console.log(`[${getTimestamp()}] [RECLAIM] Total wallets reclaimed: ${totalReclaimed}`);
        res.json({ success: true, count: totalReclaimed });
    } catch (err: any) {
        console.log(`[${getTimestamp()}] [RECLAIM ERROR]`, err.message);
        res.status(500).json({ error: err.message });
    }
});

router.get('/wallet-count', async (req, res) => {
    const { type } = req.query;
    const filePath = type === 'holders' ? HOLDERS_WALLET_PATH : SUB_WALLETS_PATH;
    try {
        const wallets = await loadWalletsFromFile(filePath);
        res.json({ count: wallets.length });
    } catch (e) {
        res.json({ count: 0 });
    }
});

export default router;