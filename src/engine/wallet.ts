import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import fs from "fs";
import { Connection, LAMPORTS_PER_SOL } from "@solana/web3.js";
import path from "path";

export async function loadWallets(): Promise<Keypair[]> {
    try {
        const walletPath = path.join(process.cwd(), "wallets.json");
        const data = fs.readFileSync(walletPath, "utf-8");
        const json = JSON.parse(data);
        
        return json.map((w: any) => 
            Keypair.fromSecretKey(bs58.decode(w.secretKey))
        );
    } catch (error) {
        console.error("❌ ERROR: Could not load wallets. Checked path:", path.join(process.cwd(), "wallets.json"));
        return [];
    }
}

export async function getAllBalances() {
    const connection = new Connection(process.env.RPC_URL!);
    const wallets = await loadWallets();

    const publicKeys = wallets.map(w => w.publicKey);

    const accounts = await connection.getMultipleAccountsInfo(publicKeys);

    return accounts.map((acc, index) => ({
        address: publicKeys[index].toBase58(),
        balance: acc ? acc.lamports / LAMPORTS_PER_SOL : 0,
        status: acc ? (acc.lamports / LAMPORTS_PER_SOL < 0.01 ? "LOW" : "OK") : "EMPTY"
    }));
}

export const getRandomWallet = (): Keypair => {
    try {
        const filePath = path.join(process.cwd(), "wallets.json");
        const data = fs.readFileSync(filePath, 'utf8');
        const privateKeys = JSON.parse(data);

        if (!Array.isArray(privateKeys) || privateKeys.length === 0) {
            throw new Error("wallets.json is empty or invalid (must be an array).");
        }

        const randomIndex = Math.floor(Math.random() * privateKeys.length);
        const randomKey = privateKeys[randomIndex];

        console.log(`✅ Loaded random wallet: ${randomKey.publicKey}`);

        return Keypair.fromSecretKey(bs58.decode(randomKey.secretKey));
    } catch (error: any) {
        console.error("❌ Failed to load random wallet:", error.message + (error.stack ? "\n" + error.stack : ""));

        const workerKey = process.env.MAIN_PRIVATE_KEY;
        if (workerKey) return Keypair.fromSecretKey(bs58.decode(workerKey));
        throw new Error("No valid wallet found in wallets.json or .env");
    }
};

export {};