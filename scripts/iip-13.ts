import { BigNumber } from "ethers";
import { task } from "hardhat/config"
import { LedgerSigner } from "@ethersproject/hardware-wallets";
import {SafeEthersSigner, SafeService} from "@gnosis.pm/safe-ethers-adapters"

const IDLE_TOKEN_ABI = require("../abi/IdleTokenGovernance.json")
const IDLE_CONTROLLER_ABI = require("../abi/IdleController.json")
const addresses = require("../common/addresses")

const ERC20_ABI = require("../abi/ERC20.json")
const toBN = function(v: any): BigNumber { return BigNumber.from(v.toString()) };

const iipDescription = "Upgrade implementations and upgrade oracle to v3 \n https://gov.idle.finance/t/iip-13-code-improvements-and-flash-loan-fee-adjustment/680";
export default task("iip-13", iipDescription, async(_, hre) => {
  const isLocalNet = hre.network.name == 'hardhat';

  const newImplementationAddress = "0xEa091ed7146e2c3CF3AC11FA296e206E55177B30";
  const priceOracleV3Address = "0x758C10272A15f0E9D50Cbc035ff9a046945da0F2";
  const idleTokens = addresses.allIdleTokensBest;

  // upgradeAndCall
  let proposalBuilder = await hre.run("iip-upgrade", {
    description: iipDescription,
    implementation: newImplementationAddress,
    initMethod: "_init",
    initParams: [],
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
    console.log(`✅ idleController: oracle updated correctly`);
  } else {
    console.log(`🚨🚨 idleController: ERROR!!! wrong oracle address ${currentControllerOracle}`);
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

    // Test rebalances
    // Spread funds between all protocols
    let currentProtocolTokens = [...(await idleToken.getAPRs())["0"]].map(x=>x.toLowerCase())
    const allocationsSpread = currentProtocolTokens.map(() => parseInt((100000 / currentProtocolTokens.length).toFixed(0)))
    const diff = 100000 - allocationsSpread.reduce((p, c) => p + c); // check for rounding errors
    allocationsSpread[0] = allocationsSpread[0] + diff;
    console.log('allocationsSpread', allocationsSpread.map(a => a.toString()))
    await hre.run("test-idle-token", {idleToken, allocations: allocationsSpread, unlent: 0, whale: ''})
  }
});
