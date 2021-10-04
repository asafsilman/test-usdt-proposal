import { BigNumber } from "ethers";
import { task } from "hardhat/config"
import { LedgerSigner } from "@ethersproject/hardware-wallets";
import {SafeEthersSigner, SafeService} from "@gnosis.pm/safe-ethers-adapters"

const ADDRESSES = require("../common/addresses")
const IDLE_TOKEN_ABI = require("../abi/IdleTokenGovernance.json")
const IDLE_TOKEN_SAFE_ABI = require("../abi/IdleTokenGovernanceSafe.json")

const FEE_COLLECTOR_ABI = require("../abi/FeeCollector.json")
const GOVERNABLE_FUND_ABI = require("../abi/GovernableFund.json")
const ERC20_ABI = require("../abi/ERC20.json")
const toBN = function(v: any): BigNumber { return BigNumber.from(v.toString()) };

export default task("generic-test", "Deploy IIP 11 to Disable AAVE v1", async(_, hre) => {
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

  let contract = await hre.ethers.getContractAt(IDLE_TOKEN_ABI, ADDRESSES.idleUSDCV4)
  console.log(`${await contract.tokenPrice()}`)
})
