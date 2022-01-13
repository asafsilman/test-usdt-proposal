import { task } from "hardhat/config"
import { BigNumber } from "ethers";
import { AlphaProposalBuilder } from "@idle-finance/hardhat-proposals-plugin/dist/src/proposals/compound-alpha";

const addresses = require("../common/addresses")
const TimelockABI = require("../abi/Timelock.json");
const ERC20_ABI = require("../abi/ERC20.json")
const GovernableFundABI = require("../abi/GovernableFund.json");
const GovernorAlphaABI = require("../abi/GovernorAlpha.json");
const FeeCollectorABI = require("../abi/FeeCollector.json")
const GovernorBravoDelegateABI = require("../abi/GovernorBravoDelegate.json");
const IdleTokenGovernanceABI = require("../abi/IdleTokenGovernance.json");

const toBN = function (v: any): BigNumber { return BigNumber.from(v.toString()) };
const ONE = toBN(1e18);

const iipDescription = "IIP-18: Upgrade Idle Governor Alpha to Compound Governor Bravo";

export default task("iip-18", "Upgrade Governor Alpha")
    .setAction(async (_, hre) => {
        const isLocalNet = hre.network.name == 'hardhat';

        const governorBravoAddress = '0x3D5Fc645320be0A085A32885F078F7121e5E5375';

        const timelock = await hre.ethers.getContractAt(TimelockABI, addresses.timelock);
        const feeCollector = await hre.ethers.getContractAt(FeeCollectorABI, addresses.feeCollector);
        const feeTreasury = await hre.ethers.getContractAt(GovernableFundABI, addresses.feeTreasury);
        const ecosystemFund = await hre.ethers.getContractAt(GovernableFundABI, addresses.ecosystemFund);
        const bpoolToken = await hre.ethers.getContractAt(ERC20_ABI, '0x859e4d219e83204a2ea389dac11048cc880b6aa8'); // idle smart treasury balancer pool token

        let governorBravo = await hre.ethers.getContractAt(GovernorBravoDelegateABI, governorBravoAddress);
        let proposalBuilder = hre.proposals.builders.alpha();

        let feeCollectorBpoolBalance = await bpoolToken.balanceOf(addresses.feeCollector);
        let newAllocations = [toBN(0), toBN(20000), toBN(30000), toBN(50000)]

        const idleToken = await hre.ethers.getContractAt(ERC20_ABI, addresses.IDLE); // idle token
        const wethToken = await hre.ethers.getContractAt(ERC20_ABI, addresses.WETH['live']); // weth token
        const usdcToken = await hre.ethers.getContractAt(ERC20_ABI, addresses.USDC['live']); // usdc token

        const usdcBalanceFeeTreasury = usdcToken.balanceOf(addresses.feeTreasury);
        const wethBalanceFeeTreasury = wethToken.balanceOf(addresses.feeTreasury);
        const idleAmountToTransfer = toBN(48493).mul(ONE);

        proposalBuilder = proposalBuilder
            .addContractAction(feeTreasury, "transfer", [addresses.USDC['live'], addresses.treasuryMultisig, usdcBalanceFeeTreasury])
            .addContractAction(feeTreasury, "transfer", [addresses.WETH['live'], addresses.treasuryMultisig, wethBalanceFeeTreasury])
            .addContractAction(ecosystemFund, "transfer", [addresses.IDLE, addresses.treasuryMultisig, idleAmountToTransfer])
            .addContractAction(feeCollector, "setSplitAllocation", [newAllocations])
            .addContractAction(feeCollector, "withdrawUnderlying", [addresses.treasuryMultisig, feeCollectorBpoolBalance, [0, 0]])
            .addContractAction(timelock, "setPendingAdmin", [governorBravoAddress])
            .addContractAction(governorBravo, "_setWhitelistGuardian", [addresses.devLeagueMultisig])
            .addContractAction(governorBravo, "_initiate", [addresses.governorAlpha]);

        // Proposal
        proposalBuilder.setDescription(iipDescription);
        const proposal = proposalBuilder.build()
        await proposal.printProposalInfo();

        const treasuryIdleBalanceBefore = await idleToken.balanceOf(addresses.treasuryMultisig);
        const treasuryWETHBalanceBefore = await wethToken.balanceOf(addresses.treasuryMultisig);
        const treasuryUSDCBalanceBefore = await usdcToken.balanceOf(addresses.treasuryMultisig);

        await hre.run('execute-proposal-or-simulate', { proposal, isLocalNet });

        // Skip tests in mainnet
        if (!isLocalNet) {
            return;
        }

        console.log("Checking effects...");

        // Check that allocations are changed for the FeeCollector        
        const allocations = await feeCollector.getSplitAllocation();
        const treasuryIdleBalanceAfter = await idleToken.balanceOf(addresses.treasuryMultisig);
        const treasuryWETHBalanceAfter = await wethToken.balanceOf(addresses.treasuryMultisig);
        const treasuryUSDCBalanceAfter = await usdcToken.balanceOf(addresses.treasuryMultisig);

        const treasuryIdleBalanceIncrease = treasuryIdleBalanceAfter.sub(treasuryIdleBalanceBefore);
        const treasuryWETHBalanceIncrease = treasuryWETHBalanceAfter.sub(treasuryWETHBalanceBefore);
        const treasuryUSDCBalanceIncrease = treasuryUSDCBalanceAfter.sub(treasuryUSDCBalanceBefore);

        // bpool is going to get drained and treasury is going to receive more WETH of those in the pool
        // approximatively 208000 IDLEs and ~15.3 WETH (bpool is currently holding ~208161 IDLE and ~15.2 WETH)

        console.log(`Treasury IDLE balance increase: ${hre.ethers.utils.formatEther(treasuryIdleBalanceIncrease)}`);
        console.log(`Treasury WETH balance increase: ${hre.ethers.utils.formatEther(treasuryWETHBalanceIncrease)}`);

        if (treasuryIdleBalanceIncrease.gt(toBN(208000).mul(ONE).add(idleAmountToTransfer)) 
            && treasuryWETHBalanceIncrease.gt(toBN(15).mul(ONE).add(wethBalanceFeeTreasury))
            && treasuryUSDCBalanceIncrease.eq(usdcBalanceFeeTreasury)) {
            console.log(`✅ Correct balance increases!`);
        } else {
            console.log('Incorrect increase in treasury balances');
        }

        for (let i in newAllocations) {
            if (newAllocations[i].eq(allocations[i])) {
                console.log(`✅ Allocation ${i} correct`);
            } else {
                console.log(`Allocation ${i} incorrect`);
            }
        }

        // Test that the governor returns the correct values for admin and initial proposal
        const governorAdmin = await governorBravo.admin();
        const governorInitialProposal = await governorBravo.initialProposalId();
        const whitelistedGuardian = await governorBravo.whitelistGuardian();
        const timelockAdmin = await timelock.admin();

        if (governorAdmin == timelock.address) {
            console.log("✅ Governor Admin is Timelock");
        } else {
            console.log(`Governor admin is NOT Timelock: ${governorAdmin}`)
        }

        if (governorInitialProposal.toString() == "18") {
            console.log("✅ Governor initialProposalCount is correct (18)");
        } else {
            console.log(`Governor initialProposalCount is NOT correct: ${governorInitialProposal}`);
        }

        if (timelockAdmin == governorBravoAddress) {
            console.log("✅ Timelock admin is Governor Bravo");
        } else {
            console.log(`Timelock admin is NOT Governor Bravo: ${timelockAdmin}`);
        }

        if (whitelistedGuardian == addresses.devLeagueMultisig) {
            console.log("✅ Whitelisted Guardian is Dev Multisig");
        } else {
            console.log(`Whitelisted Guardian is NOT Dev Multisig: ${whitelistedGuardian}`);
        }

        const idleDAI = await hre.ethers.getContractAt(IdleTokenGovernanceABI, addresses.idleDAIV4);

        governorBravo = await hre.ethers.getContractAt(GovernorBravoDelegateABI, governorBravoAddress);

        let builderBravo = new AlphaProposalBuilder(hre, governorBravo, hre.config.proposals.votingToken)
        builderBravo.addContractAction(idleDAI, "setFee", [toBN('9000')])
        const proposalBravo = builderBravo.build()
        await proposalBravo.printProposalInfo();

        await hre.run('execute-proposal-or-simulate', { proposal: proposalBravo, isLocalNet });

        let fees = await idleDAI.fee();

        if (fees.eq(toBN('9000'))) {
            console.log(`✅ idleDAI fee: ${fees}`);
        } else {
            console.log(`Wrong idleDAI fee: ${fees}`);
        }
    });
