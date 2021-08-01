import { task } from "hardhat/config"
const ADDRESSES = require("./addresses")
const IDLE_TOKEN_ABI = require("../abi/IdleTokenGovernance.json")


export default task("simulate-iip-11", "Deploy IIP 11 Disable AAVE v1", async(_, hre) => {
    const IDLE_TOKENS_WITH_AAVE_TOKEN = [
        [ADDRESSES.idleDAIV4, ADDRESSES.aDAI.live],
        [ADDRESSES.idleUSDCV4, ADDRESSES.aUSDC.live],
        [ADDRESSES.idleUSDTV4, ADDRESSES.aUSDT.live],
        [ADDRESSES.idleSUSDV4, ADDRESSES.aSUSD.live],
        [ADDRESSES.idleTUSDV4, ADDRESSES.aTUSD.live],
        [ADDRESSES.idleWBTCV4, ADDRESSES.aWBTC.live]
        //
        // IDLE safe tokens will need to be processed differently
        // [ADDRESSES.idleDAISafeV4, ADDRESSES.aDAI.live],
        // [ADDRESSES.idleUSDCSafeV4, ADDRESSES.aUSDC.live],
        // [ADDRESSES.idleUSDTSafeV4, ADDRESSES.aUSDT.live]
    ]

    let proposalBuilder = hre.proposals.builders.alpha()

    for (const token_aave of IDLE_TOKENS_WITH_AAVE_TOKEN) {
        const IDLE_TOKEN = token_aave[0]
        const AAVE_TOKEN = token_aave[1]

        console.log(`Adding proposal action for IDLE TOKEN: ${IDLE_TOKEN}`)

        let contract = await hre.ethers.getContractAt(IDLE_TOKEN_ABI, IDLE_TOKEN)
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
            const govToken = await contract.getProtocolTokenToGov(token)
    
            if (i==aave_index) {
                console.log(`Removing wrapper @ ${wrapper} for token ${token}`)

                continue
            }

            if (govToken !== ADDRESSES.addr0) { allGovTokens.push(govToken) }
    
            protocolTokens.push(token)
            wrappers.push(wrapper);
            protocolGovTokens.push(govToken)
        };

        proposalBuilder = proposalBuilder.addAction(contract, "setAllAvailableTokensAndWrappers", [
            protocolTokens,
            wrappers,
            allGovTokens,
            protocolGovTokens
        ])
    }

    let proposal = proposalBuilder.build()

    await proposal.printProposalInfo()

    console.log("--------------------------------------------------------")
    console.log("Simulating proposal")
    await proposal.simulate()
    console.log("Proposal simulated :)")
})