import { task } from "hardhat/config"
import { BigNumber } from "ethers";

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
                            .addContractAction(governorBravo, "_initiate", [addresses.governorAlpha])
                            .addContractAction(governorBravo, "_setWhitelistGuardian", [addresses.devLeagueMultisig]);

        // Proposal
        proposalBuilder.setDescription(iipDescription);
        const proposal = proposalBuilder.build()
        await proposal.printProposalInfo();

        await hre.run('execute-proposal-or-simulate', {proposal, isLocalNet, fullSimulation: true});

        // Skip tests in mainnet
        if (!isLocalNet) {
            return;
        }

        console.log("Checking effects...");

        // Test that the governor returns the correct values for admin and initial proposal
        const governorAdmin = await governorBravo.admin();
        const governorInitialProposal = await governorBravo.initialProposalId();
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

        governorBravo = await hre.ethers.getContractAt(GovernorAlphaABI, governorBravoAddress);
        proposalBuilder.setGovernor(governorBravo);

        const idleDAI = await hre.ethers.getContractAt(IdleTokenGovernanceABI, addresses.idleDAIV4);

        proposalBuilder = proposalBuilder.addContractAction(idleDAI, "setFee", [toBN(9000)])
        const proposalBravo = proposalBuilder.build()
        await proposalBravo.printProposalInfo();

        await hre.run('execute-proposal-or-simulate', {proposal, isLocalNet});
    });
