import { ethers } from "hardhat";
import * as fs from "fs/promises";
import * as path from "path";

async function main() {
  const [deployer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();
  console.log("Deploying contracts with the account:", deployer.address);

  // Deploy IntentRegistry
  const IntentRegistry = await ethers.getContractFactory("IntentRegistry");
  const intentRegistry = await IntentRegistry.deploy();
  await intentRegistry.waitForDeployment();
  const intentRegistryAddress = await intentRegistry.getAddress();
  console.log("IntentRegistry deployed to:", intentRegistryAddress);

  // Deploy AdEscrow
  // USDC on Base Sepolia: 0x036CbD53842c5426634e7929541eC2318f3dCF7e
  const usdcAddress = process.env.USDC_CONTRACT_ADDRESS || "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
  const feeRecipient = deployer.address;
  const AdEscrow = await ethers.getContractFactory("AdEscrow");
  const adEscrow = await AdEscrow.deploy(usdcAddress, feeRecipient);
  await adEscrow.waitForDeployment();
  const adEscrowAddress = await adEscrow.getAddress();
  console.log("AdEscrow deployed to:", adEscrowAddress);

  const deployment = {
    network: network.name,
    chainId: network.chainId.toString(),
    deployer: deployer.address,
    intentRegistry: intentRegistryAddress,
    adEscrow: adEscrowAddress,
    usdc: usdcAddress,
    deployedAt: new Date().toISOString(),
  };

  const outDir = path.resolve("cache");
  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(path.join(outDir, `deployment-${network.chainId}.json`), JSON.stringify(deployment, null, 2), "utf-8");

  console.log("\nUpdate your .env file with these addresses!");
  console.log(`INTENT_REGISTRY_ADDRESS=${intentRegistryAddress}`);
  console.log(`AD_ESCROW_ADDRESS=${adEscrowAddress}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
