import { task } from "hardhat/config"
const ADDRESSES = require("./addresses")
const IDLE_TOKEN_ABI = require("../abi/IdleTokenGovernance.json")
const IDLE_TOKEN_SAFE_ABI = require("../abi/IdleTokenGovernanceSafe.json")


export default task("simulate-iip-11", "Deploy IIP 11 Disable AAVE v1", async(_, hre) => {
    const IDLE_TOKENS_WITH_AAVE_TOKEN = [
        { idleTokenAddress: ADDRESSES.idleDAIV4,  underlyingTokenAddress: ADDRESSES.aDAI.live , isSafe: false },
        { idleTokenAddress: ADDRESSES.idleUSDCV4, underlyingTokenAddress: ADDRESSES.aUSDC.live, isSafe: false },
        { idleTokenAddress: ADDRESSES.idleUSDTV4, underlyingTokenAddress: ADDRESSES.aUSDT.live, isSafe: false },
        { idleTokenAddress: ADDRESSES.idleSUSDV4, underlyingTokenAddress: ADDRESSES.aSUSD.live, isSafe: false },
        { idleTokenAddress: ADDRESSES.idleTUSDV4, underlyingTokenAddress: ADDRESSES.aTUSD.live, isSafe: false },
        { idleTokenAddress: ADDRESSES.idleWBTCV4, underlyingTokenAddress: ADDRESSES.aWBTC.live, isSafe: false },

        // IDLE safe tokens will need to be processed differently
        { idleTokenAddress: ADDRESSES.idleDAISafeV4, underlyingTokenAddress: ADDRESSES.aDAI.live,   isSafe: true },
        { idleTokenAddress: ADDRESSES.idleUSDCSafeV4, underlyingTokenAddress: ADDRESSES.aUSDC.live, isSafe: true },
        { idleTokenAddress: ADDRESSES.idleUSDTSafeV4, underlyingTokenAddress: ADDRESSES.aUSDT.live, isSafe: true },
    ]

    let proposalBuilder = hre.proposals.builders.alpha()

    for (const token_aave of IDLE_TOKENS_WITH_AAVE_TOKEN) {
        const IDLE_TOKEN = token_aave.idleTokenAddress;
        const AAVE_TOKEN = token_aave.underlyingTokenAddress

        let abi = token_aave.isSafe ? IDLE_TOKEN_SAFE_ABI : IDLE_TOKEN_ABI;
        let contract = await hre.ethers.getContractAt(abi, IDLE_TOKEN)
        console.log(`Adding proposal action for IDLE TOKEN: ${IDLE_TOKEN} - ${await contract.name()}`)
        let currentProtocolTokens = [...(await contract.getAPRs())["0"]].map(x=>x.toLowerCase())

        let protocolTokens = []
        let wrappers = []
        let protocolGovTokens = []
        let allGovTokens = []

        let aave_index = currentProtocolTokens.indexOf(AAVE_TOKEN.toLowerCase())
        if (aave_index==-1) console.log("COULD NOT FIND AAVE TOKEN")

        console.log(`Removing wrapper at index ${aave_index}`)

        for (var i = 0; i < currentProtocolTokens.length; i++) {
            const token = currentProtocolTokens[i];
            const wrapper = await contract.protocolWrappers(token);
            const govToken = token_aave.isSafe ? [] : await contract.getProtocolTokenToGov(token)

            if (i==aave_index) {
                console.log(`Removing wrapper @ ${wrapper} for token ${token}`)

                continue
            }

            if (govToken !== ADDRESSES.addr0) { allGovTokens.push(govToken) }

            protocolTokens.push(token)
            wrappers.push(wrapper);
            protocolGovTokens.push(govToken)
        };

        if (token_aave.isSafe) {
          const allocations = await contract.getAllocations();
          proposalBuilder = proposalBuilder.addAction(contract, "setAllAvailableTokensAndWrappers", [
            protocolTokens,
            wrappers,
            allocations,
            true,
          ])
        } else {
          proposalBuilder = proposalBuilder.addAction(contract, "setAllAvailableTokensAndWrappers", [
            protocolTokens,
            wrappers,
            allGovTokens,
            protocolGovTokens
          ])
        }
    }

    let proposal = proposalBuilder.build()

    await proposal.printProposalInfo()

    console.log("--------------------------------------------------------")
    console.log("Simulating proposal")
    await proposal.simulate()
    console.log("Proposal simulated :)")
})