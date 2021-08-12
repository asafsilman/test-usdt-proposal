import { BigNumber } from "ethers";
import { task } from "hardhat/config"
import { LedgerSigner } from "@ethersproject/hardware-wallets";
import {SafeEthersSigner, SafeService} from "@gnosis.pm/safe-ethers-adapters"

const addresses = require("./addresses")
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
  proposalBuilder = proposalBuilder.addContractAction(idleController, "_supportMarkets", [[idleRAI.address]]);
  proposalBuilder = proposalBuilder.addContractAction(idleController, "_addIdleMarkets", [[idleRAI.address]]);

  const priceOracle = await hre.ethers.getContractAt(PRICE_ORACLE_ABI, addresses.priceOracleV2.live);
  const raiEthPriceFeed = "0x4ad7B025127e89263242aB68F0f9c4E5C033B489";
  proposalBuilder = proposalBuilder.addContractAction(priceOracle, "updateFeedETH", [idleRAI.address, raiEthPriceFeed]);

  const feeCollector = await hre.ethers.getContractAt(FEE_COLLECTOR_ABI, addresses.feeCollector)
  proposalBuilder.addContractAction(feeCollector, "registerTokenToDepositList", [addresses.RAI.live])

  proposalBuilder.setDescription("IIP-12 TODO");
  const proposal = proposalBuilder.build()
  await proposal.printProposalInfo();
  await proposal.simulate();
  console.log("DONE");
});
