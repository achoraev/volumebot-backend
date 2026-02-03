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
Object.defineProperty(exports, "__esModule", { value: true });
exports.startVolumeLoop = startVolumeLoop;
const jupiter_1 = require("../engine/jupiter");
const wallet_1 = require("../engine/wallet");
function startVolumeLoop(tokenAddr) {
    return __awaiter(this, void 0, void 0, function* () {
        const wallets = yield (0, wallet_1.loadWallets)();
        function runSingleTrade() {
            return __awaiter(this, void 0, void 0, function* () {
                // 1. Pick a random child wallet from your list
                const randomWallet = wallets[Math.floor(Math.random() * wallets.length)];
                // 2. Pick a random amount (e.g., between 0.01 and 0.05 SOL)
                const randomAmount = (Math.random() * (0.05 - 0.01) + 0.01).toFixed(4);
                console.log(`[LOOP] Wallet ${randomWallet.publicKey.toBase58().slice(0, 6)} trading ${randomAmount} SOL`);
                try {
                    yield (0, jupiter_1.createVolume)(randomWallet, tokenAddr, parseFloat(randomAmount));
                }
                catch (err) {
                    console.error("Trade failed, skipping to next...");
                }
                // 3. Set a random delay before the next trade (e.g., 30 to 90 seconds)
                const nextDelay = Math.floor(Math.random() * (90000 - 30000) + 30000);
                console.log(`Next trade in ${nextDelay / 1000} seconds...`);
                setTimeout(runSingleTrade, nextDelay);
            });
        }
        runSingleTrade(); // Kick off the first trade
    });
}
