import { task } from "hardhat/config"
import { FormatTypes, FunctionFragment, hexDataSlice } from "ethers/lib/utils";

const IDLE_TOKEN_ABI = require("../abi/IdleTokenGovernance.json")
const ProxyAdminABI = require("../abi/ProxyAdmin.json")
const IdleTokenABI = require("../abi/IdleTokenGovernance.json")
const addresses = require("../common/addresses")
const { LedgerSigner } = require("@ethersproject/hardware-wallets");
const {SafeEthersSigner, SafeService}  = require("@gnosis.pm/safe-ethers-adapters");
const { types } = require("hardhat/config");

export default task("iip-upgrade", "Generic iip to upgrade Idle tokens")
  .addParam("description", "The proposal description")
  .addParam("implementation", "The new implementation address")
  .addParam("initMethod", "The method to call with upgradeAndCall", "")
  .addParam("execute", "Execute or return proposal", false, types.boolean)
  .addParam("fullSimulation", "Full proposal simulation", false, types.boolean, true)
  // .addParam("proposalBuilder", "", false, types.boolean, true)
  .setAction(async(args, hre) => {

  const isLocalNet = hre.network.name == 'hardhat';
  const newImplementationAddress = args.implementation;
  const initMethod = args.initMethod;
  const proposalDescription = args.description;

  const idleTokens = addresses.allIdleTokensBest;
  const proxyAdmin = await hre.ethers.getContractAt(ProxyAdminABI, addresses.proxyAdmin);

  let proposalBuilder = args.proposalBuilder || hre.proposals.builders.alpha();

  for (let i = 0; i < idleTokens.length; i++) {
    const idleTokenAddress = idleTokens[i];
    const contract = await hre.ethers.getContractAt(IDLE_TOKEN_ABI, idleTokenAddress);
    if (initMethod == undefined || initMethod == null || initMethod == "") {
      proposalBuilder = proposalBuilder.addContractAction(proxyAdmin, "upgrade", [
        idleTokenAddress,
        newImplementationAddress,
      ]);
    } else {
      const functionFragment: FunctionFragment = contract.interface.getFunction(initMethod);
      const initMethodCall = contract.interface.encodeFunctionData(functionFragment, args.initParams || []);

      proposalBuilder = proposalBuilder.addContractAction(proxyAdmin, "upgradeAndCall", [
        idleTokenAddress,
        newImplementationAddress,
        initMethodCall,
      ]);
    }
  }

  proposalBuilder.setDescription(proposalDescription);

  if (!args.execute) {
    return proposalBuilder;
  }

  const proposal = proposalBuilder.build()
  await proposal.printProposalInfo();

  await hre.run('execute-proposal-or-simulate', {proposal, isLocalNet});
});
