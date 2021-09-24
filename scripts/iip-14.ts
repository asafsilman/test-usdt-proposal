import { task } from "hardhat/config"
import { LedgerSigner } from "@ethersproject/hardware-wallets";
import {SafeEthersSigner, SafeService} from "@gnosis.pm/safe-ethers-adapters"

const addresses = require("../common/addresses")
const IDLE_TOKEN_SAFE_ABI = require("../abi/IdleTokenGovernanceSafe.json")
const IDLE_CONTROLLER_ABI = require("../abi/IdleController.json")

const iipDescription = "Remove IDLE distribution from idleController for all Risk adjusted strategy tokens";
export default task("iip-14", iipDescription, async(_, hre) => {
  const isLocalNet = hre.network.name == 'hardhat';
  const idleTokens = addresses.allIdleTokensSafe;
  const idleController = await hre.ethers.getContractAt(IDLE_CONTROLLER_ABI, addresses.idleController);
  let proposalBuilder = hre.proposals.builders.alpha();

  // Call `_dropIdleMarket` in idleController for each idleTokenSafe
  for (let tokenIndex = 0; tokenIndex < idleTokens.length; tokenIndex++) {
    const idleToken = await hre.ethers.getContractAt(IDLE_TOKEN_SAFE_ABI, idleTokens[tokenIndex]);
    const idleTokenName = await idleToken.name();
    console.log(`📄 adding proposal action for ${idleTokenName}`);
    proposalBuilder = proposalBuilder.addContractAction(idleController, "_dropIdleMarket", [idleTokens[tokenIndex]]);
    console.log(`${idleTokenName} speed before`, (await idleController.idleSpeeds(idleTokens[tokenIndex])).toString());
  }

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

  for (let tokenIndex = 0; tokenIndex < idleTokens.length; tokenIndex++) {
    const idleToken = await hre.ethers.getContractAt(IDLE_TOKEN_SAFE_ABI, idleTokens[tokenIndex]);
    const idleTokenName = await idleToken.name();
    console.log(`Testing ${idleTokenName}...`)
    console.log(`${idleTokenName} speed after`, (await idleController.idleSpeeds(idleTokens[tokenIndex])).toString());
    const currentProtocolTokens = [...(await idleToken.getAPRs())["0"]].map(x => x.toLowerCase())
    const allocationsSpread = currentProtocolTokens.map(() => parseInt((100000 / currentProtocolTokens.length).toFixed(0)))
    const diff = 100000 - allocationsSpread.reduce((p, c) => p + c); // check for rounding errors
    allocationsSpread[0] = allocationsSpread[0] + diff;
    console.log('allocationsSpread', allocationsSpread.map(a => a.toString()))
    await hre.run("test-idle-token", {
      idleToken: idleToken,
      allocations: allocationsSpread,
      unlent: 0,
      whale: '',
      isSafe: true,
      govTokens: [addresses.COMP.live]
    })
  }
});
