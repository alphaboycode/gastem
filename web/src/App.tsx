import React, { useState, useEffect, useCallback } from "react";
import {
  isAddress,
  keccak256,
  stringToBytes,
  formatEther,
} from "viem";
import { config } from "./config";
import { gastemAbi } from "./abi";
import { publicClient, getWalletClient } from "./viemClient";
import { Item, TransactionStatus } from "./types";

// Role hashes
const MINTER_ROLE = keccak256(stringToBytes("MINTER_ROLE"));
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

// Preset weapons for admin unique minting convenience
const UNIQUE_PRESETS = [
  {
    name: "Sunforged Claymore",
    desc: "A massive two-handed greatsword bathed in eternal solar flame. Searing light cleaves shadowy beasts.",
    image:
      "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 120 120'><rect width='120' height='120' rx='16' fill='%23120c04'/><path d='M60 15 L66 75 L74 78 L64 82 L64 96 L60 102 L56 96 L56 82 L46 78 L54 75 Z' fill='%23fbbf24' stroke='%23f59e0b' stroke-width='2'/><circle cx='60' cy='80' r='4' fill='%23ef4444'/><path d='M60 20 L60 72' stroke='%23fef08a' stroke-width='2'/></svg>",
  },
  {
    name: "Dragonscale Aegis",
    desc: "Forged from the ancient heart-scales of a red wyrm. Impervious to dragonfire and siege blows.",
    image:
      "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 120 120'><rect width='120' height='120' rx='16' fill='%23140505'/><path d='M60 20 Q90 20 90 55 Q90 95 60 105 Q30 95 30 55 Q30 20 60 20 Z' fill='%23991b1b' stroke='%23f87171' stroke-width='3'/><path d='M60 30 Q78 30 78 55 Q78 85 60 92 Q42 85 42 55 Q42 30 60 30 Z' fill='%237f1d1d'/><circle cx='60' cy='58' r='10' fill='%23f59e0b'/></svg>",
  },
  {
    name: "Archmage Astral Staff",
    desc: "Carved from petrified world-tree wood and topped with an unfathomable void sapphire.",
    image:
      "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 120 120'><rect width='120' height='120' rx='16' fill='%23050b18'/><line x1='60' y1='35' x2='60' y2='108' stroke='%23854d0e' stroke-width='6' stroke-linecap='round'/><circle cx='60' cy='28' r='14' fill='%2338bdf8' stroke='%23bae6fd' stroke-width='3'/><circle cx='60' cy='28' r='6' fill='%23ffffff'/></svg>",
  },
  {
    name: "Shadowfang Dagger",
    desc: "Dripping with lethal nightshade venom. Swift as a whisper in the silent crypts.",
    image:
      "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 120 120'><rect width='120' height='120' rx='16' fill='%23090714'/><path d='M60 18 Q68 50 64 74 L70 78 L62 81 L62 98 L58 98 L58 81 L50 78 L56 74 Q52 50 60 18 Z' fill='%23c084fc' stroke='%23e9d5ff' stroke-width='2'/><circle cx='60' cy='79' r='3' fill='%23a855f7'/></svg>",
  },
];

