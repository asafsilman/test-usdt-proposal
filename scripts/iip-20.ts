import { task } from "hardhat/config"
import { BigNumber } from "ethers";
import { AlphaProposalBuilder } from "@idle-finance/hardhat-proposals-plugin/dist/src/proposals/compound-alpha";

const addresses = require("../common/addresses")
const ERC20_ABI = require("../abi/ERC20.json");
const IdleControllerAbi = require("../abi/IdleController.json");
const UnitrollerAbi = require("../abi/Unitroller.json");
const FeeCollectorABI = require("../abi/FeeCollector.json")
const GovernableFundABI = require("../abi/GovernableFund.json");
const GovernorBravoDelegateABI = require("../abi/GovernorBravoDelegate.json");

const toBN = function (v: any): BigNumber { return BigNumber.from(v.toString()) };
const ONE = toBN(1e18);
const check = (condition: boolean, message: string) => {
  if (condition) {
    console.log(`✅ Correct ${message}`);
  } else {
    console.log(`🚨 Incorrect ${message}`);
  }
};

const iipDescription = "IIP-20: Activate Idle Gauges, Transfer 50k IDLE from ecosystem fund for Uniswap v3";

export default task("iip-20", iipDescription)
  .setAction(async (_, hre) => {
    const isLocalNet = hre.network.name == 'hardhat';

    const idleAmountToTransfer = toBN(50000).mul(ONE);
    const idleFromController = toBN(178200).mul(ONE);
    // 0.3875 per block (considering 8 months left)
    const newIdleControllerRate = toBN('387500000000000000');
    
    const ecosystemFund = await hre.ethers.getContractAt(GovernableFundABI, addresses.ecosystemFund);
    const idleController = await hre.ethers.getContractAt(IdleControllerAbi, addresses.idleController);
    const idleToken = await hre.ethers.getContractAt(ERC20_ABI, addresses.IDLE); // idle token    
    // Get balances for tests
    const treasuryIdleBalanceBefore = await idleToken.balanceOf(addresses.treasuryMultisig);
    const gaugeIdleBalanceBefore = await idleToken.balanceOf(addresses.gaugeDistributor);
    const daiSpeed = await idleController.idleSpeeds(addresses.allIdleTokensBest[0]);

    let proposalBuilder = hre.proposals.builders.alpha();
    proposalBuilder = proposalBuilder
      .addContractAction(ecosystemFund, "transfer", [addresses.IDLE, addresses.treasuryMultisig, idleAmountToTransfer])
      .addContractAction(idleController, "_withdrawToken", [addresses.IDLE, addresses.gaugeDistributor, idleFromController])
      .addContractAction(idleController, "_setIdleRate", [newIdleControllerRate])

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
    
    // Check that balance is changed on treasury multisig 
    const treasuryIdleBalanceAfter = await idleToken.balanceOf(addresses.treasuryMultisig);
    const treasuryIdleBalanceIncrease = treasuryIdleBalanceAfter.sub(treasuryIdleBalanceBefore);
    check(treasuryIdleBalanceIncrease.eq(idleAmountToTransfer), 
      `Treasury balance ${hre.ethers.utils.formatEther(treasuryIdleBalanceBefore)} -> ${hre.ethers.utils.formatEther(treasuryIdleBalanceAfter)} (+ ${hre.ethers.utils.formatEther(treasuryIdleBalanceIncrease)})`);
    
    // Check that balance is changed on gauge Distributor 
    const gaugeIdleBalanceAfter = await idleToken.balanceOf(addresses.gaugeDistributor);
    const distributorIdleBalanceIncrease = gaugeIdleBalanceAfter.sub(gaugeIdleBalanceBefore);
    check(distributorIdleBalanceIncrease.eq(idleFromController),
      `Distributor balance ${hre.ethers.utils.formatEther(gaugeIdleBalanceBefore)} -> ${hre.ethers.utils.formatEther(gaugeIdleBalanceAfter)} (+ ${hre.ethers.utils.formatEther(distributorIdleBalanceIncrease)})`);

    // check that idleController rate is changed
    const idleControllerRate = await idleController.idleRate();
    check(idleControllerRate.eq(newIdleControllerRate),
      `IdleController rate changed ${idleControllerRate}`);
    
    const idleDAI = addresses.allIdleTokensBest[0];
    // Check that speed changed for idle tokens
    const daiSpeedAfter = await idleController.idleSpeeds(idleDAI);
    check(!daiSpeedAfter.eq(daiSpeed),
      `IdleController speed changed for dai ${daiSpeed} -> ${daiSpeedAfter}`);

    // Check that claimIdle is still working for dai
    const balBefore = await idleToken.balanceOf(idleDAI);
    await idleController.claimIdle([], [idleDAI]);
    const balAfter = await idleToken.balanceOf(idleDAI);
    // balance should increase
    check(balAfter.gt(balBefore),
      `IDLE after claimIdle increased ${balBefore} -> ${balAfter}`);

    // mine 8 months of blocks (considering blocknumber 14474950 for fork), 
    // ie 8 * 30 * 6400 = 1536000 blocks (in hex is 0x177000)
    await hre.network.provider.send("hardhat_mine", ["0x177000"]);
    // last claimIdle should be executed
    const daiBal = await idleToken.balanceOf(idleDAI);
    await idleController.claimIdle([], [idleDAI]);
    const daiBal2 = await idleToken.balanceOf(idleDAI);
    // balance should increase
    check(daiBal2.gt(daiBal),
      `IDLE after claimIdle increased ${daiBal} -> ${daiBal2}`);

    // mine 1 more month of blocks, ie 30 * 6400 = 192000 blocks (0x1646592)
    await hre.network.provider.send("hardhat_mine", ["0x1646592"]);
    // This claim should give 0 IDLE
    const daiBalBefore = await idleToken.balanceOf(idleDAI);
    await idleController.claimIdle([], [idleDAI]);
    const daiBalAfter = await idleToken.balanceOf(idleDAI);
    check(daiBalAfter.eq(daiBalBefore),
      `IDLE after claimIdle equal ${daiBalBefore} -> ${daiBalAfter}`);
  });