import { BigNumber } from "ethers";
import { task } from "hardhat/config"
import { LedgerSigner } from "@ethersproject/hardware-wallets";
import {SafeEthersSigner, SafeService} from "@gnosis.pm/safe-ethers-adapters"

const addresses = require("../common/addresses")
const IDLE_TOKEN_ABI = require("../abi/IdleTokenGovernance.json")
const IDLE_TOKEN_SAFE_ABI = require("../abi/IdleTokenGovernanceSafe.json")
const IDLE_CONTROLLER_ABI = require("../abi/IdleController.json")
const PRICE_ORACLE_ABI = require("../abi/PriceOracleV2.json")
const FEE_COLLECTOR_ABI = require("../abi/FeeCollector.json")
const GOVERNABLE_FUND = require("../abi/GovernableFund.json");

const ERC20_ABI = require("../abi/ERC20.json")
const toBN = function(v: any): BigNumber { return BigNumber.from(v.toString()) };

const iipDescription = "IIP-14 Remove IDLE gov token from safe Idle tokens";
export default task("iip-14", iipDescription, async(_, hre) => {
  const isLocalNet = hre.network.name == 'hardhat';

  let proposalBuilder = hre.proposals.builders.alpha();

  for (let tokenIndex = 0; tokenIndex < addresses.allIdleTokensSafe.length; tokenIndex++) {
    const idleToken = await hre.ethers.getContractAt(IDLE_TOKEN_SAFE_ABI, addresses.allIdleTokensSafe[tokenIndex]);
    const idleTokenName = await idleToken.name();
    console.log(`📄 adding proposal action for ${idleTokenName}`);
    const currentProtocolTokens = [...(await idleToken.getAPRs())["0"]].map(x => x.toLowerCase())
    const newGovTokens = new Array(currentProtocolTokens.length).fill(addresses.addr0);
    for (let i = 0; i < currentProtocolTokens.length; i++) {
      const address = currentProtocolTokens[i].toLowerCase();
      if (address == addresses.cDAI.live.toLowerCase() || address == addresses.cUSDC.live.toLowerCase()) {
        newGovTokens[i] = addresses.COMP.live;
      }
    }
    proposalBuilder = proposalBuilder.addContractAction(idleToken, "setGovTokens", [
      newGovTokens, // _newGovTokens
      currentProtocolTokens, // _protocolTokens
    ]);
  }

  // Proposal
  proposalBuilder.setDescription(iipDescription);
  const proposal = proposalBuilder.build()
  await proposal.printProposalInfo();

  if (isLocalNet) {
    console.log("Simulating proposal")
    const WHALE_ADDRESS = addresses.devLeagueMultisig;
    await hre.network.provider.send("hardhat_impersonateAccount", [WHALE_ADDRESS]);
    let signer = await hre.ethers.getSigner(WHALE_ADDRESS);
    await hre.network.provider.send("hardhat_setBalance", [WHALE_ADDRESS, "0xffffffffffffffff"]);
    proposal.setProposer(signer);
    // To run full simulation, set the flag for simulate to `true`
    await proposal.simulate();
    console.log("Proposal simulated :)");
    console.log();
  } else {
    console.log('Posting proposal on-chain with Dev League Multisig');
    const ledgerSigner = new LedgerSigner(hre.ethers.provider, undefined, "m/44'/60'/0'/0/0");
    const service = new SafeService('https://safe-transaction.gnosis.io/');
    const signer = await SafeEthersSigner.create(addresses.devLeagueMultisig, ledgerSigner, service, hre.ethers.provider);
    proposal.setProposer(signer);
    await proposal.propose();
    console.log("Proposal is live");
  }

  // Skip tests in mainnet
  if (!isLocalNet) {
    return;
  }

  console.log("Testing...");
  for (let tokenIndex = 0; tokenIndex < addresses.allIdleTokensSafe.length; tokenIndex++) {
    const idleToken = await hre.ethers.getContractAt(IDLE_TOKEN_SAFE_ABI, addresses.allIdleTokensSafe[tokenIndex]);
    const idleTokenName = await idleToken.name();
    const govToken = await idleToken.govTokens(0);
    // console.log("***", govToken)
    if (govToken.toLowerCase() == addresses.COMP.live.toLowerCase()) {
      console.log(`✅ ${idleTokenName} govToken 0 is COMP`)
    } else {
      console.log(`🚨🚨 ${idleTokenName} govToken 0 is NOT COMP`)
    }
  }
});
