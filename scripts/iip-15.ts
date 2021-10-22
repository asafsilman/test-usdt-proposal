import { task } from "hardhat/config"
import { LedgerSigner } from "@ethersproject/hardware-wallets";
import {SafeEthersSigner, SafeService} from "@gnosis.pm/safe-ethers-adapters"
import { BigNumber } from "ethers";

const addresses = require("../common/addresses")
const IDLE_TOKEN_ABI = require("../abi/IdleTokenGovernance.json")
const GOVERNABLE_FUND = require("../abi/GovernableFund.json");
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

  // Call `setAllAvailableTokensAndWrappers` in each IdleToken
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
