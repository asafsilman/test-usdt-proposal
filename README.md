# Idle Proposals Monorepo

Idle Improvement Proposals (IIPs) are formal on-chain proposals which allow community members to vote on changes to the IDLE protocol.

This repo contains the codebases and test for deploying IIPs using hardhat.

This repo utilises the hardhat proposal plugin, a tutorial for this can be found here.
https://github.com/Idle-Finance/proposal-plugin-tutorial

## Snippet for building proposal

```
let proposal = hre.proposals.builders.alpha()
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
