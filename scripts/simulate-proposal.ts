import { subtask } from "hardhat/config"

const addresses = require("./addresses")

export default subtask("simulate-proposal", "Simulate the proposal", async(_, hre) => {
    // SETUP
    let deployedContracts = await hre.run("deploy-contracts")

    let protocolTokens = [...(await deployedContracts.idleUSDTv4.getAPRs())["0"]];
    let protocolGovTokens = []
    let allGovTokens = []
    let wrappers = [];

    for (var j = 0; j < protocolTokens.length; j++) {
        const token = protocolTokens[j];
        const wrapper = await deployedContracts.idleUSDTv4.protocolWrappers(token);
        const govToken = await deployedContracts.idleUSDTv4.getProtocolTokenToGov(token)

        if (govToken !== addresses.addr0) { allGovTokens.push(govToken) }

        wrappers.push(wrapper);
        protocolGovTokens.push(govToken)
    };

    console.log("Protocol Tokens:", protocolTokens);
    console.log("Protocol Gov Tokens:", protocolGovTokens)
    console.log("Wrappers:", wrappers)

    protocolTokens.push(deployedContracts.crUSDT)
    protocolGovTokens.push(deployedContracts.CREAM)
    wrappers.push(deployedContracts.usdtCREAMWrapper)
    
    let proposer = await hre.ethers.getSigner(deployedContracts.IDLE_WHALE)
  
    let proposal  = (await hre.proposal.builders.alpha())
        .setProposer(proposer)
        .addAction(deployedContracts.idleUSDTv4, "setAllAvailableTokensAndWrappers", [
          protocolTokens,
          wrappers,
          allGovTokens,
          protocolGovTokens
        ])
        .setDescription("[TEST] Enable CREAM for idleUSDT")
        .build()

    console.log("Proposal Info")
    await proposal.printProposalInfo()
    await proposal.simulate()
    console.log("Simulated proposal...")

    return {
        idleUSDTv4: deployedContracts.idleUSDTv4,
        // proposal: proposal
    }
  })
