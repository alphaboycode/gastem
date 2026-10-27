// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/Gastem.sol";
import "@openzeppelin/contracts/access/IAccessControl.sol";
import "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";

contract GastemTest is Test {
    Gastem public gastem;

    uint256 public constant GOLD_ID = 1;

    address public admin = address(0xAD);
    address public minter = address(0xAA);
    address public alice = address(0xA11CE);
    address public bob = address(0xB0B);
    address public stranger = address(0xDEAD);

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

    function setUp() public {
        vm.startPrank(admin);
        gastem = new Gastem();
        gastem.grantRole(gastem.MINTER_ROLE(), minter);
        vm.stopPrank();
    }

    /* -------------------------------------------------------------------------- */
    /*                             SEED & INITIAL TESTS                            */
    /* -------------------------------------------------------------------------- */

    function test_InitialSeedItems() public view {
        // Gold
        (string memory gName,,, bool gUnique, uint256 gSupply) = gastem.items(GOLD_ID);
        assertEq(gName, "Gold");
        assertFalse(gUnique);
        assertEq(gSupply, 0);

        // Health Potion
        (string memory hName,,, bool hUnique, uint256 hSupply) = gastem.items(100);
        assertEq(hName, "Health Potion");
        assertFalse(hUnique);
        assertEq(hSupply, 0);

        // Mana Potion
        (string memory mName,,, bool mUnique, uint256 mSupply) = gastem.items(101);
        assertEq(mName, "Mana Potion");
        assertFalse(mUnique);
        assertEq(mSupply, 0);

        // Roles
        assertTrue(gastem.hasRole(gastem.DEFAULT_ADMIN_ROLE(), admin));
        assertTrue(gastem.hasRole(gastem.MINTER_ROLE(), admin));
        assertTrue(gastem.hasRole(gastem.MINTER_ROLE(), minter));
        assertFalse(gastem.hasRole(gastem.MINTER_ROLE(), stranger));
    }

    /* -------------------------------------------------------------------------- */
    /*                        FUNGIBLE MINT & SUPPLY CAP & BURN                   */
    /* -------------------------------------------------------------------------- */

    function test_FungibleMint_Success() public {
        vm.prank(minter);
        gastem.mintFungible(alice, GOLD_ID, 1000);

        assertEq(gastem.balanceOf(alice, GOLD_ID), 1000);
        assertEq(gastem.totalSupply(GOLD_ID), 1000);

        vm.prank(minter);
        gastem.mintFungible(alice, 100, 5); // 5 Health Potions
        assertEq(gastem.balanceOf(alice, 100), 5);
        assertEq(gastem.totalSupply(100), 5);
    }

    function test_FungibleMint_SupplyCap() public {
        // Admin creates a rare scroll with maxSupply = 10
        vm.prank(admin);
        gastem.createFungible(200, "Scroll of Resurrection", "Brings allies back", "ipfs://scroll", 10);

        // Mint up to 10
        vm.prank(minter);
        gastem.mintFungible(alice, 200, 7);
        assertEq(gastem.totalSupply(200), 7);

        vm.prank(minter);
        gastem.mintFungible(bob, 200, 3);
        assertEq(gastem.totalSupply(200), 10);

        // Minting 1 more must revert with MaxSupplyExceeded
        vm.prank(minter);
        vm.expectRevert(
            abi.encodeWithSelector(Gastem.MaxSupplyExceeded.selector, 200, 11, 10)
        );
        gastem.mintFungible(alice, 200, 1);
    }

    function test_Fungible_BurnByHolder() public {
        vm.prank(minter);
        gastem.mintFungible(alice, GOLD_ID, 500);

        vm.prank(alice);
        gastem.burn(GOLD_ID, 200);

        assertEq(gastem.balanceOf(alice, GOLD_ID), 300);
        assertEq(gastem.totalSupply(GOLD_ID), 300);
    }

    function test_Fungible_BurnByApprovedOperator() public {
        vm.prank(minter);
        gastem.mintFungible(alice, 100, 10);

        // Alice approves Bob
        vm.prank(alice);
        gastem.setApprovalForAll(bob, true);

        // Bob burns on behalf of Alice
        vm.prank(bob);
        gastem.burn(alice, 100, 4);

        assertEq(gastem.balanceOf(alice, 100), 6);
        assertEq(gastem.totalSupply(100), 6);
    }

    function test_Burn_UnauthorizedReverts() public {
        vm.prank(minter);
        gastem.mintFungible(alice, 100, 10);

        // Stranger tries to burn Alice's tokens
        vm.prank(stranger);
        vm.expectRevert(
            abi.encodeWithSelector(IERC1155Errors.ERC1155MissingApprovalForAll.selector, stranger, alice)
        );
        gastem.burn(alice, 100, 1);
    }

    /* -------------------------------------------------------------------------- */
    /*                            UNIQUE ITEM TESTS                               */
    /* -------------------------------------------------------------------------- */

    function test_UniqueMint_SupplyOneAndCannotBeMintedTwice() public {
        vm.prank(minter);
        uint256 swordId = gastem.mintUnique(
            alice,
            "Frostmourne",
            "An ancient runeblade hunger for souls",
            "ipfs://frostmourne"
        );

        assertEq(swordId, 1_000_000);
        assertEq(gastem.balanceOf(alice, swordId), 1);
        assertEq(gastem.totalSupply(swordId), 1);

        (string memory name, string memory desc, string memory img, bool unique, uint256 maxSupply) =
            gastem.items(swordId);
        assertEq(name, "Frostmourne");
        assertEq(desc, "An ancient runeblade hunger for souls");
        assertEq(img, "ipfs://frostmourne");
        assertTrue(unique);
        assertEq(maxSupply, 1);

        // Attempting to mint unique item via mintFungible must revert
        vm.prank(minter);
        vm.expectRevert(abi.encodeWithSelector(Gastem.ItemIsUnique.selector, swordId));
        gastem.mintFungible(bob, swordId, 1);

        // Second unique item gets next ID (1,000,001)
        vm.prank(minter);
        uint256 shieldId = gastem.mintUnique(
            bob,
            "Aegis of the Immortal",
            "Forged in celestial flame",
            "ipfs://aegis"
        );
        assertEq(shieldId, 1_000_001);
        assertEq(gastem.balanceOf(bob, shieldId), 1);

        // Even if Alice burns her unique sword, re-minting that ID is blocked
        vm.prank(alice);
        gastem.burn(swordId, 1);
        assertEq(gastem.balanceOf(alice, swordId), 0);
        assertEq(gastem.totalSupply(swordId), 0);

        // Attempting to mint the burned unique item ID again must revert
        vm.prank(minter);
        vm.expectRevert(abi.encodeWithSelector(Gastem.ItemIsUnique.selector, swordId));
        gastem.mintFungible(alice, swordId, 1);
    }

    /* -------------------------------------------------------------------------- */
    /*                           ACCESS CONTROL TESTS                             */
    /* -------------------------------------------------------------------------- */

    function test_AccessControl_RevertsForNonMinters() public {
        bytes32 minterRole = gastem.MINTER_ROLE();
        bytes32 adminRole = gastem.DEFAULT_ADMIN_ROLE();

        // Stranger tries to mint fungible
        vm.prank(stranger);
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector,
                stranger,
                minterRole
            )
        );
        gastem.mintFungible(stranger, GOLD_ID, 100);

        // Stranger tries to mint unique
        vm.prank(stranger);
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector,
                stranger,
                minterRole
            )
        );
        gastem.mintUnique(stranger, "Hacked Sword", "Lore", "uri");

        // Non-admin (even minter) tries to create fungible
        vm.prank(minter);
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector,
                minter,
                adminRole
            )
        );
        gastem.createFungible(201, "Poison Vial", "Deadly poison", "uri", 0);
    }

    /* -------------------------------------------------------------------------- */
    /*                           BATCH TRANSFER TESTS                             */
    /* -------------------------------------------------------------------------- */

    function test_BatchTransfer_MixGoldPotionSword() public {
        // Mint Gold (1), Health Potion (100), and Unique Sword (1,000,000) to Alice
        vm.startPrank(minter);
        gastem.mintFungible(alice, GOLD_ID, 500);
        gastem.mintFungible(alice, 100, 5);
        uint256 swordId = gastem.mintUnique(alice, "Shadowfang", "Dagger drenched in shadow", "ipfs://shadowfang");
        vm.stopPrank();

        assertEq(swordId, 1_000_000);

        uint256[] memory ids = new uint256[](3);
        ids[0] = GOLD_ID;
        ids[1] = 100;
        ids[2] = swordId;

        uint256[] memory amounts = new uint256[](3);
        amounts[0] = 200; // send 200 gold
        amounts[1] = 2;   // send 2 potions
        amounts[2] = 1;   // send 1 unique sword

        // Alice transfers mix to Bob
        vm.prank(alice);
        gastem.safeBatchTransferFrom(alice, bob, ids, amounts, "");

        // Alice balances
        assertEq(gastem.balanceOf(alice, GOLD_ID), 300);
        assertEq(gastem.balanceOf(alice, 100), 3);
        assertEq(gastem.balanceOf(alice, swordId), 0);

        // Bob balances
        assertEq(gastem.balanceOf(bob, GOLD_ID), 200);
        assertEq(gastem.balanceOf(bob, 100), 2);
        assertEq(gastem.balanceOf(bob, swordId), 1);
    }

    /* -------------------------------------------------------------------------- */
    /*                                FUZZ TESTS                                  */
    /* -------------------------------------------------------------------------- */

    function testFuzz_MintFungibleAmounts(uint256 amount) public {
        // Bound amount between 1 and a realistic upper bound to prevent overflow in totalSupply
        amount = bound(amount, 1, type(uint128).max);

        vm.prank(minter);
        gastem.mintFungible(alice, GOLD_ID, amount);

        assertEq(gastem.balanceOf(alice, GOLD_ID), amount);
        assertEq(gastem.totalSupply(GOLD_ID), amount);
    }

    function testFuzz_MintFungibleCappedSupply(uint256 cap, uint256 mintAmount) public {
        cap = bound(cap, 1, 1_000_000);
        mintAmount = bound(mintAmount, 0, cap * 2);

        vm.prank(admin);
        gastem.createFungible(300, "Capped Crystal", "Rare mineral", "ipfs://crystal", cap);

        if (mintAmount == 0) {
            vm.prank(minter);
            vm.expectRevert(Gastem.InvalidAmount.selector);
            gastem.mintFungible(alice, 300, mintAmount);
        } else if (mintAmount <= cap) {
            vm.prank(minter);
            gastem.mintFungible(alice, 300, mintAmount);
            assertEq(gastem.balanceOf(alice, 300), mintAmount);
        } else {
            vm.prank(minter);
            vm.expectRevert(
                abi.encodeWithSelector(Gastem.MaxSupplyExceeded.selector, 300, mintAmount, cap)
            );
            gastem.mintFungible(alice, 300, mintAmount);
        }
    }

    /* -------------------------------------------------------------------------- */
    /*                              METADATA URI TEST                             */
    /* -------------------------------------------------------------------------- */

    function test_Uri_OnChainBase64Json() public {
        // Fungible item URI
        string memory goldUri = gastem.uri(GOLD_ID);
        assertTrue(bytes(goldUri).length > 29);
        assertEq(_substring(goldUri, 0, 29), "data:application/json;base64,");

        // Unique item URI
        vm.prank(minter);
        uint256 swordId = gastem.mintUnique(alice, "Dawnbreaker", "Sun blade", "ipfs://dawnbreaker");
        string memory swordUri = gastem.uri(swordId);
        assertTrue(bytes(swordUri).length > 29);
        assertEq(_substring(swordUri, 0, 29), "data:application/json;base64,");

        // Querying non-existent item reverts
        vm.expectRevert(abi.encodeWithSelector(Gastem.ItemDoesNotExist.selector, 999));
        gastem.uri(999);
    }

    function _substring(string memory str, uint256 startIndex, uint256 endIndex) internal pure returns (string memory) {
        bytes memory strBytes = bytes(str);
        bytes memory result = new bytes(endIndex - startIndex);
        for (uint256 i = startIndex; i < endIndex; i++) {
            result[i - startIndex] = strBytes[i];
        }
        return string(result);
    }
}
