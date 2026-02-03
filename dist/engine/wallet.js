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
exports.loadWallets = loadWallets;
const web3_js_1 = require("@solana/web3.js");
const bs58_1 = __importDefault(require("bs58"));
const fs_1 = __importDefault(require("fs"));
function loadWallets() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const data = fs_1.default.readFileSync("./src/data/wallets.json", "utf-8");
            const json = JSON.parse(data);
            return json.map((w) => web3_js_1.Keypair.fromSecretKey(bs58_1.default.decode(w.secretKey)));
        }
        catch (error) {
            console.error("Could not load wallets. Did you run the generator?");
            return [];
        }
    });
}
