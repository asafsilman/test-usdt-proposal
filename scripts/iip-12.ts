import { BigNumber } from "ethers";
import { task } from "hardhat/config"
import { LedgerSigner } from "@ethersproject/hardware-wallets";
import {SafeEthersSigner, SafeService} from "@gnosis.pm/safe-ethers-adapters"

const addresses = require("../common/addresses")
const IDLE_TOKEN_ABI = require("../abi/IdleTokenGovernance.json")
const IDLE_CONTROLLER_ABI = require("../abi/IdleController.json")
const PRICE_ORACLE_ABI = require("../abi/PriceOracleV2.json")
const FEE_COLLECTOR_ABI = require("../abi/FeeCollector.json")

const ERC20_ABI = require("../abi/ERC20.json")
const toBN = function(v: any): BigNumber { return BigNumber.from(v.toString()) };

export default task("iip-12", "Deploy IIP 11 to Disable AAVE v1", async(_, hre) => {
  let proposalBuilder = hre.proposals.builders.alpha();

  const idleRAI = await hre.ethers.getContractAt(IDLE_TOKEN_ABI, addresses.idleRAIV4);
  const currentProtocolTokens = [...(await idleRAI.getAPRs())["0"]].map(x => x.toLowerCase())

  const protocolTokens = [];
  const wrappers = [];
  const govTokens = (await idleRAI.getGovTokens()).map((a: string) => a);
  const govTokensEqualLength = [];

  for (var i = 0; i < currentProtocolTokens.length; i++) {
    const token = currentProtocolTokens[i];
    const wrapper = await idleRAI.protocolWrappers(token);
    const govToken = await idleRAI.getProtocolTokenToGov(token);

    protocolTokens.push(token);
    wrappers.push(wrapper);
    govTokensEqualLength.push(govToken)
  }

  govTokens.push(addresses.IDLE);

  console.log("protocolTokens", protocolTokens);
  console.log("wrappers", wrappers);
  console.log("govTokens", govTokens);
  console.log("govTokensEqualLength", govTokensEqualLength);

  proposalBuilder = proposalBuilder.addContractAction(idleRAI, "setAllAvailableTokensAndWrappers", [
    protocolTokens,      // protocolTokens
    wrappers,            // wrappers
    govTokens,           // _newGovTokens
    govTokensEqualLength // _newGovTokensEqualLen
  ]);


  const idleController = await hre.ethers.getContractAt(IDLE_CONTROLLER_ABI, addresses.idleController);
  const idleRAISpeedBefore = await idleController.idleSpeeds(addresses.idleRAIV4);
  proposalBuilder = proposalBuilder.addContractAction(idleController, "_supportMarkets", [[idleRAI.address]]);
  proposalBuilder = proposalBuilder.addContractAction(idleController, "_addIdleMarkets", [[idleRAI.address]]);

  const priceOracle = await hre.ethers.getContractAt(PRICE_ORACLE_ABI, addresses.priceOracleV2.live);
  const raiEthPriceFeed = "0x4ad7B025127e89263242aB68F0f9c4E5C033B489";
  proposalBuilder = proposalBuilder.addContractAction(priceOracle, "updateFeedETH", [addresses.RAI.live, raiEthPriceFeed]);

  const feeCollector = await hre.ethers.getContractAt(FEE_COLLECTOR_ABI, addresses.feeCollector)
  proposalBuilder.addContractAction(feeCollector, "registerTokenToDepositList", [addresses.RAI.live])

  proposalBuilder.setDescription("IIP-12 TODO");
  const proposal = proposalBuilder.build()
  await proposal.printProposalInfo();
  await proposal.simulate();
  console.log("Proposal simulated");

  const isLocalNet = hre.network.name == 'hardhat';
  if (!isLocalNet) {
    console.log("DONE");
    return;
  }

  console.log("Testing...");

  // RAI price from PriceOracleV2
  const raiPriceInETH = await priceOracle.getPriceETH(addresses.RAI.live);
  const raiPriceInUSDC = await priceOracle.getPriceToken(addresses.RAI.live, addresses.USDC.live);
  console.log("raiPriceInETH", raiPriceInETH.toString());
  console.log("raiPriceInUSDC", raiPriceInUSDC.toString());
  if (!raiPriceInETH.gt(toBN("0"))) {
    console.log("🚨🚨 ERROR!!! raiPriceInETH is 0");
  } else {
    console.log("✅ raiPriceInETH is > 0")
  }

  if (!raiPriceInUSDC.gt(toBN("0"))) {
    console.log("🚨🚨 ERROR!!! raiPriceInUSDC is 0");
  } else {
    console.log("✅ raiPriceInUSDC is > 0")
  }

  // IdleRAI speed
  if (idleRAISpeedBefore.gt(toBN("0"))) {
    console.log("🚨🚨 ERROR!!! IdleRAI speed before proposal was already > 0");
  }
  const idleRAISpeedAfter = await idleController.idleSpeeds(addresses.idleRAIV4);
  console.log("idleRAISpeedBefore", idleRAISpeedBefore.toString());
  console.log("idleRAISpeedAfter", idleRAISpeedAfter.toString());

  if (!idleRAISpeedAfter.gt(toBN("0"))) {
    console.log("🚨🚨 ERROR!!! IdleRAI speed after proposal didn't increase");
  } else {
    console.log("✅ Verified that IdleRAI speed increased after proposal")
  }

  // RAI added as deposit tokens in Fee Collector
  const despositTokens = (await feeCollector.getDepositTokens()).map((a: string) => a.toLowerCase());
  if (despositTokens.includes(addresses.RAI.live.toLowerCase())) {
    console.log("✅ Verified that RAI is enabled in feeCollector")
  } else {
    console.log("🚨🚨 ERROR!!! Fee collector did not enable RAIs")
  }

  const allocationsSpread = currentProtocolTokens.map(() => parseInt((100000 / currentProtocolTokens.length).toFixed(0)))
  const diff = 100000 - allocationsSpread.reduce((p, c) => p + c); // check for rounding errors
  allocationsSpread[0] = allocationsSpread[0] + diff;
  console.log('allocationsSpread', allocationsSpread.map(a => a.toString()))
  // await hre.run("test-idle-token", {idleToken: idleRAI, allocations: allocationsSpread, unlent: 0, whale: ''})
});
