import { task } from "hardhat/config"
import { LedgerSigner } from "@ethersproject/hardware-wallets";
import {SafeEthersSigner, SafeService} from "@gnosis.pm/safe-ethers-adapters"

const addresses = require("../common/addresses");

export default task("execute-proposal-or-simulate", "Test an idleToken by doing a rebalance", async (args: any, hre) => {
    if (!args.proposal) {
      console.log('Error proposal task arg');
      return;
    }

    let proposal = args.proposal;
    let isLocalNet = args.isLocalNet;

    if (isLocalNet) {
      console.log("Simulating proposal")
      const WHALE_ADDRESS = addresses.devLeagueMultisig;
      await hre.network.provider.send("hardhat_impersonateAccount", [WHALE_ADDRESS]);
      let signer = await hre.ethers.getSigner(WHALE_ADDRESS);
      await hre.network.provider.send("hardhat_setBalance", [WHALE_ADDRESS, "0xffffffffffffffff"]);
      proposal.setProposer(signer);
      // To run full simulation, set the flag for simulate to `true`
      await proposal.simulate(args.fullSimulation);
      console.log("Proposal simulated :)");
      console.log();
    } else {
      console.log('Posting proposal on-chain with Dev League Multisig');
      const ledgerSigner = new LedgerSigner(hre.ethers.provider, undefined, "m/44'/60'/0'/0/0");
      const service = new SafeService('https://safe-transaction.gnosis.io/');
      const signer = await SafeEthersSigner.create(addresses.devLeagueMultisig, ledgerSigner, service, hre.ethers.provider);
      proposal.setProposer(signer);
      await proposal.propose();
      console.log("Proposal is live");
    }

    return proposal;
})
