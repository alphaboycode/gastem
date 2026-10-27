# Gastem — Game Item System on Botchain

Gastem is a dark-fantasy Web3 game item system where **Gold**, **Potions**, and **Legendary Unique Weapons** coexist inside a **single ERC-1155 multi-token smart contract** on **Botchain Testnet** (Chain ID: 968).

Fungible items (gold, mana/health potions) and unique items (one-of-a-kind legendary swords with supply strictly equal to 1) live side-by-side with complete on-chain base64 JSON metadata and strict supply controls.

---

## Architecture & Token ID Ranges

| Token ID Range | Item Type | Max Supply | Description |
|---|---|---|---|
| `1` | **Gold** | Unlimited (`0`) | Sovereign realm currency. |
| `100` – `999` | **Fungible Items** | Configurable (or `0` = unlimited) | Consumables, potions, scrolls, materials. Seeded with Health Potion (`100`) and Mana Potion (`101`). |
| `1,000,000`+ | **Unique Items** | Exactly `1` | Auto-incrementing 1-of-1 relics (e.g. Sunforged Claymore, Dragonscale Aegis). Re-minting is blocked even if burned. |

---

## Tech Stack

- **Smart Contracts**: Foundry (`forge`, `cast`), Solidity `^0.8.24`, OpenZeppelin Contracts `v5.2.0`
- **Network**: Botchain Testnet
  - **Chain ID**: `968`
  - **RPC**: `https://rpc.bohr.life`
  - **Native Token**: `BOT`
  - **Explorer**: `https://scan.bohr.life/`
- **Frontend**: Vite + React 18 + TypeScript, `viem` for chain interaction, plain CSS (dark fantasy theme)

---

## Project Structure

```
gastem/
├── contracts/
│   ├── src/
│   │   └── Gastem.sol               # Core ERC-1155 contract
│   ├── test/
│   │   └── Gastem.t.sol             # Comprehensive Foundry test suite & fuzz tests
│   ├── script/
│   │   └── Deploy.s.sol             # Deployment script (writes to deployments/968.json)
│   ├── deployments/
│   │   └── 968.json                 # Deployed contract address on chain 968
│   └── foundry.toml                 # Foundry configuration & RPC endpoints
├── web/
│   ├── scripts/
│   │   ├── sync-abi.mjs             # Copies contract ABI into web/src/abi.ts
│   │   └── sync-config.mjs          # Updates contractAddress in web/src/config.ts
│   ├── src/
│   │   ├── config.ts                # Single source of truth for chain & contract
│   │   ├── abi.ts                   # Auto-generated contract ABI
│   │   ├── viemClient.ts            # Public & wallet clients configured from config.ts
│   │   ├── types.ts                 # TypeScript types
│   │   ├── App.tsx                  # React UI (Inventory, Codex, Admin Guildmaster Panel)
│   │   └── index.css                # Plain CSS Dark Fantasy Theme
│   ├── package.json
│   └── vite.config.ts
├── .gitignore
└── README.md
```

---

## Smart Contract Details (`contracts/src/Gastem.sol`)

- **Inheritance**: Inherits `ERC1155`, `ERC1155Supply`, and `AccessControl`.
- **Roles**:
  - `DEFAULT_ADMIN_ROLE`: Register new fungible token blueprints (`createFungible`).
  - `MINTER_ROLE`: Mint fungibles (`mintFungible`) and forge unique 1-of-1 relics (`mintUnique`).
- **Constructor Seeds**:
  - ID `1`: Gold (unlimited supply currency)
  - ID `100`: Health Potion (restores 50 HP)
  - ID `101`: Mana Potion (restores 50 MP)
  - Deployer is granted both `DEFAULT_ADMIN_ROLE` and `MINTER_ROLE`.
- **Unique Enforcement**:
  - `mintUnique` assigns an auto-incrementing ID starting at `1,000,000`.
  - Overrides `_update(address from, address to, uint256[] ids, uint256[] values)` to resolve the `ERC1155` and `ERC1155Supply` multiple-inheritance conflict.
  - The `_update` hook permanently blocks any second mint of a unique item ID (even if previously burned) and prevents minting with amount > 1.
- **On-chain Metadata**:
  - `uri(uint256 id)` dynamically constructs on-chain base64 encoded JSON containing `name`, `description`, `image`, and attributes with `"type": "unique"` or `"fungible"`.

---

## Contract Build & Tests

Run all commands from the `contracts/` directory:

```bash
cd contracts

# Build contracts
forge build

# Run unit tests and fuzz tests with detailed traces
forge test -vvv
```

