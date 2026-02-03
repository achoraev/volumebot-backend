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
exports.createVolume = createVolume;
const web3_js_1 = require("@solana/web3.js");
const cross_fetch_1 = __importDefault(require("cross-fetch"));
/**
 * Executes a swap using Jupiter V6 API
 * @param wallet The child wallet performing the trade
 * @param outputMint The token address you want to buy/volume
 * @param amountInSol Amount of SOL to spend
 */
function createVolume(wallet, outputMint, amountInSol) {
    return __awaiter(this, void 0, void 0, function* () {
        const connection = new web3_js_1.Connection(process.env.RPC_URL || "https://api.mainnet-beta.solana.com");
        try {
            // 1. Get the Quote (Price and Route)
            const amountInLamports = Math.floor(amountInSol * 1000000000);
            const quoteUrl = `https://quote-api.jup.ag/v6/quote?inputMint=So11111111111111111111111111111111111111112&outputMint=${outputMint}&amount=${amountInLamports}&slippageBps=100`;
            const quoteResponse = yield (yield (0, cross_fetch_1.default)(quoteUrl)).json();
            if (!quoteResponse.outAmount) {
                throw new Error("Unable to get quote from Jupiter");
            }
            // 2. Get the Swap Transaction
            const swapResponse = yield (yield (0, cross_fetch_1.default)('https://quote-api.jup.ag/v6/swap', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    quoteResponse,
                    userPublicKey: wallet.publicKey.toString(),
                    wrapAndUnwrapSol: true,
                    // Optional: Add priority fees here to ensure trades land
                    prioritizationFeeLamports: 50000
                })
            })).json();
            // 3. Deserialize and Sign the Transaction
            const swapTransactionBuf = Buffer.from(swapResponse.swapTransaction, 'base64');
            var transaction = web3_js_1.VersionedTransaction.deserialize(swapTransactionBuf);
            transaction.sign([wallet]);
            // 4. Send the Transaction
            const signature = yield connection.sendRawTransaction(transaction.serialize(), {
                skipPreflight: true,
                maxRetries: 2
            });
            console.log(`[SUCCESS] Trade executed by ${wallet.publicKey.toBase58().slice(0, 6)}: https://solscan.io/tx/${signature}`);
            return signature;
        }
        catch (error) {
            console.error(`[ERROR] Swap failed:`, error);
            throw error;
        }
    });
}
