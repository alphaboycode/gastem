// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/token/ERC1155/extensions/ERC1155Supply.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Base64.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

/**
 * @title Gastem
 * @author Gastem Protocol
 * @notice Game item system where fungible resources (Gold, Potions) and unique items (Weapons, Relics)
 *         coexist within a single ERC-1155 multi-token contract on Botchain.
 * @dev ID Ranges:
 *      - 1: GOLD (unlimited supply currency)
 *      - 100 - 999: Fungible items (potions, scrolls, materials)
 *      - 1,000,000+: Unique items (weapons, armor, supply = 1)
 */
contract Gastem is ERC1155, ERC1155Supply, AccessControl {
    using Strings for uint256;

    /// @notice Role identifier for accounts permitted to mint items.
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    /// @notice Token ID for the native realm currency (Gold).
    uint256 public constant GOLD = 1;

    /// @notice Minimum token ID for fungible game items.
    uint256 public constant FUNGIBLE_MIN_ID = 100;

    /// @notice Maximum token ID for fungible game items.
    uint256 public constant FUNGIBLE_MAX_ID = 999;

    /// @notice Starting token ID for unique 1-of-1 items.
    uint256 public constant UNIQUE_START_ID = 1_000_000;

    /// @notice Metadata and supply constraints for a token ID.
    struct ItemInfo {
        string name;
        string description;
        string imageUri;
        bool unique;
        uint256 maxSupply; // 0 = unlimited for fungibles; 1 for unique items
    }

    /// @notice Registry of metadata and properties per token ID.
    mapping(uint256 => ItemInfo) public items;

    /// @dev Tracks whether a unique token ID has ever been minted to prevent replay even after burns.
    mapping(uint256 => bool) private _uniqueMinted;

    /// @dev Internal auto-incrementing counter for unique items starting at 1,000,000.
    uint256 private _nextUniqueId = UNIQUE_START_ID;

    // --- Custom Errors ---
    error InvalidItemId(uint256 id);
    error ItemAlreadyExists(uint256 id);
    error ItemDoesNotExist(uint256 id);
    error ItemIsUnique(uint256 id);
    error MaxSupplyExceeded(uint256 id, uint256 requested, uint256 maxSupply);
    error UniqueItemAlreadyMinted(uint256 id);
    error InvalidAmount();
    error InvalidRecipient();

    // --- Events ---
    event ItemCreated(
        uint256 indexed id,
        string name,
        string description,
        string imageUri,
        bool unique,
        uint256 maxSupply
    );

    event UniqueMinted(
        uint256 indexed id,
        address indexed to,
        string name,
        string description,
        string imageUri
    );

    /**
     * @notice Initializes the Gastem item system, grants admin and minter roles to deployer,
     *         and registers initial seed items: Gold (1), Health Potion (100), Mana Potion (101).
     */
    constructor() ERC1155("") {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(MINTER_ROLE, msg.sender);

        // Seed 1: Gold (Unlimited currency)
        _createFungible(
            GOLD,
            "Gold",
            "The sovereign currency of Botchain realms. Accepted by all merchants and guildmasters.",
            "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><circle cx='50' cy='50' r='44' fill='%231a1505' stroke='%23f59e0b' stroke-width='4'/><circle cx='50' cy='50' r='36' fill='%23d97706' stroke='%23fbbf24' stroke-width='2'/><text x='50' y='63' font-size='36' font-weight='bold' fill='%23fef3c7' text-anchor='middle' font-family='serif'>G</text></svg>",
            0
        );

        // Seed 100: Health Potion
        _createFungible(
            100,
            "Health Potion",
            "A crimson elixir brewed with fire-bloom herbs. Instantly restores 50 Hit Points.",
            "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect width='100' height='100' rx='16' fill='%23180c0c'/><path d='M42 22 h16 v8 h-16 z M36 30 h28 l12 24 c4 8 0 24-10 30 c-8 5-24 5-32 0 c-10-6-14-22-10-30 z' fill='%23ef4444' stroke='%23fca5a5' stroke-width='3'/><rect x='41' y='16' width='18' height='6' rx='2' fill='%2378350f'/><circle cx='50' cy='54' r='6' fill='%23fecaca'/></svg>",
            0
        );

        // Seed 101: Mana Potion
        _createFungible(
            101,
            "Mana Potion",
            "A cobalt draught infused with starlight essence. Instantly restores 50 Mana Points.",
            "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect width='100' height='100' rx='16' fill='%23081326'/><path d='M42 22 h16 v8 h-16 z M36 30 h28 l12 24 c4 8 0 24-10 30 c-8 5-24 5-32 0 c-10-6-14-22-10-30 z' fill='%233b82f6' stroke='%2393c5fd' stroke-width='3'/><rect x='41' y='16' width='18' height='6' rx='2' fill='%2378350f'/><circle cx='50' cy='54' r='6' fill='%23dbeafe'/></svg>",
            0
        );
    }

    /**
     * @notice Registers a new fungible item type.
     * @param id Token ID (must be 1 for GOLD or within [100, 999]).
     * @param name Name of the item.
     * @param description Narrative description of the item.
     * @param imageUri Image URI (HTTPS, IPFS, or data:image/svg+xml).
     * @param maxSupply Maximum total supply allowed (0 = unlimited).
     */
    function createFungible(
        uint256 id,
        string memory name,
        string memory description,
        string memory imageUri,
        uint256 maxSupply
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _createFungible(id, name, description, imageUri, maxSupply);
    }

    /**
     * @notice Mints an amount of a fungible item to a recipient address.
     * @dev Enforces maxSupply cap when maxSupply > 0. Reverts if item is unique or does not exist.
     * @param to Recipient address.
     * @param id Token ID to mint.
     * @param amount Quantity of tokens to mint.
     */
    function mintFungible(
        address to,
        uint256 id,
        uint256 amount
    ) external onlyRole(MINTER_ROLE) {
        if (to == address(0)) revert InvalidRecipient();
        if (amount == 0) revert InvalidAmount();

        ItemInfo memory item = items[id];
        if (bytes(item.name).length == 0) revert ItemDoesNotExist(id);
        if (item.unique) revert ItemIsUnique(id);

        if (item.maxSupply > 0) {
            uint256 currentSupply = totalSupply(id);
            if (currentSupply + amount > item.maxSupply) {
                revert MaxSupplyExceeded(id, currentSupply + amount, item.maxSupply);
            }
        }

        _mint(to, id, amount, "");
    }

    /**
     * @notice Mints a unique 1-of-1 item (e.g. legendary sword) under a new auto-incremented ID.
     * @dev Assigns ID >= 1,000,000, marks unique=true, maxSupply=1, and mints quantity 1.
     * @param to Recipient address.
     * @param name Name of the unique item.
     * @param description Narrative lore or description.
     * @param imageUri Image URI.
     * @return id The allocated unique token ID.
     */
    function mintUnique(
        address to,
        string memory name,
        string memory description,
        string memory imageUri
    ) external onlyRole(MINTER_ROLE) returns (uint256 id) {
        if (to == address(0)) revert InvalidRecipient();

        id = _nextUniqueId++;

        items[id] = ItemInfo({
            name: name,
            description: description,
            imageUri: imageUri,
            unique: true,
            maxSupply: 1
        });

        emit ItemCreated(id, name, description, imageUri, true, 1);
        emit UniqueMinted(id, to, name, description, imageUri);

        _mint(to, id, 1, "");
    }

    /**
     * @notice Burn items held by the caller.
     * @param id The token ID to burn.
     * @param amount The quantity to burn.
     */
    function burn(uint256 id, uint256 amount) public {
        _burn(msg.sender, id, amount);
    }

    /**
     * @notice Burn items held by `account` if caller is the account or approved operator.
     * @param account The owner of the tokens to burn.
     * @param id The token ID to burn.
     * @param amount The quantity to burn.
     */
    function burn(address account, uint256 id, uint256 amount) public {
        if (account != msg.sender && !isApprovedForAll(account, msg.sender)) {
            revert ERC1155MissingApprovalForAll(msg.sender, account);
        }
        _burn(account, id, amount);
    }

    /**
     * @notice Returns on-chain base64 encoded JSON metadata for a given token ID.
     * @param id Token ID to query.
     * @return Data URI containing JSON metadata with name, description, image, and type attributes.
     */
    function uri(uint256 id) public view virtual override returns (string memory) {
        ItemInfo memory item = items[id];
        if (bytes(item.name).length == 0) {
            revert ItemDoesNotExist(id);
        }

        string memory itemType = item.unique ? "unique" : "fungible";

        string memory json = string.concat(
            '{"name":"', item.name,
            '","description":"', item.description,
            '","image":"', item.imageUri,
            '","attributes":[{"trait_type":"Type","value":"', itemType,
            '"},{"type":"', itemType,
            '"},{"trait_type":"Max Supply","value":', item.maxSupply.toString(),
            '}}]}'
        );

        return string.concat("data:application/json;base64,", Base64.encode(bytes(json)));
    }

    /**
     * @notice Returns the next unique ID that will be allocated.
     */
    function nextUniqueId() external view returns (uint256) {
        return _nextUniqueId;
    }

    /**
     * @dev Internal helper to validate and store a fungible item configuration.
     */
    function _createFungible(
        uint256 id,
        string memory name,
        string memory description,
        string memory imageUri,
        uint256 maxSupply
    ) internal {
        if (id != GOLD && (id < FUNGIBLE_MIN_ID || id > FUNGIBLE_MAX_ID)) {
            revert InvalidItemId(id);
        }
        if (bytes(items[id].name).length > 0) {
            revert ItemAlreadyExists(id);
        }

        items[id] = ItemInfo({
            name: name,
            description: description,
            imageUri: imageUri,
            unique: false,
            maxSupply: maxSupply
        });

        emit ItemCreated(id, name, description, imageUri, false, maxSupply);
    }

    /**
     * @dev Hook that is called before any token transfer, minting, or burning.
     *      Overrides both ERC1155 and ERC1155Supply to resolve the multiple-inheritance conflict,
     *      and blocks any second mint of a unique ID.
     */
    function _update(
        address from,
        address to,
        uint256[] memory ids,
        uint256[] memory values
    ) internal virtual override(ERC1155, ERC1155Supply) {
        // Enforce unique mint constraint on mints (from == address(0))
        if (from == address(0)) {
            for (uint256 i = 0; i < ids.length; ++i) {
                uint256 id = ids[i];
                if (items[id].unique) {
                    if (_uniqueMinted[id] || values[i] > 1) {
                        revert UniqueItemAlreadyMinted(id);
                    }
                    _uniqueMinted[id] = true;
                }
            }
        }

        super._update(from, to, ids, values);
    }

    /**
     * @dev Resolves conflict between ERC1155 and AccessControl.
     */
    function supportsInterface(bytes4 interfaceId)
        public
        view
        virtual
        override(ERC1155, AccessControl)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
