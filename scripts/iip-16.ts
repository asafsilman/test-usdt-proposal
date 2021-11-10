import { task } from "hardhat/config"
// import { FormatTypes, FunctionFragment, hexDataSlice } from "ethers/lib/utils";
const ProxyAdminABI = require("../abi/ProxyAdmin.json")
const addresses = require("../common/addresses")
const OracleABI = require("../abi/PriceOracleV3.json")

const iipDescription = "Upgrade PriceOracle to support new compSupplySpeeds";
export default task("iip-16", "Upgrade PriceOracle")
  .setAction(async(_, hre) => {

  const isLocalNet = hre.network.name == 'hardhat';
  const proxyAddr = addresses.priceOracleV3.live;
  const newImplementationAddress = "0x886b102953ab3eaf719df7b80b03cd5203c201f1";
  console.log({ proxyAddr })

  if (!newImplementationAddress || !proxyAddr) {
    throw 'Implementation and proxyAddr address must be set';
  }

  const proxyAdmin = await hre.ethers.getContractAt(ProxyAdminABI, addresses.proxyAdmin);
  let proposalBuilder = hre.proposals.builders.alpha();

  proposalBuilder = proposalBuilder.addContractAction(proxyAdmin, "upgrade", [
    proxyAddr,
    newImplementationAddress,
  ]);

  // Proposal
  proposalBuilder.setDescription(iipDescription);
  const proposal = proposalBuilder.build()
  await proposal.printProposalInfo();

  await hre.run('execute-proposal-or-simulate', {proposal, isLocalNet});

  // Skip tests in mainnet
  if (!isLocalNet) {
    return;
  }

  console.log("Testing...");

  // Test that the oracle returns the correct value for the new compSupplySpeed
  const oracle = await hre.ethers.getContractAt(OracleABI, proxyAddr);

  const checkCompApr = async (cToken: any, token: any) => {
    // Check that Comp Apr is >= 0
    const compApr = await oracle.getCompApr(cToken, token);
    if (compApr.lte(0)) {
      throw `compApr for ${token} is less than 0`;
    } else {
      console.log(`✅ compApr for ${token} is ${compApr}`);
    }
  };

  await checkCompApr(addresses.cDAI.live, addresses.DAI.live);
  await checkCompApr(addresses.cUSDC.live, addresses.USDC.live);
  await checkCompApr(addresses.cUSDT.live, addresses.USDT.live);
  await checkCompApr(addresses.cWBTCV2.live, addresses.WBTC.live);
  await checkCompApr(addresses.cWETH.live, addresses.WETH.live);
});
