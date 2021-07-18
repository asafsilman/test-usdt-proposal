# Test proposal using @idle-finance/hardhat-proposals-plugin

Create a proposal for idle finance to enable CREAM for usdt idle pool.

Contracts are cloned from `https://github.com/Idle-Labs/idle-contracts`

governance contracts are defined in `hardhat.config.ts`
scripts are located under `./scripts`

- `deploy-contracts.ts` deploys CREAM wrapper as `IdleCompoundLike.sol` with initialised proxy.
- `simulate-proposals.ts` build and simulate proposal as a popular IDLE delagate
- `test-proposal.tx` run tests ported from `https://github.com/Idle-Labs/idle-contracts/blob/matic/migrations/151-test-matic-rebalance.js`


## Snippet for building proposal

```
let proposal  = (await hre.proposals.builders.alpha())
    .setProposer(proposer)
    .addAction( // add action to proposal
        deployedContracts.idleUSDTv4, // contract
        "setAllAvailableTokensAndWrappers", // method
        [ // args
            protocolTokens, // protocol tokens for lending providers
            wrappers, // wrapper contract addresses
            allGovTokens, // list of all governance tokens
            protocolGovTokens // mappings of protocol to associated governance token
    ])
    .setDescription("[TEST] Enable CREAM for idleUSDT") // add a description
    .build() // returns a proposal

await proposal.simulate()
```
