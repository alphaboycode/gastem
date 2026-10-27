import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createPublicClient,
  createWalletClient,
  http,
  defineChain,
  parseEther,
  formatEther,
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

const RPC_URL = "https://rpc.bohr.life";
const CHAIN_ID = 968;
const GASTEM_ADDRESS = "0xB3c87CF82359FC38DDbFDcdEF673C09c7197B0DC";

const botchain = defineChain({
  id: CHAIN_ID,
  name: "Botchain Testnet",
  nativeCurrency: { name: "BOT", symbol: "BOT", decimals: 18 },
  rpcUrls: {
    default: { http: [RPC_URL] },
  },
});

const publicClient = createPublicClient({
  chain: botchain,
  transport: http(RPC_URL),
});

const wallets = [
  {
    name: "Wallet 1",
    address: getEnvVar("WALLET_1_ADDRESS"),
    privateKey: getEnvVar("WALLET_1_PRIVATE_KEY"),
  },
  {
    name: "Wallet 2",
    address: getEnvVar("WALLET_2_ADDRESS"),
    privateKey: getEnvVar("WALLET_2_PRIVATE_KEY"),
  },
  {
    name: "Wallet 3",
    address: getEnvVar("WALLET_3_ADDRESS"),
    privateKey: getEnvVar("WALLET_3_PRIVATE_KEY"),
  },
];

async function main() {
  console.log("==================================================");
  console.log("Starting 8 transactions per wallet on Botchain...");
  console.log("==================================================\n");

  const allReceipts = [];

  for (const w of wallets) {
    console.log(`\n>>> Processing ${w.name} (${w.address}) <<<`);
    const account = privateKeyToAccount(w.privateKey);
    const walletClient = createWalletClient({
      account,
      chain: botchain,
      transport: http(RPC_URL),
    });

    const initialBal = await publicClient.getBalance({ address: account.address });
    console.log(`Initial Balance: ${formatEther(initialBal)} BOT`);

    let currentNonce = await publicClient.getTransactionCount({
      address: account.address,
      blockTag: "pending",
    });
    console.log(`Starting Nonce: ${currentNonce}`);

    for (let i = 1; i <= 8; i++) {
      console.log(`Sending tx ${i}/8 for ${w.name} (nonce ${currentNonce})...`);

      const hash = await walletClient.sendTransaction({
        to: GASTEM_ADDRESS,
        value: parseEther("0.0001"),
        nonce: currentNonce,
        gasPrice: 20000000000n, // 20 gwei
      });

      console.log(`Tx submitted: ${hash}`);
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      console.log(`Confirmed in block ${receipt.blockNumber} (Status: ${receipt.status})`);

      allReceipts.push({
        wallet: w.name,
        index: i,
        hash,
        block: receipt.blockNumber,
        status: receipt.status,
      });

      currentNonce++;
    }

    const finalBal = await publicClient.getBalance({ address: account.address });
    console.log(`Final Balance for ${w.name}: ${formatEther(finalBal)} BOT\n`);
  }

  console.log("==================================================");
  console.log("ALL 24 TRANSACTIONS COMPLETED SUCCESSFULLY!");
  console.log("==================================================");
  console.table(allReceipts);
}

main().catch((err) => {
  console.error("Execution error:", err);
  process.exit(1);
});
