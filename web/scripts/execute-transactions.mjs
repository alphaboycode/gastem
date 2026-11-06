import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createPublicClient,
  createWalletClient,
  http,
  defineChain,
  parseAbi,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read .env
const envPath = path.resolve(__dirname, "../../.env");
const envContent = fs.readFileSync(envPath, "utf-8");

function getEnvVar(name) {
  const match = envContent.match(new RegExp(`^${name}=(.*)$`, "m"));
  return match ? match[1].trim() : null;
}

const RPC_URL = "https://rpc.botchain.ai";
const CHAIN_ID = 677;
const CONTRACT_ADDRESS = "0x9c0F15512c67B2ac28efD8CB2557da3dA595044d";

const botchain = defineChain({
  id: CHAIN_ID,
  name: "Botchain Mainnet",
  nativeCurrency: { name: "BOT", symbol: "BOT", decimals: 18 },
  rpcUrls: {
    default: { http: [RPC_URL] },
  },
});

const publicClient = createPublicClient({
  chain: botchain,
  transport: http(RPC_URL),
});

const gastemAbi = parseAbi([
  "function safeTransferFrom(address from, address to, uint256 id, uint256 amount, bytes data) external",
  "function burn(uint256 id, uint256 amount) external",
  "function setApprovalForAll(address operator, bool approved) external",
  "function balanceOf(address account, uint256 id) external view returns (uint256)",
]);

const w1Account = privateKeyToAccount(getEnvVar("WALLET_1_PRIVATE_KEY"));
const w2Account = privateKeyToAccount(getEnvVar("WALLET_2_PRIVATE_KEY"));
const w3Account = privateKeyToAccount(getEnvVar("WALLET_3_PRIVATE_KEY"));

const w1 = w1Account.address;
const w2 = w2Account.address;
const w3 = w3Account.address;

const wallets = [
  {
    name: "Wallet 1",
    account: w1Account,
    actions: [
      { name: "safeTransferFrom (10 Gold to W2)", fn: "safeTransferFrom", args: [w1, w2, 1n, 10n, "0x"] },
      { name: "safeTransferFrom (10 Gold to W3)", fn: "safeTransferFrom", args: [w1, w3, 1n, 10n, "0x"] },
      { name: "safeTransferFrom (2 Health Potions to W2)", fn: "safeTransferFrom", args: [w1, w2, 100n, 2n, "0x"] },
      { name: "safeTransferFrom (2 Health Potions to W3)", fn: "safeTransferFrom", args: [w1, w3, 100n, 2n, "0x"] },
      { name: "burn (1 Gold)", fn: "burn", args: [1n, 1n] },
      { name: "burn (1 Health Potion)", fn: "burn", args: [100n, 1n] },
      { name: "setApprovalForAll (W2 -> true)", fn: "setApprovalForAll", args: [w2, true] },
      { name: "setApprovalForAll (W2 -> false)", fn: "setApprovalForAll", args: [w2, false] },
    ],
  },
  {
    name: "Wallet 2",
    account: w2Account,
    actions: [
      { name: "safeTransferFrom (2 Mana Potions to W1)", fn: "safeTransferFrom", args: [w2, w1, 101n, 2n, "0x"] },
      { name: "safeTransferFrom (2 Mana Potions to W3)", fn: "safeTransferFrom", args: [w2, w3, 101n, 2n, "0x"] },
      { name: "safeTransferFrom (1 Gold to W1)", fn: "safeTransferFrom", args: [w2, w1, 1n, 1n, "0x"] },
      { name: "burn (1 Mana Potion)", fn: "burn", args: [101n, 1n] },
      { name: "burn (1 Mana Potion)", fn: "burn", args: [101n, 1n] },
      { name: "setApprovalForAll (W1 -> true)", fn: "setApprovalForAll", args: [w1, true] },
      { name: "setApprovalForAll (W3 -> true)", fn: "setApprovalForAll", args: [w3, true] },
      { name: "setApprovalForAll (W1 -> false)", fn: "setApprovalForAll", args: [w1, false] },
    ],
  },
  {
    name: "Wallet 3",
    account: w3Account,
    actions: [
      { name: "safeTransferFrom (1 Dragon Elixir to W1)", fn: "safeTransferFrom", args: [w3, w1, 102n, 1n, "0x"] },
      { name: "safeTransferFrom (1 Dragon Elixir to W2)", fn: "safeTransferFrom", args: [w3, w2, 102n, 1n, "0x"] },
      { name: "safeTransferFrom (1 Gold to W1)", fn: "safeTransferFrom", args: [w3, w1, 1n, 1n, "0x"] },
      { name: "burn (1 Dragon Elixir)", fn: "burn", args: [102n, 1n] },
      { name: "burn (1 Dragon Elixir)", fn: "burn", args: [102n, 1n] },
      { name: "setApprovalForAll (W1 -> true)", fn: "setApprovalForAll", args: [w1, true] },
      { name: "setApprovalForAll (W2 -> true)", fn: "setApprovalForAll", args: [w2, true] },
      { name: "setApprovalForAll (W2 -> false)", fn: "setApprovalForAll", args: [w2, false] },
    ],
  },
];

async function main() {
  console.log("========================================================================");
  console.log(`Executing 8 contract calls per wallet directly on Gastem CA: ${CONTRACT_ADDRESS}`);
  console.log("========================================================================\n");

  const allReceipts = [];

  for (const w of wallets) {
    console.log(`\n>>> Processing ${w.name} (${w.account.address}) <<<`);
    const walletClient = createWalletClient({
      account: w.account,
      chain: botchain,
      transport: http(RPC_URL),
    });

    let currentNonce = await publicClient.getTransactionCount({
      address: w.account.address,
      blockTag: "pending",
    });
    console.log(`Starting Nonce for ${w.name}: ${currentNonce}`);

    for (let i = 0; i < w.actions.length; i++) {
      const act = w.actions[i];
      const txNum = i + 1;
      console.log(`[${w.name}] Tx ${txNum}/8: ${act.name} (Nonce: ${currentNonce})...`);

      const hash = await walletClient.writeContract({
        address: CONTRACT_ADDRESS,
        abi: gastemAbi,
        functionName: act.fn,
        args: act.args,
        nonce: currentNonce,
        gasPrice: 20000000000n, // 20 gwei
      });

      console.log(`Tx broadcasted: ${hash}`);
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      console.log(`Confirmed in block ${receipt.blockNumber} (Status: ${receipt.status})`);

      allReceipts.push({
        wallet: w.name,
        index: txNum,
        action: act.name,
        hash,
        block: receipt.blockNumber.toString(),
        status: receipt.status,
      });

      currentNonce++;
    }
  }

  console.log("\n========================================================================");
  console.log("ALL 24 DIRECT CONTRACT TRANSACTIONS CONFIRMED SUCCESSFULLY ON GASTEM CA!");
  console.log("========================================================================");
  console.table(allReceipts);
}

main().catch((err) => {
  console.error("Execution failed:", err);
  process.exit(1);
});
