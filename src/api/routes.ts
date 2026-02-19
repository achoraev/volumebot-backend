import e, { Router, Request, Response } from 'express';
import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { startVolumeLoop, stopVolumeLoop } from '../logic/looper';
import { getAllBalances } from '../engine/wallet';
import { getStats } from '../logic/tracker';
import { sanitizeSettings } from '../utils/sanitizer';
import path from 'path';
import { distributeFunds, withdrawAll } from '../engine/wallet';
import { buyHolders } from '../engine/holders';
import { TOKEN_ADDRESS } from '../utils/constants';

const SUB_WALLETS_PATH = path.join(process.cwd(), "sub-wallets.json");
const connection = new Connection("https://api.mainnet-beta.solana.com");

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
        console.warn("[API] Start Bot failed: No token address provided");
        return res.status(400).json({ error: "Token address required" });
    }

    try {
        new PublicKey(tokenAddress);
    } catch (err) {
        return res.status(400).json({ error: "Invalid Solana token address format" });
    }

    const settings = sanitizeSettings(rawSettings);

    console.log(`[API] Starting bot for ${tokenAddress} with settings:`, settings);

    try {
        startVolumeLoop(tokenAddress, settings);
        res.json({ message: "Bot started successfully!", settings });
    } catch (err) {
        res.status(500).json({ error: "Failed to start bot" });
    }

    console.log(`[API] Bot started for ${tokenAddress}`);
});

/**
 * @route   POST /api/stop-bot
 * @desc    Stop the volume loop for a specific token
 */
router.post('/stop-bot', (req: Request, res: Response) => {
    const { tokenAddress } = req.body;
    if (!tokenAddress) return res.status(400).json({ error: "Token address required" });

    stopVolumeLoop(tokenAddress);
    console.log(`[API] Stop signal sent for ${tokenAddress}`);
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

router.post('/holders', async (req: Request, res: Response) => {
    try {
        console.log(`[API] Call Api with body: ${req.body.tokenAddress}`);
        const tokenAddress = req.body.tokenAddress || TOKEN_ADDRESS;

        // Todo - Add settings for number of holders and amount per holder
        await buyHolders(tokenAddress, 2, 0.007);
        res.json({ message: "Holder buys executed successfully!" });
    } catch (err) {
        res.status(500).json({ error: "Failed to execute holder buys" });
    }
});

// router.get('/active-makers', async (req, res) => {
//     try {
//         if (!fs.existsSync(SUB_WALLETS_PATH)) {
//             return res.json([]);
//         }

//         const data = JSON.parse(fs.readFileSync(SUB_WALLETS_PATH, 'utf-8'));
        
//         const walletsWithBalances = await Promise.all(data.map(async (w: any) => {
//             try {
//                 const balance = await connection.getBalance(new PublicKey(w.pubkey));
//                 return {
//                     pubkey: w.pubkey,
//                     balance: (balance / LAMPORTS_PER_SOL).toFixed(4),
//                     status: balance > 0 ? "Active" : "Empty"
//                 };
//             } catch (e) {
//                 return { pubkey: w.pubkey, balance: "0.0000", status: "Error" };
//             }
//         }));

//         res.json(walletsWithBalances);
//     } catch (error) {
//         res.status(500).json({ error: "Failed to fetch maker stats" });
//     }
// });

export default router;