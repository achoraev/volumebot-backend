import { 
    Connection, 
    Keypair, 
    SystemProgram, 
    Transaction, 
    sendAndConfirmTransaction, 
    LAMPORTS_PER_SOL,
    PublicKey
  } from "@solana/web3.js";
  import bs58 from "bs58";
  import * as fs from "fs";
  
  const connection = new Connection(process.env.RPC_URL!);
  
  const MAIN_WALLET = Keypair.fromSecretKey(bs58.decode(process.env.MAIN_PRIVATE_KEY!));
  
  async function setupChildWallets(numWallets: number, amountToFund: number) {
      console.log(`--- Starting Setup for ${numWallets} Wallets ---`);
  
      const childWallets: Keypair[] = [];
      const transaction = new Transaction();
  
      // 2. Generate Wallets and Build One Big Transaction
      for (let i = 0; i < numWallets; i++) {
          const newWallet = Keypair.generate();
          childWallets.push(newWallet);
  
          // Add a transfer instruction for each wallet
          transaction.add(
              SystemProgram.transfer({
                  fromPubkey: MAIN_WALLET.publicKey,
                  toPubkey: newWallet.publicKey,
                  lamports: amountToFund * LAMPORTS_PER_SOL,
              })
          );
      }
  
      // 3. Send the Funding Transaction
      console.log("Sending funding transaction...");
      try {
          const signature = await sendAndConfirmTransaction(
              connection, 
              transaction, 
              [MAIN_WALLET]
          );
          console.log(`Funding Success! View on Solscan: https://solscan.io/tx/${signature}`);
  
          // 4. Save Child Wallets to a JSON file (So your bot can load them later)
          const walletData = childWallets.map(w => ({
              publicKey: w.publicKey.toString(),
              secretKey: bs58.encode(w.secretKey)
          }));
          
          fs.writeFileSync("child_wallets.json", JSON.stringify(walletData, null, 2));
          console.log("Child wallets saved to child_wallets.json");
  
      } catch (err) {
          console.error("Funding failed:", err);
      }
  }
  
  // Example: Create 10 wallets and send 0.05 SOL to each
  setupChildWallets(10, 0.05);