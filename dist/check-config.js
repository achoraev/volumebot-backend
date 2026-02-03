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
const web3_js_1 = require("@solana/web3.js");
const dotenv_1 = __importDefault(require("dotenv"));
const bs58_1 = __importDefault(require("bs58"));
dotenv_1.default.config();
function verifySetup() {
    return __awaiter(this, void 0, void 0, function* () {
        console.log("🔍 Checking Bot Configuration...");
        // 1. Check RPC URL
        const rpc = process.env.RPC_URL;
        if (!rpc) {
            console.error("❌ ERROR: RPC_URL is missing in .env");
            return;
        }
        try {
            const connection = new web3_js_1.Connection(rpc, "confirmed");
            const version = yield connection.getVersion();
            console.log(`✅ RPC Connected: ${rpc.slice(0, 25)}... (Solana v${version["solana-core"]})`);
            // 2. Check Private Key
            const privKey = process.env.MAIN_PRIVATE_KEY;
            if (!privKey) {
                console.error("❌ ERROR: MAIN_PRIVATE_KEY is missing in .env");
                return;
            }
            const wallet = web3_js_1.Keypair.fromSecretKey(bs58_1.default.decode(privKey));
            console.log(`✅ Wallet Loaded: ${wallet.publicKey.toBase58()}`);
            // 3. Check Balance
            const balance = yield connection.getBalance(wallet.publicKey);
            const solBalance = balance / web3_js_1.LAMPORTS_PER_SOL;
            if (solBalance < 0.05) {
                console.warn(`⚠️ WARNING: Low balance (${solBalance} SOL). You need more to fund child wallets!`);
            }
            else {
                console.log(`💰 Wallet Balance: ${solBalance.toFixed(4)} SOL`);
                console.log("🚀 Everything looks ready!");
            }
        }
        catch (err) {
            console.error("❌ CONFIG ERROR:", err.message);
        }
    });
}
verifySetup();
