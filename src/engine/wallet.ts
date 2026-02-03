import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import fs from "fs";

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