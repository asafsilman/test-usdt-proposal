import { task } from "hardhat/config"
import { BigNumber } from "ethers";
import { AlphaProposalBuilder } from "@idle-finance/hardhat-proposals-plugin/dist/src/proposals/compound-alpha";

const addresses = require("../common/addresses")
const ERC20_ABI = require("../abi/ERC20.json");
const DISTRIBUTOR_ABI = require("../abi/Distributor.json");

const toBN = function (v: any): BigNumber { return BigNumber.from(v.toString()) };
const ONE = toBN(1e18);
const check = (condition: boolean, message: string) => {
  if (condition) {
    console.log(`✅ Correct ${message}`);
  } else {
    console.log(`🚨 Incorrect ${message}`);
  }
};

const iipDescription = "IIP-21: Set Gauges rate to 990 IDLE / day for 6 months";

export default task("iip-21", iipDescription)
.setAction(async (_, hre) => {
    const toEth = (val: any) => hre.ethers.utils.formatEther(val);
    const isLocalNet = hre.network.name == 'hardhat';

    // 0.0114583333 per second -> 990/day
    const newDistributorRate = toBN('11458333300000000');

    const distributor = await hre.ethers.getContractAt(DISTRIBUTOR_ABI, addresses.gaugeDistributor);
    const idleToken = await hre.ethers.getContractAt(ERC20_ABI, addresses.IDLE); // idle token    
    // Get balances for tests
    const gaugeIdleBalanceBefore = await idleToken.balanceOf(addresses.gaugeDistributor);
    const rate = await distributor.rate();
    
    let proposalBuilder = hre.proposals.builders.alpha();
    proposalBuilder = proposalBuilder
    .addContractAction(distributor, "setPendingRate", [newDistributorRate])
    
    // Print and execute proposal
    proposalBuilder.setDescription(iipDescription);
    const proposal = proposalBuilder.build()
    await proposal.printProposalInfo();
    await hre.run('execute-proposal-or-simulate', { proposal, isLocalNet });
    
    // Skip tests in mainnet
    if (!isLocalNet) {
      return;
    }
    console.log("Checking effects...");
    // mine 4 days in seconds (considering blocknumber 14526488 for fork, ie 5/4/2022),
    // 4 days in seconds = 4 * 86400 = 345600
    // cutoff for rate change is on Fridays at around 10:00 UTC
    await hre.ethers.provider.send("evm_increaseTime", [Number(345600)]);
    await hre.network.provider.send("hardhat_mine", []);
  
    // Trigget update of distributor
    await distributor.updateDistributionParameters();
    
    // Check that Distributor rate changed 
    const newRate = await distributor.rate();
    check(newRate.eq(newDistributorRate),
      `Distributor rate changed from ${toEth(rate)} to ${toEth(newRate)}`);
  });