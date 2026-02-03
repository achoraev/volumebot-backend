"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
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
const web3_js_1 = require("@solana/web3.js");
const bs58_1 = __importDefault(require("bs58"));
const fs = __importStar(require("fs"));
// 1. Setup Connection & Main Wallet
const RPC_URL = "https://api.mainnet-beta.solana.com"; // Use a private RPC for better reliability
const connection = new web3_js_1.Connection(RPC_URL, "confirmed");
// REPLACE THIS with your main wallet private key (Base58 string)
const MAIN_WALLET = web3_js_1.Keypair.fromSecretKey(bs58_1.default.decode("YOUR_PRIVATE_KEY"));
function setupChildWallets(numWallets, amountToFund) {
    return __awaiter(this, void 0, void 0, function* () {
        console.log(`--- Starting Setup for ${numWallets} Wallets ---`);
        const childWallets = [];
        const transaction = new web3_js_1.Transaction();
        // 2. Generate Wallets and Build One Big Transaction
        for (let i = 0; i < numWallets; i++) {
            const newWallet = web3_js_1.Keypair.generate();
            childWallets.push(newWallet);
            // Add a transfer instruction for each wallet
            transaction.add(web3_js_1.SystemProgram.transfer({
                fromPubkey: MAIN_WALLET.publicKey,
                toPubkey: newWallet.publicKey,
                lamports: amountToFund * web3_js_1.LAMPORTS_PER_SOL,
            }));
        }
        // 3. Send the Funding Transaction
        console.log("Sending funding transaction...");
        try {
            const signature = yield (0, web3_js_1.sendAndConfirmTransaction)(connection, transaction, [MAIN_WALLET]);
            console.log(`Funding Success! View on Solscan: https://solscan.io/tx/${signature}`);
            // 4. Save Child Wallets to a JSON file (So your bot can load them later)
            const walletData = childWallets.map(w => ({
                publicKey: w.publicKey.toString(),
                secretKey: bs58_1.default.encode(w.secretKey)
            }));
            fs.writeFileSync("child_wallets.json", JSON.stringify(walletData, null, 2));
            console.log("Child wallets saved to child_wallets.json");
        }
        catch (err) {
            console.error("Funding failed:", err);
        }
    });
}
// Example: Create 10 wallets and send 0.05 SOL to each
setupChildWallets(10, 0.05);
