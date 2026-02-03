# 🚀 Solana Volume Bot - Backend Engine

The core trading engine for the Volume Bot. Built with **Node.js**, **TypeScript**, and **Jupiter SDK**, this backend handles high-frequency trading loops, multi-wallet management, and automated SOL distribution.

## 📦 Tech Stack
- **Runtime:** Node.js v20+
- **Language:** TypeScript
- **Framework:** Express.js
- **Blockchain:** Solana Web3.js & Jupiter Aggregator API
- **Process Manager:** PM2 (for 24/7 cloud operation)

---

## 🛠️ Project Structure
```text
src/
├── engine/          # Blockchain & API interaction (Jupiter, Wallets)
├── logic/           # Core bot features (Looper, Distributor, Tracker)
├── types.ts         # TypeScript definitions
└── index.ts         # Express server & API endpoints