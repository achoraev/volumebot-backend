import { Keypair } from "@solana/web3.js";
import * as fs from "fs";
import * as path from "path";
import bs58 from "bs58";

async function generateAndSave(count: number) {
    console.log(`🛠️  Generating ${count} fresh wallets...`);
    
    const wallets = [];
    const dataDir = path.join(__dirname, "./data");
    const filePath = path.join(dataDir, "wallets.json");

    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir);
    }

    for (let i = 0; i < count; i++) {
        const kp = Keypair.generate();
        wallets.push({
            id: i + 1,
            address: kp.publicKey.toBase58(),
            secretKey: bs58.encode(kp.secretKey),
        });
    }

    try {
        fs.writeFileSync(filePath, JSON.stringify(wallets, null, 2));
        console.log(`✅ Success! Generated ${count} wallets.`);
        console.log(`📂 Saved to: ${filePath}`);
    } catch (error) {
        console.error("❌ Failed to write wallets.json:", error);
    }
}

generateAndSave(3);