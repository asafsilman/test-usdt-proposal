import { BigNumber } from "ethers";
import { task } from "hardhat/config"
import { LedgerSigner } from "@ethersproject/hardware-wallets";
import {SafeEthersSigner, SafeService} from "@gnosis.pm/safe-ethers-adapters"

const ADDRESSES = require("./addresses")
const IDLE_TOKEN_ABI = require("../abi/IdleTokenGovernance.json")
const IDLE_TOKEN_SAFE_ABI = require("../abi/IdleTokenGovernanceSafe.json")

const FEE_COLLECTOR_ABI = require("../abi/FeeCollector.json")
const GOVERNABLE_FUND_ABI = require("../abi/GovernableFund.json")
const ERC20_ABI = require("../abi/ERC20.json")
const toBN = function(v: any): BigNumber { return BigNumber.from(v.toString()) };

export default task("iip-11", "Deploy IIP 11 to Disable AAVE v1", async(_, hre) => {
    const IDLE_TOKENS_WITH_AAVE_TOKEN = [
        { idleTokenAddress: ADDRESSES.idleDAIV4,  underlyingTokenAddress: ADDRESSES.aDAI.live, isSafe: false },
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
        let allGovTokens = new Array<string>();

        if (!token_aave.isSafe) {
          allGovTokens = await contract.getGovTokens();
        }

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

            protocolTokens.push(token)
            wrappers.push(wrapper);
            protocolGovTokens.push(govToken)
        };

        if (token_aave.isSafe) {
          const allocations = await contract.getAllocations();
          proposalBuilder = proposalBuilder.addContractAction(contract, "setAllAvailableTokensAndWrappers", [
            protocolTokens,
            wrappers,
            allocations,
            true,
          ])
        } else {
          proposalBuilder = proposalBuilder.addContractAction(contract, "setAllAvailableTokensAndWrappers", [
            protocolTokens,
            wrappers,
            allGovTokens,
            protocolGovTokens
          ])
        }
    }

    // get 4105.7 IDLE for https://gov.idle.finance/t/treasury-league-budget-extension/587
    const amountToTransfer = toBN('41057').mul(toBN('10').pow('17'));
    console.log(amountToTransfer.toString());
    let ecosystemFund = await hre.ethers.getContractAt(GOVERNABLE_FUND_ABI, ADDRESSES.ecosystemFund)
    proposalBuilder.addContractAction(ecosystemFund, "transfer", [ADDRESSES.IDLE, ADDRESSES.treasuryMultisig, amountToTransfer])

    proposalBuilder.setDescription("IIP-11 Deprecate Aave v1\n Remove Aave v1 protocol from all idleTokens, more info https://gov.idle.finance/t/deprecate-aave-v1/565. Withdraw 4105.7 IDLE from Ecosystem Fund, more info https://gov.idle.finance/t/treasury-league-budget-extension/587")
    let proposal = proposalBuilder.build()
    await proposal.printProposalInfo()

    console.log("--------------------------------------------------------")
    // Get current IDLE balance of treasuryMultisig
    const IDLEContract = await hre.ethers.getContractAt(ERC20_ABI, ADDRESSES.IDLE)
    const balTreasury = await IDLEContract.balanceOf(ADDRESSES.treasuryMultisig);

    const isLocalNet = hre.network.name == 'hardhat';
    if (isLocalNet) {
      console.log("Simulating proposal")
      const WHALE_ADDRESS = ADDRESSES.devLeagueMultisig;
      await hre.network.provider.send("hardhat_impersonateAccount", [WHALE_ADDRESS])
      let signer = await hre.ethers.getSigner(WHALE_ADDRESS)
      proposal.setProposer(signer)
      // To run full simulation, set the flag for simulate to `true`
      await proposal.simulate()
      console.log("Proposal simulated :)")
      console.log()
    } else {
      console.log('Posting proposal on-chain with Dev League Multisig')
      const ledgerSigner = new LedgerSigner(hre.ethers.provider, undefined, "m/44'/60'/0'/0/0");
      const service = new SafeService('https://safe-transaction.gnosis.io/')
      const signer = await SafeEthersSigner.create(ADDRESSES.devLeagueMultisig, ledgerSigner, service, hre.ethers.provider)
      proposal.setProposer(signer)
      await proposal.propose()
      console.log("Proposal is live");
    }

    console.log("--------------------------------------------------------")
    // Skip tests in mainnet
    if (!isLocalNet) {
      return;
    }

    // Test that Aave wrappers have been removed
    for (const token_aave of IDLE_TOKENS_WITH_AAVE_TOKEN) {
        const IDLE_TOKEN = token_aave.idleTokenAddress;
        const AAVE_TOKEN = token_aave.underlyingTokenAddress

        let abi = token_aave.isSafe ? IDLE_TOKEN_SAFE_ABI : IDLE_TOKEN_ABI;
        let contract = await hre.ethers.getContractAt(abi, IDLE_TOKEN)
        let contractName = await contract.name()
        let currentProtocolTokens = [...(await contract.getAPRs())["0"]].map(x=>x.toLowerCase())

        let aave_index = currentProtocolTokens.indexOf(AAVE_TOKEN.toLowerCase())

        if (aave_index==-1) {
            console.log(`✅ ${contractName} has removed AAVE v1`)
        } else {
            console.log(`🚨🚨 ERROR!!! ${contractName} failed to remove AAVE v1`)
        }

        // Test rebalances
        // Spread funds between all protocols
        const allocationsSpread = currentProtocolTokens.map(() => parseInt((100000 / currentProtocolTokens.length).toFixed(0)))
        const diff = 100000 - allocationsSpread.reduce((p, c) => p + c); // check for rounding errors
        allocationsSpread[0] = allocationsSpread[0] + diff;
        console.log('allocationsSpread', allocationsSpread.map(a => a.toString()))
        await hre.run("test-idle-token", {idleToken: contract, allocations: allocationsSpread, unlent: 0, whale: ''})

        // All funds in the first protocol
        const allocationsAllInFirst = currentProtocolTokens.map((_, i) => i == 0 ? 100000 : 0);
        console.log('allocationsAllInFirst', allocationsAllInFirst.map(a => a.toString()))
        await hre.run("test-idle-token", {idleToken: contract, allocations: allocationsAllInFirst, unlent: 0, whale: ''})
    }

    // Test that treasury multisig got new IDLE balance
    const balTreasuryFinal = await IDLEContract.balanceOf(ADDRESSES.treasuryMultisig);
    if (toBN(balTreasuryFinal).sub(toBN(balTreasury)).eq(amountToTransfer)) {
      console.log("✅ Verified that IDLE have been transferred to the treasury multisig")
    } else {
      console.log(balTreasuryFinal.toString())
      console.log("🚨🚨 ERROR!!! IDLE not transferred")
    }
})
