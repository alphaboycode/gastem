import { createPublicClient, createWalletClient, custom, http, defineChain } from "viem";
import { config } from "./config";

declare global {
  interface Window {
    ethereum?: any;
  }
}

export const botchain = defineChain({
  id: config.chainId,
  name: config.chainName,
  nativeCurrency: config.nativeCurrency,
  rpcUrls: {
    default: {
      http: [config.rpcUrl],
    },
  },
  blockExplorers: {
    default: {
      name: "BohrScan",
      url: config.explorerUrl,
    },
  },
});

export const publicClient = createPublicClient({
  chain: botchain,
  transport: http(config.rpcUrl),
});

export function getWalletClient(account: `0x${string}`) {
  if (typeof window === "undefined" || !window.ethereum) {
    throw new Error("No crypto wallet found. Please install MetaMask.");
  }

  return createWalletClient({
    account,
    chain: botchain,
    transport: custom(window.ethereum),
  });
}
