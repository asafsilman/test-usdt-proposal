import { task } from "hardhat/config"
import { BigNumber } from "ethers";
import { AlphaProposalBuilder } from "@idle-finance/hardhat-proposals-plugin/dist/src/proposals/compound-alpha";

const addresses = require("../common/addresses")
const TimelockABI = require("../abi/Timelock.json");
const GovernorAlphaABI = require("../abi/GovernorAlpha.json");
const GovernorBravoDelegateABI = require("../abi/GovernorBravoDelegate.json");
const IdleTokenGovernanceABI = require("../abi/IdleTokenGovernance.json");

const toBN = function(v: any): BigNumber { return BigNumber.from(v.toString()) };

const iipDescription = "IIP-18: Upgrade Idle Governor Alpha to Compound Governor Bravo";

export default task("iip-18", "Upgrade Governor Alpha")
    .setAction(async (_, hre) => {
        const isLocalNet = hre.network.name == 'hardhat';

        const governorBravoAddress = '0x3D5Fc645320be0A085A32885F078F7121e5E5375';

        const timelock = await hre.ethers.getContractAt(TimelockABI, addresses.timelock);
        let governorBravo = await hre.ethers.getContractAt(GovernorBravoDelegateABI, governorBravoAddress);

        let proposalBuilder = hre.proposals.builders.alpha();

        proposalBuilder = proposalBuilder
                            .addContractAction(timelock, "setPendingAdmin", [governorBravoAddress])
                            .addContractAction(governorBravo, "_setWhitelistGuardian", [addresses.devLeagueMultisig])
                            .addContractAction(governorBravo, "_initiate", [addresses.governorAlpha]);

        // Proposal
        proposalBuilder.setDescription(iipDescription);
        const proposal = proposalBuilder.build()
        await proposal.printProposalInfo();

        await hre.run('execute-proposal-or-simulate', {proposal, isLocalNet});

        // Skip tests in mainnet
        if (!isLocalNet) {
            return;
        }

        console.log("Checking effects...");

        // Test that the governor returns the correct values for admin and initial proposal
        const governorAdmin = await governorBravo.admin();
        const governorInitialProposal = await governorBravo.initialProposalId();
        const whitelistedGuardian = await governorBravo.whitelistGuardian();
        const timelockAdmin = await timelock.admin();

        if(governorAdmin == timelock.address) {
            console.log("✅ Governor Admin is Timelock");
        } else {
            console.log(`Governor admin is NOT Timelock: ${governorAdmin}`)
        }

        if (governorInitialProposal.toString() == "18") {
            console.log("✅ Governor initialProposalCount is correct (18)");
        } else {
            console.log(`Governor initialProposalCount is NOT correct: ${governorInitialProposal}`);
        }

        if(timelockAdmin == governorBravoAddress) {
            console.log("✅ Timelock admin is Governor Bravo");
        } else {
            console.log(`Timelock admin is NOT Governor Bravo: ${timelockAdmin}`);
        }

        if(whitelistedGuardian == addresses.devLeagueMultisig) {
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

        await hre.run('execute-proposal-or-simulate', {proposal: proposalBravo, isLocalNet});
        
        let fees = await idleDAI.fee();

        if (fees.eq(toBN('9000'))) {
            console.log(`✅ idleDAI fee: ${fees}`);
        } else {
            console.log(`Wrong idleDAI fee: ${fees}`);
        }
    });
