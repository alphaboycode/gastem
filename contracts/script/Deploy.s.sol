// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/Gastem.sol";

/**
 * @title DeployScript
 * @notice Foundry deployment script for Gastem on Botchain Testnet (Chain ID 968).
 *         Uses vm.startBroadcast() without hardcoded private keys or passwords.
 *         Outputs deployed contract address to deployments/968.json.
 */
contract DeployScript is Script {
    function run() external returns (Gastem gastem) {
        vm.startBroadcast();

        gastem = new Gastem();

        vm.stopBroadcast();

        string memory deploymentData = string.concat(
            '{\n  "address": "',
            vm.toString(address(gastem)),
            '"\n}\n'
        );

        // Writes the deployed address to deployments/968.json
        vm.writeFile("deployments/968.json", deploymentData);
    }
}
