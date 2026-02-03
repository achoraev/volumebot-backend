import { Connection, Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import dotenv from "dotenv";
import bs58 from "bs58";

dotenv.config();

async function verifySetup() {
    console.log("🔍 Checking Bot Configuration...");

    // 1. Check RPC URL
    const rpc = process.env.RPC_URL;
    if (!rpc) {
        console.error("❌ ERROR: RPC_URL is missing in .env");
        return;
    }

    try {
        const connection = new Connection(rpc, "confirmed");
        const version = await connection.getVersion();
        console.log(`✅ RPC Connected: ${rpc.slice(0, 25)}... (Solana v${version["solana-core"]})`);

        // 2. Check Private Key
        const privKey = process.env.MAIN_PRIVATE_KEY;
        if (!privKey) {
            console.error("❌ ERROR: MAIN_PRIVATE_KEY is missing in .env");
            return;
        }

        const wallet = Keypair.fromSecretKey(bs58.decode(privKey));
        console.log(`✅ Wallet Loaded: ${wallet.publicKey.toBase58()}`);

        // 3. Check Balance
        const balance = await connection.getBalance(wallet.publicKey);
        const solBalance = balance / LAMPORTS_PER_SOL;

        if (solBalance < 0.05) {
            console.warn(`⚠️ WARNING: Low balance (${solBalance} SOL). You need more to fund child wallets!`);
        } else {
            console.log(`💰 Wallet Balance: ${solBalance.toFixed(4)} SOL`);
            console.log("🚀 Everything looks ready!");
        }

    } catch (err: any) {
        console.error("❌ CONFIG ERROR:", err.message);
    }
}

verifySetup();