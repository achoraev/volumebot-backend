export const API_BASE_URL = 'https://api.example.com';
export const TIMEOUT = 5000; // in milliseconds
export const MAX_RETRIES = 3;
export const TOKEN_ADDRESS = "FVVcwtS1qeh9PBqjKd2D1jgGkFfqoAX6SdaCepgZpump"
export const SUBWALLETS_FILE = "sub-wallets.json";

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