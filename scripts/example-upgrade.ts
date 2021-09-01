import { BigNumber } from "ethers";
import { task } from "hardhat/config"
import { LedgerSigner } from "@ethersproject/hardware-wallets";
import {SafeEthersSigner, SafeService} from "@gnosis.pm/safe-ethers-adapters"

const addresses = require("../common/addresses")

const ERC20_ABI = require("../abi/ERC20.json")
const toBN = function(v: any): BigNumber { return BigNumber.from(v.toString()) };

export default task("example-upgrade", "Example using the iip-upgrade task", async(_, hre) => {
  const isLocalNet = hre.network.name == 'hardhat';
  if (!isLocalNet) {
    throw("THIS TASK IS ONLY RUNNABLE AS A TEST IN LOCAL");
  }

  const idleTokens = addresses.allIdleTokensBest;
  const idleDAI = await hre.ethers.getContractAt("IdleTokenGovernance", addresses.idleRAIV4);
  const IdleTokenGovernance = await hre.ethers.getContractFactory("IdleTokenGovernance");
  const implementation = await IdleTokenGovernance.deploy();
  console.log("implementation deployed at", implementation.address);

  // upgrade
  const proposal1 = await hre.run("iip-upgrade", {
    description: "test upgrade 1",
    implementation: implementation.address,
    initMethod: "",
    initSig: "",
    execute: true,
  });

  for (let i = 0; i < idleTokens.length; i++) {
    const idleToken = await hre.ethers.getContractAt(ERC20_ABI, idleTokens[i])
    const result = await idleDAI.testInitCalled();
    console.log(`📝 Testing ${await idleToken.name()}`);
    if (result == false) {
      console.log(`✅ testInitCalled exists and returned false`);
    } else {
      console.log(`🚨🚨 ERROR!!! testInitCalled exists but didn't return false`)
    }
  }

  // upgradeAndCall
  const implementation2 = await IdleTokenGovernance.deploy();
  console.log("implementation2 deployed at", implementation2.address);
  const proposal = await hre.run("iip-upgrade", {
    description: "test upgrade 2",
    implementation: implementation2.address,
    initMethod: "testInit",
    initSig: "testInit()",
    execute: true,
    fullSimulation: true,
  });

  for (let i = 0; i < idleTokens.length; i++) {
    const idleToken = await hre.ethers.getContractAt(ERC20_ABI, idleTokens[i])
    const result = await idleDAI.testInitCalled();
    console.log(`📝 Testing ${await idleToken.name()}`);
    if (result == true) {
      console.log(`✅ testInitCalled exists and returned true`);
    } else {
      console.log(`🚨🚨 ERROR!!! testInitCalled exists but didn't return true`)
    }
  }
});
