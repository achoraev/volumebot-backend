import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { startVolumeLoop } from './logic/looper';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

// Middleware
app.use(cors()); // Allows your frontend to talk to this backend
app.use(express.json()); // Allows the backend to read JSON data

// The API Route to start the bot
app.post('/api/start-bot', async (req: Request, res: Response) => {
    const { tokenAddress } = req.body;

    if (!tokenAddress) {
        return res.status(400).json({ error: "Token address is required" });
    }

    try {
        // We call the loop function without 'await' so the API responds immediately
        // while the bot runs in the background.
        startVolumeLoop(tokenAddress);
        
        console.log(`[API] Started volume bot for: ${tokenAddress}`);
        res.json({ message: "Volume campaign initialized successfully!" });
    } catch (err) {
        res.status(500).json({ error: "Failed to start bot" });
    }
});

app.listen(PORT, () => {
    console.log(`✅ Backend running at http://localhost:${PORT}`);
});