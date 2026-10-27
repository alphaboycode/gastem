import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const deploymentPath = path.resolve(__dirname, "../../contracts/deployments/968.json");
const configPath = path.resolve(__dirname, "../src/config.ts");

if (!fs.existsSync(deploymentPath)) {
  console.error(`Deployment file not found at ${deploymentPath}. Please deploy contract first.`);
  process.exit(1);
}

if (!fs.existsSync(configPath)) {
  console.error(`Config file not found at ${configPath}.`);
  process.exit(1);
}

try {
  const deploymentRaw = fs.readFileSync(deploymentPath, "utf-8");
  const deployment = JSON.parse(deploymentRaw);

  if (!deployment.address) {
    console.error("Field 'address' missing in deployment JSON.");
    process.exit(1);
  }

  const configContent = fs.readFileSync(configPath, "utf-8");
  const addressRegex = /contractAddress:\s*"0x[a-fA-F0-9]{40}"/;

  if (!addressRegex.test(configContent)) {
    console.error("Could not find contractAddress line in web/src/config.ts");
    process.exit(1);
  }

  const updatedConfig = configContent.replace(
    addressRegex,
    `contractAddress: "${deployment.address}"`
  );

  fs.writeFileSync(configPath, updatedConfig, "utf-8");
  console.log(`Successfully updated contractAddress to ${deployment.address} in ${configPath}`);
} catch (error) {
  console.error("Failed to sync config:", error);
  process.exit(1);
}
