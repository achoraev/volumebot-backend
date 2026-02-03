import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { startVolumeLoop, stopVolumeLoop } from './logic/looper';
import { getAllBalances } from './engine/wallet';
import { distributeFunds, withdrawAll } from './logic/distributor';
import { getStats } from './logic/tracker';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors()); 
app.use(express.json());

app.get('/api/balances', async (req, res) => {
    try {
        const balances = await getAllBalances();
        res.json(balances);
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch balances" });
    }
});

app.get('/api/stats', (req, res) => {
    const stats = getStats();
    res.json(stats);
});

app.post('/api/withdraw', async (req, res) => {
    try {
        await withdrawAll();
        res.json({ message: "All child wallets swept to Main Wallet!" });
    } catch (err) {
        res.status(500).json({ error: "Withdrawal failed." });
    }
});

app.post('/api/distribute', async (req, res) => {
    try {
        const sig = await distributeFunds(0.02);
        res.json({ message: "Funds distributed!", signature: sig });
    } catch (err) {
        res.status(500).json({ error: "Funding failed. Check Main Wallet balance." });
    }
});

app.post('/api/start-bot', async (req: Request, res: Response) => {
    const { tokenAddress, settings } = req.body;

    if (!tokenAddress) {
        return res.status(400).json({ error: "Token address is required" });
    }

    try {
        startVolumeLoop(tokenAddress, settings);
        
        console.log(`[API] Bot started for ${tokenAddress} with settings:`, settings);
        res.json({ message: "Volume campaign initialized successfully!" });
    } catch (err) {
        res.status(500).json({ error: "Failed to start bot" });
    }
});

app.post('/api/stop-bot', (req: Request, res: Response) => {
    const { tokenAddress } = req.body;
    stopVolumeLoop(tokenAddress);
    res.json({ message: "Stopping bot... the current trade will be the last." });
});

app.listen(PORT, () => {
    console.log(`✅ Backend running at http://localhost:${PORT}`);
});