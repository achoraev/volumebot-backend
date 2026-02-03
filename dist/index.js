"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const looper_1 = require("./logic/looper");
dotenv_1.default.config();
const app = (0, express_1.default)();
const PORT = process.env.PORT || 4000;
// Middleware
app.use((0, cors_1.default)()); // Allows your frontend to talk to this backend
app.use(express_1.default.json()); // Allows the backend to read JSON data
// The API Route to start the bot
app.post('/api/start-bot', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { tokenAddress } = req.body;
    if (!tokenAddress) {
        return res.status(400).json({ error: "Token address is required" });
    }
    try {
        // We call the loop function without 'await' so the API responds immediately
        // while the bot runs in the background.
        (0, looper_1.startVolumeLoop)(tokenAddress);
        console.log(`[API] Started volume bot for: ${tokenAddress}`);
        res.json({ message: "Volume campaign initialized successfully!" });
    }
    catch (err) {
        res.status(500).json({ error: "Failed to start bot" });
    }
}));
app.listen(PORT, () => {
    console.log(`✅ Backend running at http://localhost:${PORT}`);
});
