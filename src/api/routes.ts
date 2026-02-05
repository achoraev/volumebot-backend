import e, { Router, Request, Response } from 'express';
import { PublicKey } from '@solana/web3.js';
import { startVolumeLoop, stopVolumeLoop } from '../logic/looper';
import { getAllBalances } from '../engine/wallet';
import { distributeFunds, withdrawAll } from '../logic/distributor';
import { getStats } from '../logic/tracker';
import { sanitizeSettings } from '../utils/sanitizer';

const router = Router();

/**
 * @route   GET /api/balances
 * @desc    Fetch SOL balances for main and all worker wallets
 */
router.get('/balances', async (req: Request, res: Response) => {
    try {
        const balances = await getAllBalances();
        res.json(balances);
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch balances" });
    }
});

/**
 * @route   GET /api/stats
 * @desc    Fetch PnL and volume statistics
 */
router.get('/stats', (req: Request, res: Response) => {
    try {
        const stats = getStats();
        res.json(stats);
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch stats" });
    }
});

/**
 * @route   POST /api/start-bot
 * @desc    Sanitize settings and start the volume loop
 */
router.post('/start-bot', async (req: Request, res: Response) => {
    const { tokenAddress, settings: rawSettings } = req.body;

    if (!tokenAddress) {
        return res.status(400).json({ error: "Token address required" });
    }

    try {
        new PublicKey(tokenAddress);
    } catch (err) {
        return res.status(400).json({ error: "Invalid Solana token address format" });
    }

    const settings = sanitizeSettings(rawSettings);

    try {
        startVolumeLoop(tokenAddress, settings);
        console.log(`[API] Bot started for ${tokenAddress} with settings:`, settings);
        res.json({ message: "Bot started successfully!", settings });
    } catch (err) {
        res.status(500).json({ error: "Failed to start bot" });
    }
});

/**
 * @route   POST /api/stop-bot
 * @desc    Stop the volume loop for a specific token
 */
router.post('/stop-bot', (req: Request, res: Response) => {
    const { tokenAddress } = req.body;
    if (!tokenAddress) return res.status(400).json({ error: "Token address required" });

    stopVolumeLoop(tokenAddress);
    res.json({ message: `Stopping bot for ${tokenAddress}...` });
});

/**
 * @route   POST /api/distribute
 * @desc    Move SOL from Main Wallet to Workers
 */
router.post('/distribute', async (req: Request, res: Response) => {
    try {
        const { amount } = req.body;
        const fundAmount = typeof amount === 'number' ? amount : 0.05;
        console.log(`[API] Distributing ${fundAmount} SOL to all workers...`);
        const sig = await distributeFunds(fundAmount);
        res.json({ message: `Successfully distributed ${fundAmount} SOL!`, signature: sig });
    } catch (err) {
        console.error("Funding Error: ", err);
        res.status(500).json({ error: "Funding failed. Check Main Wallet balance." });
    }
});

/**
 * @route   POST /api/withdraw
 * @desc    Sweep all funds back to Main Wallet
 */
router.post('/withdraw', async (req: Request, res: Response) => {
    try {
        await withdrawAll();
        res.json({ message: "All funds swept to Main Wallet" });
    } catch (err) {
        res.status(500).json({ error: "Withdrawal failed" });
    }
});

export default router;