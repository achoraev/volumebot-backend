import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import fs from "fs";
import { Connection, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";

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

export async function loadWallets(): Promise<Keypair[]> {
    try {
        const data = fs.readFileSync("./src/data/wallets.json", "utf-8");
        const json = JSON.parse(data);
        
        return json.map((w: any) => 
            Keypair.fromSecretKey(bs58.decode(w.secretKey))
        );
    } catch (error) {
        console.error("Could not load wallets. Did you run the generator?");
        return [];
    }
}

export {};