export default function App() {
  const isContractZero = (config.contractAddress as string) === ZERO_ADDRESS;

  // Wallet & network state
  const [account, setAccount] = useState<`0x${string}` | null>(null);
  const [botBalance, setBotBalance] = useState<string>("0");
  const [isWrongChain, setIsWrongChain] = useState<boolean>(false);
  const [isConnecting, setIsConnecting] = useState<boolean>(false);

  // Contract roles & data
  const [isMinter, setIsMinter] = useState<boolean>(false);
  const [items, setItems] = useState<Item[]>([]);
  const [goldBalance, setGoldBalance] = useState<bigint>(0n);
  const [totalGoldSupply, setTotalGoldSupply] = useState<bigint>(0n);
  const [isLoadingItems, setIsLoadingItems] = useState<boolean>(false);

  // Active view: 'inventory' | 'admin'
  const [activeTab, setActiveTab] = useState<"inventory" | "admin">("inventory");
  // Filter inside inventory: 'all' or 'my'
  const [filterMode, setFilterMode] = useState<"all" | "my">("all");

  // Transfer Modal
  const [transferModalItem, setTransferModalItem] = useState<Item | null>(null);
  const [transferTo, setTransferTo] = useState<string>("");
  const [transferAmount, setTransferAmount] = useState<string>("1");

  // Burn Modal
  const [burnModalItem, setBurnModalItem] = useState<Item | null>(null);
  const [burnAmount, setBurnAmount] = useState<string>("1");

  // Admin Forms
  const [mintFungibleId, setMintFungibleId] = useState<string>("1");
  const [mintFungibleTo, setMintFungibleTo] = useState<string>("");
  const [mintFungibleAmount, setMintFungibleAmount] = useState<string>("100");

  const [createId, setCreateId] = useState<string>("103");
  const [createName, setCreateName] = useState<string>("");
  const [createDesc, setCreateDesc] = useState<string>("");
  const [createImg, setCreateImg] = useState<string>("");
  const [createMaxSupply, setCreateMaxSupply] = useState<string>("0");

  const [uniqueTo, setUniqueTo] = useState<string>("");
  const [uniqueName, setUniqueName] = useState<string>(UNIQUE_PRESETS[0].name);
  const [uniqueDesc, setUniqueDesc] = useState<string>(UNIQUE_PRESETS[0].desc);
  const [uniqueImg, setUniqueImg] = useState<string>(UNIQUE_PRESETS[0].image);

  // Transaction Status
  const [txStatus, setTxStatus] = useState<TransactionStatus>({ status: "idle" });

  // 1. Check network & wallet
  const checkNetwork = useCallback(async (): Promise<boolean> => {
    if (typeof window === "undefined" || !window.ethereum) return false;
    try {
      const chainIdHex = (await window.ethereum.request({ method: "eth_chainId" })) as string;
      const currentChainId = parseInt(chainIdHex, 16);
      const isCorrect = currentChainId === config.chainId;
      setIsWrongChain(!isCorrect);
      return isCorrect;
    } catch {
      return false;
    }
  }, []);

  // Switch / Add Botchain Testnet
  const switchChain = async () => {
    if (typeof window === "undefined" || !window.ethereum) return;
    const targetChainIdHex = `0x${config.chainId.toString(16)}`;
    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: targetChainIdHex }],
      });
      setIsWrongChain(false);
    } catch (switchError: any) {
      if (switchError.code === 4902 || switchError?.data?.originalError?.code === 4902) {
        try {
          await window.ethereum.request({
            method: "wallet_addEthereumChain",
            params: [
              {
                chainId: targetChainIdHex,
                chainName: config.chainName,
                rpcUrls: [config.rpcUrl],
                nativeCurrency: config.nativeCurrency,
                blockExplorerUrls: [config.explorerUrl],
              },
            ],
          });
          setIsWrongChain(false);
        } catch (addError) {
          console.error("Failed to add network:", addError);
        }
      } else {
        console.error("Failed to switch network:", switchError);
      }
    }
  };

  // Connect Wallet
  const connectWallet = async () => {
    if (typeof window === "undefined" || !window.ethereum) {
      alert("MetaMask or compatible Web3 wallet not detected.");
      return;
    }
    setIsConnecting(true);
    try {
      const accounts = (await window.ethereum.request({
        method: "eth_requestAccounts",
      })) as string[];

      if (accounts && accounts.length > 0) {
        const addr = accounts[0] as `0x${string}`;
        setAccount(addr);
        setMintFungibleTo(addr);
        setUniqueTo(addr);

        const ok = await checkNetwork();
        if (!ok) {
          await switchChain();
        }
      }
    } catch (err: any) {
      console.error("Connect error:", err);
    } finally {
      setIsConnecting(false);
    }
  };

  const disconnectWallet = () => {
    setAccount(null);
    setBotBalance("0");
    setIsMinter(false);
    setGoldBalance(0n);
    setFilterMode("all");
  };

  // 2. Fetch BOT Native Balance & Roles
  useEffect(() => {
    if (!account) return;

    publicClient
      .getBalance({ address: account })
      .then((bal) => setBotBalance(Number(formatEther(bal)).toFixed(4)))
      .catch((e) => console.error("Balance err:", e));

    if (isContractZero) return;

    // Check if account has MINTER_ROLE
    publicClient
      .readContract({
        address: config.contractAddress,
        abi: gastemAbi,
        functionName: "hasRole",
        args: [MINTER_ROLE, account],
      })
      .then((hasRole) => setIsMinter(Boolean(hasRole)))
      .catch((err) => {
        console.error("Role check error:", err);
        setIsMinter(false);
      });
  }, [account, isContractZero]);

  // 3. Fetch Items & Balances (Runs whether wallet is connected or not!)
  const loadItems = useCallback(async () => {
    if (isContractZero) return;
    setIsLoadingItems(true);

    try {
      // 1) Get next unique ID
      let nextUId = 1000000n;
      try {
        nextUId = await publicClient.readContract({
          address: config.contractAddress,
          abi: gastemAbi,
          functionName: "nextUniqueId",
        });
      } catch (e) {
        console.warn("nextUniqueId call failed:", e);
      }

      // Collect item IDs to probe:
      // - Gold (1)
      // - Fungible standard slots (100 - 110)
      // - Unique items (1,000,000 up to nextUId)
      const idsToScan: bigint[] = [1n];
      for (let i = 100n; i <= 108n; i++) {
        idsToScan.push(i);
      }
      for (let u = 1000000n; u < nextUId; u++) {
        idsToScan.push(u);
      }

      const fetchedItems: Item[] = [];

      for (const id of idsToScan) {
        try {
          const itemData = await publicClient.readContract({
            address: config.contractAddress,
            abi: gastemAbi,
            functionName: "items",
            args: [id],
          });

          const [name, description, imageUri, unique, maxSupply] = itemData;

          if (name && name.length > 0) {
            // Read total circulating supply for all items
            let totalSupply = 0n;
            try {
              totalSupply = await publicClient.readContract({
                address: config.contractAddress,
                abi: gastemAbi,
                functionName: "totalSupply",
                args: [id],
              });
            } catch {
              // supply call fallback
            }

            // Read user's personal balance if wallet is connected
            let balance = 0n;
            if (account) {
              try {
                balance = await publicClient.readContract({
                  address: config.contractAddress,
                  abi: gastemAbi,
                  functionName: "balanceOf",
                  args: [account, id],
                });
              } catch {
                // balance call fallback
              }
            }

            fetchedItems.push({
              id,
              name,
              description,
              imageUri,
              unique,
              maxSupply,
              balance,
              totalSupply,
            });

            if (id === 1n) {
              setTotalGoldSupply(totalSupply);
              if (account) {
                setGoldBalance(balance);
              }
            }
          }
        } catch {
          // Token slot not initialized or reverted
        }
      }

      setItems(fetchedItems);
    } catch (err) {
      console.error("Error loading items:", err);
    } finally {
      setIsLoadingItems(false);
    }
  }, [account, isContractZero]);

  // Initial fetch and listener
  useEffect(() => {
    loadItems();
  }, [loadItems]);

  // Listen to account / chain changes
  useEffect(() => {
    if (typeof window === "undefined" || !window.ethereum) return;

    const handleAccountsChanged = (accounts: string[]) => {
      if (accounts.length > 0) {
        const nextAddr = accounts[0] as `0x${string}`;
        setAccount(nextAddr);
        setMintFungibleTo(nextAddr);
        setUniqueTo(nextAddr);
      } else {
        setAccount(null);
      }
    };

    const handleChainChanged = () => {
      checkNetwork();
      loadItems();
    };

    window.ethereum.on?.("accountsChanged", handleAccountsChanged);
    window.ethereum.on?.("chainChanged", handleChainChanged);

    return () => {
      window.ethereum.removeListener?.("accountsChanged", handleAccountsChanged);
      window.ethereum.removeListener?.("chainChanged", handleChainChanged);
    };
  }, [checkNetwork, loadItems]);

  // 4. Transfer Item Action
  const handleTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!account) {
      connectWallet();
      return;
    }
    if (!transferModalItem) return;
    if (!isAddress(transferTo)) {
      alert("Invalid recipient address.");
      return;
    }
    const amt = BigInt(transferAmount);
    if (amt <= 0n || amt > transferModalItem.balance) {
      alert("Invalid transfer amount.");
      return;
    }

    try {
      setTxStatus({ status: "pending", message: `Transferring ${transferModalItem.name}...` });
      const walletClient = getWalletClient(account);
      const hash = await walletClient.writeContract({
        address: config.contractAddress,
        abi: gastemAbi,
        functionName: "safeTransferFrom",
        args: [account, transferTo as `0x${string}`, transferModalItem.id, amt, "0x"],
      });

      setTxStatus({ status: "pending", hash, message: "Transaction submitted. Awaiting block inclusion..." });
      await publicClient.waitForTransactionReceipt({ hash });

      setTxStatus({
        status: "success",
        hash,
        message: `Successfully transferred ${amt.toString()}x ${transferModalItem.name}!`,
      });
      setTransferModalItem(null);
      setTransferTo("");
      loadItems();
    } catch (err: any) {
      console.error("Transfer error:", err);
      setTxStatus({ status: "error", message: err?.shortMessage || err?.message || "Transfer failed" });
    }
  };

  // 5. Burn Item Action
  const handleBurn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!account) {
      connectWallet();
      return;
    }
    if (!burnModalItem) return;
    const amt = BigInt(burnAmount);
    if (amt <= 0n || amt > burnModalItem.balance) {
      alert("Invalid burn quantity.");
      return;
    }

    try {
      setTxStatus({ status: "pending", message: `Burning ${amt.toString()}x ${burnModalItem.name}...` });
      const walletClient = getWalletClient(account);
      const hash = await walletClient.writeContract({
        address: config.contractAddress,
        abi: gastemAbi,
        functionName: "burn",
        args: [burnModalItem.id, amt],
      });

      setTxStatus({ status: "pending", hash, message: "Burning in progress..." });
      await publicClient.waitForTransactionReceipt({ hash });

      setTxStatus({
        status: "success",
        hash,
        message: `Successfully incinerated ${amt.toString()}x ${burnModalItem.name}!`,
      });
      setBurnModalItem(null);
      loadItems();
    } catch (err: any) {
      console.error("Burn error:", err);
      setTxStatus({ status: "error", message: err?.shortMessage || err?.message || "Burn failed" });
    }
  };

  // 6. Admin: Mint Fungible
  const handleAdminMintFungible = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!account) return;
    if (!isAddress(mintFungibleTo)) {
      alert("Invalid recipient address.");
      return;
    }
    const id = BigInt(mintFungibleId);
    const amt = BigInt(mintFungibleAmount);
    if (amt <= 0n) {
      alert("Amount must be greater than zero.");
      return;
    }

    try {
      setTxStatus({ status: "pending", message: `Minting ${amt.toString()} units of token #${id.toString()}...` });
      const walletClient = getWalletClient(account);
      const hash = await walletClient.writeContract({
        address: config.contractAddress,
        abi: gastemAbi,
        functionName: "mintFungible",
        args: [mintFungibleTo as `0x${string}`, id, amt],
      });

      setTxStatus({ status: "pending", hash, message: "Mint transaction broadcasting..." });
      await publicClient.waitForTransactionReceipt({ hash });

      setTxStatus({ status: "success", hash, message: `Successfully minted fungible item #${id.toString()}!` });
      loadItems();
    } catch (err: any) {
      console.error("Mint fungible error:", err);
      setTxStatus({ status: "error", message: err?.shortMessage || err?.message || "Mint failed" });
    }
  };

  // 7. Admin: Create Fungible Type
  const handleAdminCreateFungible = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!account) return;
    const id = BigInt(createId);
    const maxSupply = BigInt(createMaxSupply);

    if (id !== 1n && (id < 100n || id > 999n)) {
      alert("Fungible token ID must be 1 (GOLD) or between 100 and 999.");
      return;
    }
    if (!createName.trim()) {
      alert("Item name is required.");
      return;
    }

    try {
      setTxStatus({ status: "pending", message: `Creating new fungible item #${id.toString()}...` });
      const walletClient = getWalletClient(account);
      const hash = await walletClient.writeContract({
        address: config.contractAddress,
        abi: gastemAbi,
        functionName: "createFungible",
        args: [id, createName.trim(), createDesc.trim(), createImg.trim(), maxSupply],
      });

      setTxStatus({ status: "pending", hash, message: "Registering item on-chain..." });
      await publicClient.waitForTransactionReceipt({ hash });

      setTxStatus({ status: "success", hash, message: `Registered ${createName} (ID #${id.toString()})!` });
      setCreateName("");
      setCreateDesc("");
      setCreateImg("");
      setCreateId((id + 1n).toString());
      loadItems();
    } catch (err: any) {
      console.error("Create fungible error:", err);
      setTxStatus({ status: "error", message: err?.shortMessage || err?.message || "Creation failed" });
    }
  };

  // 8. Admin: Mint Unique Item
  const handleAdminMintUnique = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!account) return;
    if (!isAddress(uniqueTo)) {
      alert("Invalid recipient address.");
      return;
    }
    if (!uniqueName.trim()) {
      alert("Unique item name is required.");
      return;
    }

    try {
      setTxStatus({ status: "pending", message: `Forging unique 1-of-1 ${uniqueName}...` });
      const walletClient = getWalletClient(account);
      const hash = await walletClient.writeContract({
        address: config.contractAddress,
        abi: gastemAbi,
        functionName: "mintUnique",
        args: [uniqueTo as `0x${string}`, uniqueName.trim(), uniqueDesc.trim(), uniqueImg.trim()],
      });

      setTxStatus({ status: "pending", hash, message: "Forging relic into the block..." });
      await publicClient.waitForTransactionReceipt({ hash });

      setTxStatus({
        status: "success",
        hash,
        message: `Unique legendary item "${uniqueName}" forged successfully!`,
      });
      loadItems();
    } catch (err: any) {
      console.error("Mint unique error:", err);
      setTxStatus({ status: "error", message: err?.shortMessage || err?.message || "Forging failed" });
    }
  };

  // Filter items:
  // If wallet connected and user selects 'my', filter to items where balance > 0
  // Otherwise, show ALL items in the realm!
  const displayedItems =
    account && filterMode === "my"
      ? items.filter((item) => item.balance > 0n)
      : items;

  const myOwnedCount = items.filter((i) => i.balance > 0n).length;

  return (
    <div>
      {/* 1. Un-deployed / Zero Address Alert Banner */}
      {isContractZero && (
        <div className="banner banner-warning">
          <span>⚠️ Contract not deployed yet, run npm run sync</span>
        </div>
      )}

      {/* Wrong Network Banner */}
      {account && isWrongChain && (
        <div className="banner banner-error">
          <span>Connected to wrong network. Please switch to {config.chainName} (Chain ID: {config.chainId}).</span>
          <button className="btn btn-primary" style={{ padding: "0.25rem 0.75rem", fontSize: "0.8rem" }} onClick={switchChain}>
            Switch Network
          </button>
        </div>
      )}

      {/* Header */}
      <header className="header">
        <div className="header-container">
          <div className="brand">
            <span className="brand-icon">⚔️</span>
            <div>
              <h1 className="brand-title">Gastem</h1>
              <p className="brand-subtitle">One Multi-Token Item Realm</p>
            </div>
          </div>

          <div className="header-actions">
            {/* Gold Counter in Header (Always visible even when disconnected!) */}
            <div
              className="gold-counter"
              title={account ? "Your personal gold balance" : "Total realm circulating gold"}
            >
              <div className="gold-counter-icon">🪙</div>
              <span className="gold-counter-label">{account ? "Gold" : "Realm Gold"}</span>
              <span className="gold-counter-value">
                {account ? goldBalance.toLocaleString() : totalGoldSupply.toLocaleString()}
              </span>
            </div>

            {/* Navigation Tabs */}
            <div style={{ display: "flex", gap: "0.4rem" }}>
              <button
                className={`btn btn-tab ${activeTab === "inventory" ? "active" : ""}`}
                onClick={() => setActiveTab("inventory")}
              >
                🎒 Inventory ({items.length})
              </button>
              {isMinter && (
                <button
                  className={`btn btn-tab ${activeTab === "admin" ? "active" : ""}`}
                  onClick={() => setActiveTab("admin")}
                  style={{ color: "#f59e0b", borderColor: activeTab === "admin" ? "#f59e0b" : "transparent" }}
                >
                  ⚡ Admin Panel
                </button>
              )}
            </div>

            {/* Wallet Connect */}
            {!account ? (
              <button className="btn btn-primary" onClick={connectWallet} disabled={isConnecting}>
                {isConnecting ? <span className="spinner" /> : "Connect Wallet"}
              </button>
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                <div
                  style={{
                    fontSize: "0.8rem",
                    background: "rgba(0,0,0,0.3)",
                    padding: "0.4rem 0.75rem",
                    borderRadius: "6px",
                    border: "1px solid #1e293b",
                  }}
                  title={account}
                >
                  <span style={{ color: "#94a3b8" }}>{account.slice(0, 6)}...{account.slice(-4)}</span>
                  <span style={{ marginLeft: "0.5rem", color: "#f59e0b", fontWeight: 700 }}>
                    {botBalance} BOT
                  </span>
                </div>
                <button
                  className="btn btn-secondary"
                  style={{ padding: "0.4rem 0.6rem", fontSize: "0.8rem" }}
                  onClick={disconnectWallet}
                  title="Disconnect"
                >
                  ✕
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="main-content">
        {/* TAB 1: INVENTORY (VISIBLE TO ALL, EVEN WITHOUT WALLET CONNECTED!) */}
        {activeTab === "inventory" && (
          <section>
            {/* Top informational banner when disconnected */}
            {!account && (
              <div
                style={{
                  background: "linear-gradient(135deg, rgba(245, 158, 11, 0.12), rgba(168, 85, 247, 0.08))",
                  border: "1px solid rgba(245, 158, 11, 0.3)",
                  borderRadius: "10px",
                  padding: "0.85rem 1.25rem",
                  marginBottom: "1.5rem",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  flexWrap: "wrap",
                  gap: "0.75rem",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                  <span style={{ fontSize: "1.3rem" }}>🛡️</span>
                  <span style={{ fontSize: "0.92rem", color: "#f1f5f9" }}>
                    <strong>Viewing all Realm Inventories.</strong> All items registered on-chain are visible below. Connect your wallet to inspect personal balances or transfer items.
                  </span>
                </div>
                <button
                  className="btn btn-primary"
                  style={{ padding: "0.4rem 0.9rem", fontSize: "0.8rem" }}
                  onClick={connectWallet}
                >
                  Connect Wallet
                </button>
              </div>
            )}

            <div className="section-header">
              <div style={{ display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
                <h2 className="section-title">
                  <span>{filterMode === "my" ? "Your Personal Inventory" : "Realm Item Inventory"}</span>
                  <span className="section-badge">{displayedItems.length} items</span>
                </h2>

                {/* Filter toggle if wallet is connected */}
                {account && (
                  <div style={{ display: "inline-flex", background: "rgba(0,0,0,0.3)", borderRadius: "6px", padding: "2px", border: "1px solid #1e293b" }}>
                    <button
                      className="quick-btn"
                      style={{
                        background: filterMode === "all" ? "rgba(245, 158, 11, 0.2)" : "transparent",
                        color: filterMode === "all" ? "#fde68a" : "#94a3b8",
                        borderColor: filterMode === "all" ? "#f59e0b" : "transparent",
                      }}
                      onClick={() => setFilterMode("all")}
                    >
                      All Realm Items ({items.length})
                    </button>
                    <button
                      className="quick-btn"
                      style={{
                        background: filterMode === "my" ? "rgba(245, 158, 11, 0.2)" : "transparent",
                        color: filterMode === "my" ? "#fde68a" : "#94a3b8",
                        borderColor: filterMode === "my" ? "#f59e0b" : "transparent",
                      }}
                      onClick={() => setFilterMode("my")}
                    >
                      Owned by Me ({myOwnedCount})
                    </button>
                  </div>
                )}
              </div>

              <button
                className="btn btn-secondary"
                style={{ fontSize: "0.8rem", padding: "0.35rem 0.8rem" }}
                onClick={() => loadItems()}
                disabled={isLoadingItems}
              >
                {isLoadingItems ? <span className="spinner" /> : "↻ Refresh"}
              </button>
            </div>

            {displayedItems.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">🎒</div>
                <h3 className="empty-state-title">
                  {filterMode === "my" ? "Your Personal Inventory is Empty" : "No Items Found in Realm"}
                </h3>
                <p className="empty-state-desc">
                  {filterMode === "my"
                    ? "You do not own any items yet. Switch to 'All Realm Items' to view items in circulation, or ask an admin for a grant!"
                    : "Connecting to RPC node on Botchain Testnet to read registered items..."}
                </p>
                {account && filterMode === "my" && (
                  <button
                    className="btn btn-primary"
                    style={{ marginTop: "1rem" }}
                    onClick={() => setFilterMode("all")}
                  >
                    View All Realm Items
                  </button>
                )}
              </div>
            ) : (
              <div className="item-grid">
                {displayedItems.map((item) => (
                  <div key={item.id.toString()} className={`item-card ${item.unique ? "is-unique" : ""}`}>
                    <div className="card-header-bar">
                      <span className={`badge ${item.unique ? "badge-unique" : "badge-stackable"}`}>
                        {item.unique ? "★ UNIQUE (1 of 1)" : "STACKABLE"}
                      </span>
                      <span className="item-id-badge">#{item.id.toString()}</span>
                    </div>

                    <div className="card-image-wrapper">
                      <img
                        src={item.imageUri}
                        alt={item.name}
                        className="card-image"
                        onError={(e) => {
                          // Fallback placeholder if image fails
                          (e.target as HTMLImageElement).src =
                            "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect width='100' height='100' fill='%23111827'/><text x='50' y='55' font-size='24' fill='%236b7280' text-anchor='middle'>ITEM</text></svg>";
                        }}
                      />
                    </div>

                    <h3 className="item-name">{item.name}</h3>
                    <p className="item-desc">{item.description}</p>

                    <div className="card-stats">
                      <div>
                        <div className="stat-label">{account ? "Owned by You" : "Circulating"}</div>
                        <div className="stat-value">
                          {account ? item.balance.toLocaleString() : item.totalSupply.toLocaleString()}
                        </div>
                      </div>
                      <div>
                        <div className="stat-label">Max Cap</div>
                        <div className="stat-value" style={{ color: "#94a3b8" }}>
                          {item.maxSupply === 0n ? "Unlimited" : item.maxSupply.toString()}
                        </div>
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div className="card-actions">
                      {!account ? (
                        <button
                          className="btn btn-secondary"
                          style={{ gridColumn: "span 2", fontSize: "0.8rem", padding: "0.45rem" }}
                          onClick={connectWallet}
                        >
                          Connect to Trade
                        </button>
                      ) : (
                        <>
                          <button
                            className="btn btn-primary"
                            style={{ fontSize: "0.8rem", padding: "0.45rem" }}
                            disabled={item.balance === 0n}
                            onClick={() => {
                              setTransferModalItem(item);
                              setTransferAmount("1");
                              setTransferTo("");
                            }}
                          >
                            Transfer
                          </button>
                          <button
                            className="btn btn-secondary"
                            style={{ fontSize: "0.8rem", padding: "0.45rem" }}
                            disabled={item.balance === 0n}
                            onClick={() => {
                              setBurnModalItem(item);
                              setBurnAmount("1");
                            }}
                          >
                            Burn
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* TAB 2: ADMIN PANEL (VISIBLE ONLY IF MINTER_ROLE) */}
        {activeTab === "admin" && isMinter && (
          <section>
            <div className="section-header">
              <h2 className="section-title">
                <span>Admin Guildmaster Panel</span>
                <span className="section-badge" style={{ color: "#f59e0b", borderColor: "#f59e0b" }}>
                  MINTER ROLE AUTHORIZED
                </span>
              </h2>
            </div>

            <div className="admin-grid">
              {/* Form 1: Mint Fungible Items */}
              <div className="admin-card">
                <h3 className="admin-card-title">🪙 Mint Fungible Item</h3>
                <p className="admin-card-desc">
                  Issue existing stackable tokens (Gold, Potions, Scrolls) to an adventurer.
                </p>

                <form onSubmit={handleAdminMintFungible}>
                  <div className="form-group">
                    <label className="form-label">Item Selection</label>
                    <div className="quick-btn-group" style={{ marginBottom: "0.5rem" }}>
                      <button type="button" className="quick-btn" onClick={() => setMintFungibleId("1")}>
                        Gold (1)
                      </button>
                      <button type="button" className="quick-btn" onClick={() => setMintFungibleId("100")}>
                        Health Potion (100)
                      </button>
                      <button type="button" className="quick-btn" onClick={() => setMintFungibleId("101")}>
                        Mana Potion (101)
                      </button>
                      <button type="button" className="quick-btn" onClick={() => setMintFungibleId("102")}>
                        Elixir Dragon (102)
                      </button>
                    </div>
                    <input
                      type="number"
                      className="form-input"
                      placeholder="Token ID (e.g. 1, 100)"
                      value={mintFungibleId}
                      onChange={(e) => setMintFungibleId(e.target.value)}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Recipient Address</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="0x..."
                      value={mintFungibleTo}
                      onChange={(e) => setMintFungibleTo(e.target.value)}
                      required
                    />
                    {account && (
                      <div className="quick-btn-group">
                        <button type="button" className="quick-btn" onClick={() => setMintFungibleTo(account)}>
                          Assign to Me
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="form-group">
                    <label className="form-label">Amount</label>
                    <input
                      type="number"
                      className="form-input"
                      min="1"
                      value={mintFungibleAmount}
                      onChange={(e) => setMintFungibleAmount(e.target.value)}
                      required
                    />
                  </div>

                  <button type="submit" className="btn btn-primary" style={{ width: "100%" }}>
                    Mint Fungible
                  </button>
                </form>
              </div>

              {/* Form 2: Create Fungible Item Type */}
              <div className="admin-card">
                <h3 className="admin-card-title">📜 Register New Item Type</h3>
                <p className="admin-card-desc">
                  Create a new fungible token blueprint (ID range: 100 - 999).
                </p>

                <form onSubmit={handleAdminCreateFungible}>
                  <div className="form-group">
                    <label className="form-label">Token ID [100 - 999]</label>
                    <input
                      type="number"
                      className="form-input"
                      min="100"
                      max="999"
                      value={createId}
                      onChange={(e) => setCreateId(e.target.value)}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Item Name</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="e.g. Elixir of Dragon Breath"
                      value={createName}
                      onChange={(e) => setCreateName(e.target.value)}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Description</label>
                    <textarea
                      className="form-textarea"
                      placeholder="Lore and gameplay effects..."
                      value={createDesc}
                      onChange={(e) => setCreateDesc(e.target.value)}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Image URI</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="HTTPS, IPFS, or data:image/svg+xml..."
                      value={createImg}
                      onChange={(e) => setCreateImg(e.target.value)}
                      required
                    />
                    <div className="quick-btn-group">
                      <button
                        type="button"
                        className="quick-btn"
                        onClick={() =>
                          setCreateImg(
                            "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect width='100' height='100' rx='16' fill='%23062817'/><path d='M42 22 h16 v8 h-16 z M36 30 h28 l12 24 c4 8 0 24-10 30 c-8 5-24 5-32 0 c-10-6-14-22-10-30 z' fill='%2310b981' stroke='%236ee7b7' stroke-width='3'/><rect x='41' y='16' width='18' height='6' rx='2' fill='%2378350f'/><circle cx='50' cy='54' r='6' fill='%23d1fae5'/></svg>"
                          )
                        }
                      >
                        Emerald Potion SVG
                      </button>
                    </div>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Max Supply (0 = unlimited)</label>
                    <input
                      type="number"
                      className="form-input"
                      min="0"
                      value={createMaxSupply}
                      onChange={(e) => setCreateMaxSupply(e.target.value)}
                      required
                    />
                  </div>

                  <button type="submit" className="btn btn-primary" style={{ width: "100%" }}>
                    Register Blueprint
                  </button>
                </form>
              </div>

              {/* Form 3: Mint Unique Item */}
              <div className="admin-card" style={{ borderColor: "rgba(168, 85, 247, 0.4)" }}>
                <h3 className="admin-card-title" style={{ color: "#d8b4fe" }}>
                  ⚔️ Forge Unique Item (1-of-1)
                </h3>
                <p className="admin-card-desc">
                  Mints an exclusive legendary weapon or relic with supply capped at exactly 1.
                </p>

                <div style={{ marginBottom: "1rem" }}>
                  <label className="form-label">Quick Presets</label>
                  <div className="quick-btn-group">
                    {UNIQUE_PRESETS.map((preset) => (
                      <button
                        key={preset.name}
                        type="button"
                        className="quick-btn"
                        onClick={() => {
                          setUniqueName(preset.name);
                          setUniqueDesc(preset.desc);
                          setUniqueImg(preset.image);
                        }}
                      >
                        {preset.name.split(" ")[0]}
                      </button>
                    ))}
                  </div>
                </div>

                <form onSubmit={handleAdminMintUnique}>
                  <div className="form-group">
                    <label className="form-label">Recipient Address</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="0x..."
                      value={uniqueTo}
                      onChange={(e) => setUniqueTo(e.target.value)}
                      required
                    />
                    {account && (
                      <div className="quick-btn-group">
                        <button type="button" className="quick-btn" onClick={() => setUniqueTo(account)}>
                          Assign to Me
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="form-group">
                    <label className="form-label">Item Name</label>
                    <input
                      type="text"
                      className="form-input"
                      value={uniqueName}
                      onChange={(e) => setUniqueName(e.target.value)}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Lore / Description</label>
                    <textarea
                      className="form-textarea"
                      value={uniqueDesc}
                      onChange={(e) => setUniqueDesc(e.target.value)}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Image URI (Data URI or URL)</label>
                    <textarea
                      className="form-textarea"
                      value={uniqueImg}
                      onChange={(e) => setUniqueImg(e.target.value)}
                      rows={2}
                      required
                    />
                  </div>

                  <button
                    type="submit"
                    className="btn btn-primary"
                    style={{
                      width: "100%",
                      background: "linear-gradient(135deg, #7e22ce 0%, #581c87 100%)",
                      borderColor: "#a855f7",
                    }}
                  >
                    Forge Unique Relic
                  </button>
                </form>
              </div>
            </div>
          </section>
        )}
      </main>

      {/* Transfer Modal */}
      {transferModalItem && (
        <div className="modal-overlay" onClick={() => setTransferModalItem(null)}>
          <div className="modal-container" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Transfer {transferModalItem.name}</h3>
              <button className="modal-close" onClick={() => setTransferModalItem(null)}>
                ×
              </button>
            </div>

            <form onSubmit={handleTransfer}>
              <div className="form-group">
                <label className="form-label">Recipient Address</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="0x..."
                  value={transferTo}
                  onChange={(e) => setTransferTo(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">
                  Amount (Available: {transferModalItem.balance.toString()})
                </label>
                <input
                  type="number"
                  className="form-input"
                  min="1"
                  max={transferModalItem.balance.toString()}
                  value={transferAmount}
                  disabled={transferModalItem.unique}
                  onChange={(e) => setTransferAmount(e.target.value)}
                  required
                />
                {transferModalItem.unique && (
                  <span style={{ fontSize: "0.75rem", color: "#c084fc", marginTop: "0.25rem", display: "block" }}>
                    Unique 1-of-1 items can only be transferred in quantity 1.
                  </span>
                )}
              </div>

              <div style={{ display: "flex", gap: "0.5rem", marginTop: "1.5rem" }}>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>
                  Confirm Transfer
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => setTransferModalItem(null)}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Burn Modal */}
      {burnModalItem && (
        <div className="modal-overlay" onClick={() => setBurnModalItem(null)}>
          <div className="modal-container" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title" style={{ color: "#f87171" }}>
                Incinerate {burnModalItem.name}
              </h3>
              <button className="modal-close" onClick={() => setBurnModalItem(null)}>
                ×
              </button>
            </div>

            <p style={{ fontSize: "0.85rem", color: "#fca5a5", marginBottom: "1rem" }}>
              Warning: Burned items are permanently destroyed from the realm. Unique items cannot be recovered.
            </p>

            <form onSubmit={handleBurn}>
              <div className="form-group">
                <label className="form-label">
                  Burn Amount (Available: {burnModalItem.balance.toString()})
                </label>
                <input
                  type="number"
                  className="form-input"
                  min="1"
                  max={burnModalItem.balance.toString()}
                  value={burnAmount}
                  disabled={burnModalItem.unique}
                  onChange={(e) => setBurnAmount(e.target.value)}
                  required
                />
              </div>

              <div style={{ display: "flex", gap: "0.5rem", marginTop: "1.5rem" }}>
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{
                    flex: 1,
                    background: "linear-gradient(135deg, #b91c1c 0%, #7f1d1d 100%)",
                    borderColor: "#ef4444",
                  }}
                >
                  Burn Permanently
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => setBurnModalItem(null)}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Transaction Status Toast */}
      {txStatus.status !== "idle" && (
        <div className="tx-toast">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <strong
              style={{
                fontFamily: "var(--font-serif)",
                color:
                  txStatus.status === "pending"
                    ? "#f59e0b"
                    : txStatus.status === "success"
                    ? "#10b981"
                    : "#ef4444",
              }}
            >
              {txStatus.status === "pending" && "⏳ Transaction Pending"}
              {txStatus.status === "success" && "⚔️ Quest Complete"}
              {txStatus.status === "error" && "⚠️ Action Failed"}
            </strong>
            <button
              onClick={() => setTxStatus({ status: "idle" })}
              style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer" }}
            >
              ✕
            </button>
          </div>

          <p style={{ fontSize: "0.85rem", color: "#e2e8f0" }}>{txStatus.message}</p>

          {txStatus.hash && (
            <a
              href={`${config.explorerUrl}/tx/${txStatus.hash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="tx-link"
            >
              View on Explorer ({txStatus.hash.slice(0, 10)}...{txStatus.hash.slice(-8)})
            </a>
          )}
        </div>
      )}
    </div>
  );
}
