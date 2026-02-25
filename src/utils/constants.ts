import path from "path";

export const API_BASE_URL = 'https://api.example.com';
export const TIMEOUT = 5000; // in milliseconds
export const MAX_RETRIES = 3;
export const TOKEN_ADDRESS = '6EMfu2VigQrQBcK5A6hQ8w53jgP5psGSaxDPRSSCpump'
export const SUBWALLETS_FILE = "sub-wallets.json";
export const HOLDERS_WALLET_FILE = "holders-wallets.json";
export const SUB_WALLETS_PATH = path.join(process.cwd(), SUBWALLETS_FILE);
export const HOLDERS_WALLET_PATH = path.join(process.cwd(), HOLDERS_WALLET_FILE);

export const ERROR_MESSAGES = {
    NETWORK_ERROR: 'Network error occurred. Please try again.',
    TIMEOUT_ERROR: 'The request timed out. Please try again later.',
    UNKNOWN_ERROR: 'An unknown error occurred.',
};

export const SUCCESS_MESSAGES = {
    DATA_FETCHED: 'Data fetched successfully.',
    OPERATION_COMPLETED: 'Operation completed successfully.',
};

export const DEFAULT_PAGINATION = {
    PAGE: 1,
    LIMIT: 10,
};