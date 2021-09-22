import { BigNumber } from "ethers";
import { task } from "hardhat/config"
import { LedgerSigner } from "@ethersproject/hardware-wallets";
import {SafeEthersSigner, SafeService} from "@gnosis.pm/safe-ethers-adapters"

const IDLE_TOKEN_ABI = require("../abi/IdleTokenGovernance.json")
const IDLE_CONTROLLER_ABI = require("../abi/IdleController.json")
const addresses = require("../common/addresses")

const ERC20_ABI = require("../abi/ERC20.json")
const toBN = function(v: any): BigNumber { return BigNumber.from(v.toString()) };

const iipDescription = "Upgrade implementations calling setOraclePrice";
export default task("iip-13", iipDescription, async(_, hre) => {
  const isLocalNet = hre.network.name == 'hardhat';

  const newImplementationAddress = "0xb776dd8f1f86c78260f9a43920cbc72d78de322c";
  const priceOracleV3Address = "0x758C10272A15f0E9D50Cbc035ff9a046945da0F2";
  const idleTokens = addresses.allIdleTokensBest;
  const IdleTokenGovernance = await hre.ethers.getContractFactory("IdleTokenGovernance");


  // upgradeAndCall
  let proposalBuilder = await hre.run("iip-upgrade", {
    description: iipDescription,
    implementation: newImplementationAddress,
    initMethod: "setOracleAddress",
    initSig: "setOracleAddress(address)",
    initParams: [priceOracleV3Address],
    execute: false,
  });

  const idleController = await hre.ethers.getContractAt(IDLE_CONTROLLER_ABI, addresses.idleController);
  proposalBuilder = proposalBuilder.addContractAction(idleController, "_setPriceOracle", [priceOracleV3Address]);

  const proposal = proposalBuilder.build()
  await proposal.printProposalInfo();

  if (isLocalNet) {
    console.log("Simulating proposal")
    const WHALE_ADDRESS = addresses.devLeagueMultisig;
    await hre.network.provider.send("hardhat_impersonateAccount", [WHALE_ADDRESS]);
    let signer = await hre.ethers.getSigner(WHALE_ADDRESS);
    await hre.network.provider.send("hardhat_setBalance", [WHALE_ADDRESS, "0xffffffffffffffff"]);
    proposal.setProposer(signer);
    // To run full simulation, set the flag for simulate to `true`
    await proposal.simulate();
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

  const currentControllerOracle = await idleController.oracle();
  if (currentControllerOracle.toLowerCase() == priceOracleV3Address.toLowerCase()) {
    console.log(`✅ oracle updated correctly`);
  } else {
    console.log(`🚨🚨 ERROR!!! wrong oracle address ${currentControllerOracle}`);
  }

  for (let i = 0; i < idleTokens.length; i++) {
    const idleToken = await hre.ethers.getContractAt(IDLE_TOKEN_ABI, idleTokens[i])
    const currentOracle = await idleToken.oracle();
    console.log(`📝 Testing ${await idleToken.name()}`);
    if (currentOracle.toLowerCase() == priceOracleV3Address.toLowerCase()) {
      console.log(`✅ oracle updated correctly`);
    } else {
      console.log(`🚨🚨 ERROR!!! wrong oracle address ${currentOracle}`)
    }
  }
});