### Test Suite Coverage:
- `test_InitialSeedItems`: Validates initial items (Gold, Health Potion, Mana Potion) and deployer roles.
- `test_FungibleMint_Success`: Mints gold and potions to user and verifies balances and total supply.
- `test_FungibleMint_SupplyCap`: Tests capped fungible item supply constraint; asserts `MaxSupplyExceeded` revert.
- `test_Fungible_BurnByHolder`: Validates holder burning their own tokens.
- `test_Fungible_BurnByApprovedOperator`: Validates operator burning tokens on behalf of approved account.
- `test_Burn_UnauthorizedReverts`: Asserts `ERC1155MissingApprovalForAll` when unapproved accounts attempt to burn.
- `test_UniqueMint_SupplyOneAndCannotBeMintedTwice`: Verifies unique item mints amount 1, increments ID, and permanently blocks second mints (even after burn).
- `test_AccessControl_RevertsForNonMinters`: Asserts unauthorized accounts revert with `AccessControlUnauthorizedAccount`.
- `test_BatchTransfer_MixGoldPotionSword`: Tests `safeBatchTransferFrom` transferring gold, potions, and a unique sword together in a single transaction.
- `testFuzz_MintFungibleAmounts`: Fuzzes mint amounts for unlimited fungibles.
- `testFuzz_MintFungibleCappedSupply`: Fuzzes supply limits and mint quantities for capped fungibles.
- `test_Uri_OnChainBase64Json`: Tests on-chain base64 JSON metadata output.

---

## Deployment to Botchain Testnet

Deploy using the Foundry encrypted keystore account `gastem`:

```bash
cd contracts
forge script script/Deploy.s.sol \
  --rpc-url https://rpc.bohr.life \
  --account gastem \
  --password papa4mama4 \
  --broadcast \
  --legacy
```

### Fallback Flags for Gas Estimation
If gas estimation fails or fluctuates on Botchain:
- Add `--legacy` to force legacy transaction type (type 0).
- Add `--gas-price <WEI>` (e.g., `--gas-price 25000000000` for 25 gwei).
- Add `--slow` if nonces need slower submission intervals.

The deployment script automatically outputs the deployed address to `contracts/deployments/968.json`:
```json
{
  "address": "0x74300bF99A3689683212d3558191E16bD9092181"
}
```

---

## Contract Verification on Explorer

Botchain Testnet runs Blockscout at `https://scan.bohr.life`. You can submit the contract for verification using `forge verify-contract`:

```bash
cd contracts
forge verify-contract <DEPLOYED_ADDRESS> src/Gastem.sol:Gastem \
  --verifier blockscout \
  --verifier-url https://scan.bohr.life/api
```

> **Explorer Verification Note**: The blockscout API endpoint accepts verification submissions and returns a verification GUID. If the remote explorer compiler worker is delayed or does not have Solidity 0.8.24 installed, verification may stay pending or require manual code submission on the web explorer UI at `https://scan.bohr.life/address/<DEPLOYED_ADDRESS>`.

---

## Frontend Synchronization (`npm run sync`)

Whenever you recompile or redeploy the contract, you do **not** need to touch any frontend code. Run a single command from `web/`:

```bash
cd web
npm run sync
```

This runs two automated sync scripts:
1. `npm run sync-abi`: Extracts the ABI from `../contracts/out/Gastem.sol/Gastem.json` into `web/src/abi.ts`.
2. `npm run sync-config`: Reads `../contracts/deployments/968.json` and updates `contractAddress` in `web/src/config.ts`.

> If `contractAddress` is set to the zero address (`0x0000000000000000000000000000000000000000`), the frontend gracefully displays a prominent banner:  
> `⚠️ Contract not deployed yet, run npm run sync`  
> without crashing.

---

## Running the Web Frontend

```bash
cd web
npm install
npm run dev
```

Visit `http://localhost:5173` in your browser.

### Key Frontend Features:
- **Dark Fantasy UI**: Pure CSS theme with gold, crimson, cobalt, and purple accents.
- **Wallet Connection**: Automatically prompts `wallet_addEthereumChain` / `wallet_switchEthereumChain` for chain `968`.
- **Header Gold Counter**: Displays real-time Gold balance (`ID 1`).
- **Inventory Page**: Filtered grid of items owned by the connected wallet, showing name, SVG art, balance, and `UNIQUE` or `STACKABLE` badges.
- **Realm Codex**: View all items registered across the realm.
- **Transfer Modal**: Send items using `safeTransferFrom` with direct links to `https://scan.bohr.life/tx/<HASH>`.
- **Burn Modal**: Burn items permanently.
- **Admin Guildmaster Panel**: Visible **only** if the wallet possesses `MINTER_ROLE`. Allows minting fungibles, registering new fungible blueprints (`100`–`999`), and forging unique 1-of-1 items with preset weapon templates (Sunforged Claymore, Dragonscale Aegis, Archmage Staff, Shadowfang Dagger).


---

## Security Rules Followed

1. **No committed keys or secrets**: Private keys and keystores are never committed. Deployments use `--account gastem`.
2. **Clean `.gitignore`**: Ignores `contracts/cache/`, `contracts/out/`, `contracts/broadcast/`, `node_modules/`, and `.env` files.
3. **Public configuration only**: `web/src/config.ts` contains only public chain info and the deployed contract address.
4. **No `.env` or `import.meta.env`**: All chain and contract configurations are centralized in `web/src/config.ts`.

---

## Exact Commands from Zero to Running App

Follow these commands in exact order:

```bash
# 1. Compile smart contracts
cd contracts
forge build

# 2. Run test suite
forge test -vvv

# 3. Deploy to Botchain Testnet
forge script script/Deploy.s.sol \
  --rpc-url https://rpc.bohr.life \
  --account gastem \
  --password papa4mama4 \
  --broadcast \
  --legacy

# 4. Install frontend dependencies
cd ../web
npm install

# 5. Sync ABI and deployed contract address
npm run sync

# 6. Start the frontend development server
npm run dev
```
