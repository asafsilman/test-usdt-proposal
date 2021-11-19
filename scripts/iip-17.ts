import { task } from "hardhat/config"
// import { FormatTypes, FunctionFragment, hexDataSlice } from "ethers/lib/utils";
const addresses = require("../common/addresses")
const IDLE_TOKEN_ABI = require("../abi/IdleTokenGovernance.json")
import { BigNumber } from "ethers";
const toBN = function(v: any): BigNumber { return BigNumber.from(v.toString()) };
const ProxyAdminABI = require("../abi/ProxyAdmin.json")

const iipDescription = "IIP-17: Upgrade IdleTokenGovernance implementation to remove flash \n";
export default task("iip-17", "Upgrade IdleTokenGovernance")
  .setAction(async(_, hre) => {

  const isLocalNet = hre.network.name == 'hardhat';
  const newImplementationAddress = addresses.lastIdleTokenImplementation;
  const idleTokens = addresses.allIdleTokensBest;

  if (!newImplementationAddress) {
    throw 'Implementation address must be set';
  }

  console.log('New implementation: ', newImplementationAddress);

  const currGovTokens = [];
  for (let i = 0; i < idleTokens.length; i++) {
    const idleToken = await hre.ethers.getContractAt(IDLE_TOKEN_ABI, idleTokens[i]);
    currGovTokens.push(await idleToken.getGovTokens());
  }

  let proposalBuilder = hre.proposals.builders.alpha();
  // Change old proxyAdmin for idleFEI
  const proxyAdminFei = "0x9618eDC1b2ceDC6975CA44E2AD78BF8dd73917F3";
  const proxyAdmin = await hre.ethers.getContractAt(ProxyAdminABI, proxyAdminFei);
  proposalBuilder = proposalBuilder.addContractAction(proxyAdmin, "changeProxyAdmin", [
    addresses.idleFEIV4,
    addresses.proxyAdmin,
  ]);

  // upgrade all IdleTokens best
  await hre.run("iip-upgrade", {
    description: iipDescription,
    implementation: newImplementationAddress,
    execute: true,
    proposalBuilder
  });

  // Skip tests in mainnet
  if (!isLocalNet) {
    return;
  }

  console.log("Testing...");

  // Test that IdleTokenGovernance returns fale for flash loans
  for (let i = 0; i < idleTokens.length; i++) {
    const idleToken = await hre.ethers.getContractAt(IDLE_TOKEN_ABI, idleTokens[i])
    console.log(`📝 Testing ${await idleToken.name()}`);
    console.log('unpausing')

    await hre.network.provider.send("hardhat_impersonateAccount", [addresses.idleMultisig])
    let multiSigner = await hre.ethers.getSigner(addresses.idleMultisig)
    await hre.network.provider.send("hardhat_setBalance", [addresses.idleMultisig, "0xffffffffffffffff"])
    await idleToken.connect(multiSigner).unpause();
    const res = await idleToken.callStatic.flashLoan(addresses.randomAddr, addresses.randomAddr, toBN('0'), '0x');

    if (!res) {
      console.log(`✅ contract updated correctly, res is false`, res);
    } else {
      console.log(`🚨🚨 ERROR!!! implementation is wrong`)
    }

    // Test rebalances
    // Spread funds between all protocols
    let currentProtocolTokens = [...(await idleToken.getAPRs())["0"]].map(x=>x.toLowerCase())
    const allocationsSpread = currentProtocolTokens.map(() => parseInt((100000 / currentProtocolTokens.length).toFixed(0)))
    const diff = 100000 - allocationsSpread.reduce((p, c) => p + c); // check for rounding errors
    allocationsSpread[0] = allocationsSpread[0] + diff;
    console.log('allocationsSpread', allocationsSpread.map(a => a.toString()))
    await hre.run("test-idle-token", {
      idleToken,
      allocations: allocationsSpread,
      unlent: 0,
      whale: '',
      govTokens: currGovTokens[i]
    })
  }
});
