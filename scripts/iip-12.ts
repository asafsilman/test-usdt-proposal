import { BigNumber } from "ethers";
import { task } from "hardhat/config"
import { LedgerSigner } from "@ethersproject/hardware-wallets";
import {SafeEthersSigner, SafeService} from "@gnosis.pm/safe-ethers-adapters"

const addresses = require("../common/addresses")
const IDLE_TOKEN_ABI = require("../abi/IdleTokenGovernance.json")
const IDLE_CONTROLLER_ABI = require("../abi/IdleController.json")
const PRICE_ORACLE_ABI = require("../abi/PriceOracleV2.json")
const FEE_COLLECTOR_ABI = require("../abi/FeeCollector.json")
const GOVERNABLE_FUND = require("../abi/GovernableFund.json");

const ERC20_ABI = require("../abi/ERC20.json")
const toBN = function(v: any): BigNumber { return BigNumber.from(v.toString()) };

const iipDescription = "IIP-12 idleRAI upgrades and Leagues funding"
export default task("iip-12", iipDescription, async(_, hre) => {
  const isLocalNet = hre.network.name == 'hardhat';

  let proposalBuilder = hre.proposals.builders.alpha();

  const idleRAI = await hre.ethers.getContractAt(IDLE_TOKEN_ABI, addresses.idleRAIV4);
  const crRAI = await hre.ethers.getContractAt(ERC20_ABI, addresses.crRAI.live)
  const currentProtocolTokens = [...(await idleRAI.getAPRs())["0"]].map(x => x.toLowerCase())

  const protocolTokens = [];
  const wrappers = [];
  const govTokens = (await idleRAI.getGovTokens()).map((a: string) => a);
  const govTokensEqualLength = [];
  let creamTokenIndex = -1;

  for (var i = 0; i < currentProtocolTokens.length; i++) {
    const token = currentProtocolTokens[i];
    const wrapper = await idleRAI.protocolWrappers(token);
    const govToken = await idleRAI.getProtocolTokenToGov(token);

    // remove cream token
    if (token == addresses.crRAI.live.toLowerCase()) {
      creamTokenIndex = i;
      continue;
    }

    if (token == addresses.aRAI.live.toLowerCase()) {
      govTokensEqualLength.push(addresses.stkAAVE.live.toLowerCase());
    } else {
      govTokensEqualLength.push(govToken);
    }

    protocolTokens.push(token);
    wrappers.push(wrapper);
  }

  if (creamTokenIndex < 0) {
    throw("CREAM TOKEN NOT FOUND");
  }

  if (govTokensEqualLength.includes(addresses.stkAAVE.live.toLowerCase())) {
    console.log("✅ Verified that stkAAVE has been associated as gov token of aRAI");
  } else {
    throw("🚨🚨 ERROR!!! govTokensEqualLength doesn't contain stkAAVE");
  }

  if (isLocalNet) {
    console.log("local network, rebalancing...");
    console.log(`creamTokenIndex: ${creamTokenIndex}`);
    await hre.network.provider.send("hardhat_setBalance", [addresses.timelock, "0xffffffffffffffff"]);
    await hre.network.provider.send("hardhat_impersonateAccount", [addresses.timelock]);
    const timelock = await hre.ethers.getSigner(addresses.timelock);
    const allocations = [toBN("50000"), toBN("50000"), toBN("50000")];
    allocations[creamTokenIndex] = toBN("0");
    await idleRAI.connect(timelock).setAllocations([toBN("0"), toBN("50000"), toBN("50000")]);
    await idleRAI.connect(timelock).rebalance();
  }

  const crRAIBalance = await crRAI.balanceOf(idleRAI.address);
  if (crRAIBalance.gt(toBN("10"))) {
    throw(`IdleRAI still has a balance in crRAI. Balance: ${crRAIBalance.toString()}`);
  } else {
    console.log(`✅ Verified that IdleRAI has no crRAI balance. (${crRAIBalance.toString()})`);
  }

  const currentAllocations = await idleRAI.getAllocations();
  if(!currentAllocations[creamTokenIndex].eq(toBN("0"))) {
    throw("CREAM ALLOCATION MUST BE ZERO BEFORE RUNNING THIS PROPOSAL");
  }

  govTokens.push(addresses.stkAAVE.live);
  govTokens.push(addresses.IDLE);

  // setAllAvailableTokensAndWrappers
  proposalBuilder = proposalBuilder.addContractAction(idleRAI, "setAllAvailableTokensAndWrappers", [
    protocolTokens,      // protocolTokens
    wrappers,            // wrappers
    govTokens,           // _newGovTokens
    govTokensEqualLength // _newGovTokensEqualLen
  ]);

  const raiEthPriceFeed = "0x4ad7B025127e89263242aB68F0f9c4E5C033B489";
  // updateFeedETH priceOracleV1
  const priceOracleV1 = await hre.ethers.getContractAt(PRICE_ORACLE_ABI, addresses.priceOracleV1);
  proposalBuilder = proposalBuilder.addContractAction(priceOracleV1, "updateFeedETH", [addresses.RAI.live, raiEthPriceFeed]);

  // updateFeedETH priceOracleV2
  const priceOracleV2 = await hre.ethers.getContractAt(PRICE_ORACLE_ABI, addresses.priceOracleV2.live);
  proposalBuilder = proposalBuilder.addContractAction(priceOracleV2, "updateFeedETH", [addresses.RAI.live, raiEthPriceFeed]);

  // add IdleRAI market
  const idleController = await hre.ethers.getContractAt(IDLE_CONTROLLER_ABI, addresses.idleController);
  const idleRAISpeedBefore = await idleController.idleSpeeds(addresses.idleRAIV4);
  proposalBuilder = proposalBuilder.addContractAction(idleController, "_supportMarkets", [[idleRAI.address]]);
  proposalBuilder = proposalBuilder.addContractAction(idleController, "_addIdleMarkets", [[idleRAI.address]]);

  // registerTokenToDepositList
  const feeCollector = await hre.ethers.getContractAt(FEE_COLLECTOR_ABI, addresses.feeCollector)
  proposalBuilder.addContractAction(feeCollector, "registerTokenToDepositList", [addresses.RAI.live])

  const feeTreasury = await hre.ethers.getContractAt(GOVERNABLE_FUND, addresses.feeTreasury)
  const ecosystemFund = await hre.ethers.getContractAt(GOVERNABLE_FUND, addresses.ecosystemFund)

  const weth = await hre.ethers.getContractAt(ERC20_ABI, addresses.WETH.live);
  const comp = await hre.ethers.getContractAt(ERC20_ABI, addresses.COMP.live);
  const idle = await hre.ethers.getContractAt(ERC20_ABI, addresses.IDLE);
  const stkAAVE = await hre.ethers.getContractAt(ERC20_ABI, addresses.stkAAVE.live);

  // Tokens from FeeTreasury to treasuryMultisig
  const transfers: any = [
    // 7.55 WETH from feeTreasury
    {
      token: addresses.WETH.live,
      contract: feeTreasury,
      method: "transfer",
      to: addresses.devLeagueMultisig,
      value: toBN("755").mul(toBN("10").pow(toBN("16"))),
    },
    // all stkAAVE from feeCollector
    {
      token: addresses.stkAAVE.live,
      contract: feeCollector,
      method: "withdraw",
      to: addresses.devLeagueMultisig,
      value: await stkAAVE.balanceOf(addresses.feeCollector),
    },
    // 16183 IDLE from ecosystemFund
    {
      token: addresses.IDLE,
      contract: ecosystemFund,
      method: "transfer",
      to: addresses.devLeagueMultisig,
      value: toBN("16183").mul(toBN("10").pow(toBN("18"))),
    },
  ];

  for (var i = 0; i < transfers.length; i++) {
    const t = transfers[i];
    const token = await hre.ethers.getContractAt(ERC20_ABI, t.token);
    const tokenName = await token.name();
    t.receiverInitialBalance = await token.balanceOf(t.to);
    console.log(`add transfer action from ${t.contract.address}, to ${t.to} of ${t.value.toString()} ${tokenName}`);
    proposalBuilder.addContractAction(t.contract, t.method, [t.token, t.to, t.value]);
  }

  // setAToken
  proposalBuilder = proposalBuilder.addContractAction(idleRAI, "setAToken", [addresses.aRAI.live]);

  // Proposal
  proposalBuilder.setDescription(iipDescription);
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

  console.log("--------------------------------------------------------")
  // Skip tests in mainnet
  if (!isLocalNet) {
    return;
  }

  console.log("Testing...");

  // RAI price from PriceOracle
  const priceOracles = [priceOracleV1, priceOracleV2];
  for (let i = 0; i < priceOracles.length; i++) {
    console.log(`checking prices with price oracle v${i + 1}`);
    const priceOracle = priceOracles[i];
    const raiPriceInETH = await priceOracleV1.getPriceETH(addresses.RAI.live);
    const raiPriceInUSDC = await priceOracleV1.getPriceToken(addresses.RAI.live, addresses.USDC.live);
    console.log("raiPriceInETH", raiPriceInETH.toString());
    console.log("raiPriceInUSDC", raiPriceInUSDC.toString());
    if (!raiPriceInETH.gt(toBN("0"))) {
      console.log("🚨🚨 ERROR!!! raiPriceInETH is 0");
    } else {
      console.log("✅ raiPriceInETH is > 0")
    }

    if (!raiPriceInUSDC.gt(toBN("0"))) {
      console.log("🚨🚨 ERROR!!! raiPriceInUSDC is 0");
    } else {
      console.log("✅ raiPriceInUSDC is > 0")
    }
  }

  // IdleRAI speed
  if (idleRAISpeedBefore.gt(toBN("0"))) {
    console.log("🚨🚨 ERROR!!! IdleRAI speed before proposal was already > 0");
  }
  const idleRAISpeedAfter = await idleController.idleSpeeds(addresses.idleRAIV4);
  console.log("idleRAISpeedBefore", idleRAISpeedBefore.toString());
  console.log("idleRAISpeedAfter", idleRAISpeedAfter.toString());

  if (!idleRAISpeedAfter.gt(toBN("0"))) {
    console.log("🚨🚨 ERROR!!! IdleRAI speed after proposal didn't increase");
  } else {
    console.log("✅ Verified that IdleRAI speed increased after proposal");
  }

  // RAI added as deposit tokens in Fee Collector
  const despositTokens = (await feeCollector.getDepositTokens()).map((a: string) => a.toLowerCase());
  if (despositTokens.includes(addresses.RAI.live.toLowerCase())) {
    console.log("✅ Verified that RAI is enabled in feeCollector");
  } else {
    console.log("🚨🚨 ERROR!!! Fee collector did not enable RAIs");
  }

  // IDLE added as gov token
  const newGovTokens = (await idleRAI.getGovTokens()).map((a: string) => a.toLowerCase());
  if (newGovTokens.includes(addresses.IDLE.toLowerCase())) {
    console.log("✅ Verified that IDLE has been added as gov token");
  } else {
    console.log("🚨🚨 ERROR!!! IdleRAI doens't have IDLE as gov token");
  }

  // stkAAVE added as gov token
  if (newGovTokens.includes(addresses.stkAAVE.live.toLowerCase())) {
    console.log("✅ Verified that stkAAVE has been added as gov token");
  } else {
    console.log("🚨🚨 ERROR!!! IdleRAI doens't have stkAAVE as gov token");
  }

  const newProtocolTokens = [...(await idleRAI.getAPRs())["0"]].map(x => x.toLowerCase());
  let creamTokenFound = false;
  for (var i = 0; i < newProtocolTokens.length; i++) {
    const token = newProtocolTokens[i];
    if (token == addresses.crRAI.live.toLowerCase()) {
      creamTokenFound = true;
      break;
    }
  }

  if (!creamTokenFound) {
    console.log("✅ Verified that cream is no longer used");
  } else {
    console.log("🚨🚨 ERROR!!! IdleRAI still uses cream");
  }

  // Check transfers
  for (var i = 0; i < transfers.length; i++) {
    const t = transfers[i];
    const token = await hre.ethers.getContractAt(ERC20_ABI, t.token);
    const tokenName = await token.name();
    const receiverNewBalance = await token.balanceOf(t.to);
    console.log(`checking transfer action from ${t.contract.address}, to ${t.to} of ${t.value.toString()} ${tokenName}`);

    console.log(`${t.to} initial balance of ${tokenName}: ${t.receiverInitialBalance.toString()}`);
    console.log(`${t.to}    new  balance of ${tokenName}: ${receiverNewBalance.toString()}`);
    if (!receiverNewBalance.eq(t.receiverInitialBalance.add(t.value))) {
      console.log(`🚨🚨 ERROR!!! transfer not received`);
    } else {
      console.log(`✅ Transfer verified\n`);
    }
  }

  // Test Idle Token
  let allocationsSpread = currentProtocolTokens.map(() => parseInt((100000 / currentProtocolTokens.length).toFixed(0)))
  allocationsSpread = [...allocationsSpread.slice(0, creamTokenIndex), ...allocationsSpread.slice(creamTokenIndex + 1)];
  const diff = 100000 - allocationsSpread.reduce((p, c) => p + c); // check for rounding errors
  allocationsSpread[0] = allocationsSpread[0] + diff;
  await hre.run("test-idle-token", {
    idleToken: idleRAI,
    allocations: allocationsSpread,
    unlent: 0,
    whale: '0x26da854f28f2181858ce4aad1cdb0c2027b6465c',
    govTokens: [addresses.IDLE, addresses.stkAAVE.live],
  })
});
