const express = require("express");
const fetch = require("node-fetch"); // node-fetch v2 is CJS compatible, install if needed: npm install node-fetch@2
require("dotenv").config();

// --- Environment Variable Validation ---
if (!process.env.ENGINE_URL) {
  throw new Error("Missing ENGINE_URL in .env file");
}
if (!process.env.ENGINE_ACCESS_TOKEN) {
  throw new Error("Missing ENGINE_ACCESS_TOKEN in .env file");
}
if (!process.env.BACKEND_WALLET_ADDRESS) {
  throw new Error("Missing BACKEND_WALLET_ADDRESS in .env file");
}
if (!process.env.CONTRACT_ADDRESS) {
  throw new Error("Missing CONTRACT_ADDRESS in .env file");
}
if (!process.env.CHAIN_ID) {
    throw new Error("Missing CHAIN_ID in .env file. Find chain IDs: https://thirdweb.com/chains");
}

// --- Constants ---
const ENGINE_URL = process.env.ENGINE_URL;
const ENGINE_ACCESS_TOKEN = process.env.ENGINE_ACCESS_TOKEN;
const BACKEND_WALLET_ADDRESS = process.env.BACKEND_WALLET_ADDRESS;
const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS;
const CHAIN_ID = process.env.CHAIN_ID;

// --- Helper Function to Call Engine ---
async function callEngine(endpoint, options = {}) {
  const url = new URL(endpoint, ENGINE_URL);
  const headers = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${ENGINE_ACCESS_TOKEN}`,
    "x-backend-wallet-address": BACKEND_WALLET_ADDRESS,
    ...options.headers, // Allow overriding/adding headers
  };

  console.log(`Calling Engine: ${options.method || 'GET'} ${url.toString()}`);
  if (options.body) {
    console.log("Engine Request Body:", options.body);
  }

  const response = await fetch(url.toString(), {
    method: options.method || 'GET',
    headers: headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const responseBody = await response.json();

  if (!response.ok) {
    console.error("Engine API Error:", responseBody);
    const error = new Error(`Engine API request failed with status ${response.status}: ${responseBody?.error?.message || response.statusText}`);
    error.details = responseBody;
    throw error;
  }

  console.log("Engine Response:", responseBody);
  return responseBody.result;
}

// --- Express Server Setup ---
const app = express();
app.use(express.json()); // Middleware to parse JSON request bodies

const PORT = process.env.PORT || 3000;

// --- API Endpoint for Deposit ---
app.post("/deposit", async (req, res) => {
  try {
    // --- Get offchainId and userAddress from request body ---
    const { offchainId, userAddress } = req.body;
    if (!offchainId || typeof offchainId !== 'string') {
      return res.status(400).json({ error: "Missing or invalid 'offchainId' in request body." });
    }
    // Basic address validation (could be more robust)
    if (!userAddress || typeof userAddress !== 'string' || !userAddress.startsWith('0x') || userAddress.length !== 42) {
        return res.status(400).json({ error: "Missing or invalid 'userAddress' in request body." });
    }

    console.log(`Processing deposit for offchainId: ${offchainId} by user: ${userAddress}`);

    // --- Read ENTRY_FEE using Engine's read endpoint ---
    // Note: Engine's read endpoint might need specific setup or might not directly support view functions easily.
    // A common pattern is to hardcode known constants or fetch them differently if they don't change often.
    // For simplicity here, let's assume ENTRY_FEE is known or fetched elsewhere.
    // If you MUST read it dynamically via Engine, you'd use the /contract/{chain}/{contract_address}/read endpoint.
    // Entry fee set to 0.001 ETH in Wei
    const entryFeeWei = "1000000000000000"; // 0.001 ETH
    console.log(`Using ENTRY_FEE: ${entryFeeWei} Wei (0.001 ETH)`);

    // --- Call the Smart Contract Function via Engine ---
    const endpoint = `/contract/${CHAIN_ID}/${CONTRACT_ADDRESS}/write`;
    const body = {
      functionName: "deposit",
      args: [offchainId],
      txOverrides: {
        value: entryFeeWei, // Value in Wei as a string
      },
    };

    // Add the user's address to the headers for Engine
    const headers = {
        "x-account-address": userAddress
    };

    const engineResult = await callEngine(endpoint, { method: 'POST', body, headers });

    // Engine returns a queueId for the transaction
    console.log("Transaction queued with Engine. Queue ID:", engineResult.queueId);

    // --- Send Response ---
    // Return the queueId. The client can poll Engine's transaction status endpoint if needed.
    res.status(200).json({
      message: "Deposit transaction queued successfully!",
      queueId: engineResult.queueId,
    });

  } catch (error) {
    console.error("Error processing deposit:", error);
    const errorMessage = error.details?.error?.message || error.message || "Failed to process deposit.";
    const statusCode = error.details?.statusCode || 500;
    res.status(statusCode).json({ error: errorMessage });
  }
});

// --- Start Server ---
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
  console.log(`Using Engine: ${ENGINE_URL}`);
  console.log(`Backend Wallet: ${BACKEND_WALLET_ADDRESS}`);
  console.log(`Contract Address: ${CONTRACT_ADDRESS}`);
  console.log(`Chain ID: ${CHAIN_ID}`);
});