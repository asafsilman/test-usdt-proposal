import { task } from "hardhat/config"
import { LedgerSigner } from "@ethersproject/hardware-wallets";
import {SafeEthersSigner, SafeService} from "@gnosis.pm/safe-ethers-adapters"
import { BigNumber } from "ethers";

const addresses = require("../common/addresses")
const IDLE_TOKEN_ABI = require("../abi/IdleTokenGovernance.json")
const GOVERNABLE_FUND = require("../abi/GovernableFund.json");
const IDLE_CONTROLLER_ABI = require("../abi/IdleController.json")
const ERC20_ABI = require("../abi/ERC20.json")
const toBN = function(v: any): BigNumber { return BigNumber.from(v.toString()) };

const iipDescription = "IIP-15: Remove DyDx as lending provider \n";
export default task("iip-15", iipDescription, async(_, hre) => {
  const isLocalNet = hre.network.name == 'hardhat';
  const idleTokens = [
    {address: addresses.idleDAIV4, yxToken: addresses.yxDAI.live},
    {address: addresses.idleUSDCV4, yxToken: addresses.yxUSDC.live}
  ];

  let proposalBuilder = hre.proposals.builders.alpha();

  // Call `setAllAvailableTokensAndWrappers` in each IdleToken to remove DyDx, 2 actions
  for (let tokenIndex = 0; tokenIndex < idleTokens.length; tokenIndex++) {
    const idleToken = await hre.ethers.getContractAt(IDLE_TOKEN_ABI, idleTokens[tokenIndex].address);
    const idleTokenName = await idleToken.name();
    console.log(`📄 adding proposal action for ${idleTokenName}`);

    const allGovTokens = await idleToken.getGovTokens();
    console.log('All gov tokens', allGovTokens);

    const isIDLEDistributed = allGovTokens.reduce(
      (prev: string, curr: string) => curr.toLowerCase() === addresses.IDLE.toLowerCase() || prev,
      false
    );

    console.log('isIDLEDistributed', isIDLEDistributed);
    let currentProtocolTokens = [...(await idleToken.getAPRs())["0"]].map(x=>x.toLowerCase())
    let protocolTokens = []
    let wrappers = []
    let govTokensEqualLength = []
    let govTokens = [];

    let yxTokenIdx = currentProtocolTokens.indexOf(idleTokens[tokenIndex].yxToken.toLowerCase())
    if (yxTokenIdx < 0) {
      throw "COULD NOT FIND YXTOKEN";
    }

    if (isLocalNet) {
      console.log("local network, rebalancing...");
      await hre.network.provider.send("hardhat_setBalance", [addresses.timelock, "0xffffffffffffffff"]);
      await hre.network.provider.send("hardhat_impersonateAccount", [addresses.timelock]);
      const timelock = await hre.ethers.getSigner(addresses.timelock);
      await idleToken.connect(timelock).setAllocations([toBN("50000"), toBN("0"), toBN("50000")]);
      await idleToken.connect(timelock).rebalance();
    }

    const yxToken = await hre.ethers.getContractAt(ERC20_ABI, idleTokens[tokenIndex].yxToken);
    const bal = await yxToken.balanceOf(idleToken.address);
    if (bal.gt(toBN("10"))) {
      throw(`IdleFEI still has a balance in yxToken. Balance: ${bal.toString()}`);
    } else {
      console.log(`✅ Verified that IdleFEI has no yxToken balance. (${bal.toString()})`);
    }
    const currentAllocations = await idleToken.getAllocations();
    if(!currentAllocations[yxTokenIdx].eq(toBN("0"))) {
      throw("DYDX ALLOCATION MUST BE ZERO BEFORE RUNNING THIS PROPOSAL");
    }

    console.log(`Removing wrapper at index ${yxTokenIdx}`)

    for (var j = 0; j < currentProtocolTokens.length; j++) {
      const token = currentProtocolTokens[j];
      const wrapper = await idleToken.protocolWrappers(token);
      const govToken = await idleToken.getProtocolTokenToGov(token)

      if (j == yxTokenIdx) {
          console.log(`Removing wrapper @ ${wrapper} for token ${token}`)
          continue
      }
      if (govToken.toLowerCase() != addresses.addr0.toLowerCase()) {
        govTokens.push(govToken);
      }
      protocolTokens.push(token);
      wrappers.push(wrapper);
      govTokensEqualLength.push(govToken);
    };

    if (isIDLEDistributed) {
      govTokens.push(addresses.IDLE);
    }

    proposalBuilder = proposalBuilder.addContractAction(idleToken, "setAllAvailableTokensAndWrappers", [
      protocolTokens,
      wrappers,
      govTokens,
      govTokensEqualLength
    ])
  }

  // Add idleFEI to IDLE liquidity mining, 2 actions
  const idleController = await hre.ethers.getContractAt(IDLE_CONTROLLER_ABI, addresses.idleController);
  const idleFEISpeedBefore = await idleController.idleSpeeds(addresses.idleFEIV4);
  proposalBuilder = proposalBuilder.addContractAction(idleController, "_supportMarkets", [[addresses.idleFEIV4]]);
  proposalBuilder = proposalBuilder.addContractAction(idleController, "_addIdleMarkets", [[addresses.idleFEIV4]]);

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

  // IdleFEI controller speed
  if (idleFEISpeedBefore.gt(toBN("0"))) {
    console.log("🚨🚨 ERROR!!! IdleFEI speed before proposal was already > 0");
  }
  const idleFEISpeedAfter = await idleController.idleSpeeds(addresses.idleFEIV4);
  console.log("idleFEISpeedBefore", idleFEISpeedBefore.toString());
  console.log("idleFEISpeedAfter", idleFEISpeedAfter.toString());

  if (!idleFEISpeedAfter.gt(toBN("0"))) {
    console.log("🚨🚨 ERROR!!! IdleFEI speed after proposal didn't increase");
  } else {
    console.log("✅ Verified that IdleFEI speed increased after proposal");
  }

  const accounts = await hre.ethers.getSigners();
  for (let tokenIndex = 0; tokenIndex < idleTokens.length; tokenIndex++) {
    const idleToken = await hre.ethers.getContractAt(IDLE_TOKEN_ABI, idleTokens[tokenIndex].address);
    const idleTokenName = await idleToken.name();
    console.log(`Testing ${idleTokenName}...`)
    const currentProtocolTokens = [...(await idleToken.getAPRs())["0"]].map(x => x.toLowerCase())
    const allocationsSpread = currentProtocolTokens.map(() => parseInt((100000 / currentProtocolTokens.length).toFixed(0)))
    const diff = 100000 - allocationsSpread.reduce((p, c) => p + c); // check for rounding errors
    allocationsSpread[0] = allocationsSpread[0] + diff;
    console.log('allocationsSpread', allocationsSpread.map(a => a.toString()))
    await hre.run("test-idle-token", {
      idleToken: idleToken,
      account: accounts[tokenIndex],
      allocations: allocationsSpread,
      unlent: 0,
      whale: '',
      isSafe: false,
      govTokens: [addresses.COMP.live, addresses.stkAAVE.live, addresses.IDLE]
    })
  }
});
