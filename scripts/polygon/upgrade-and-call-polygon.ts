import { BigNumber } from "ethers";
import { task } from "hardhat/config"
import { LedgerSigner } from "@ethersproject/hardware-wallets";
import {SafeEthersSigner, SafeService} from "@gnosis.pm/safe-ethers-adapters"
const IDLE_TOKEN_ABI = require("../../abi/IdleTokenGovernance.json")

const addrs = require("../../common/addresses");
const toBN = function(v: any): BigNumber { return BigNumber.from(v.toString()) };

export default task("upgrade-and-call-polygon", "Deploy IIP 11 to Disable AAVE v1", async(_, hre) => {
  const isLocalNet = hre.network.name == 'hardhat';
  let signer;
  if (isLocalNet) {
    await hre.network.provider.send("hardhat_impersonateAccount", [addrs.polygonMultisig])
    signer = await hre.ethers.getSigner(addrs.polygonMultisig)
    await hre.network.provider.send("hardhat_setBalance", [addrs.polygonMultisig, "0xffffffffffffffff"])
  } else {
    signer = new LedgerSigner(hre.ethers.provider, undefined, "m/44'/60'/0'/0/0");
    // const service = new SafeService('https://safe-transaction.gnosis.io/')
    // signer = await SafeEthersSigner.create(ADDRESSES.devLeagueMultisig, signer, service, hre.ethers.provider)
  }

  const idleTokensPoly = [
    addrs.maticIdleDAIV4, addrs.maticIdleUSDCV4, addrs.maticIdleWETHV4
  ];

  const newImplementationAddr = "0xC2843221EB7852f4f363c4507aB22Cd5dF05dF2e";
  const proxyAdminAddress = addrs.proxyAdminPolygon;
  let proxyAdmin = await hre.ethers.getContractAt((await hre.artifacts.readArtifact("IProxyAdmin")).abi, proxyAdminAddress);
  proxyAdmin = proxyAdmin.connect(signer);

  const abi = [`function _init()`];
  const iface = new hre.ethers.utils.Interface(abi);
  const initMethodCall = iface.encodeFunctionData("_init", []);

  for (let i = 0; i < idleTokensPoly.length; i++) {
    let idleTokenAddr = idleTokensPoly[i];
    let idleToken = await hre.ethers.getContractAt(IDLE_TOKEN_ABI, idleTokenAddr);
    idleToken = idleToken.connect(signer);
    console.log('upgradeAndCall for ', idleTokenAddr);
    await proxyAdmin.upgrade(idleTokenAddr, newImplementationAddr);
    // await proxyAdmin.upgradeAndCall(idleTokenAddr, newImplementationAddr, initMethodCall);

    // Test rebalance
    // Spread funds between all protocols
    let currentProtocolTokens = [...(await idleToken.getAPRs())["0"]].map(x => x.toLowerCase())
    const allocationsSpread = currentProtocolTokens.map(() => parseInt((100000 / currentProtocolTokens.length).toFixed(0)))
    const diff = 100000 - allocationsSpread.reduce((p, c) => p + c); // check for rounding errors
    allocationsSpread[0] = allocationsSpread[0] + diff;
    console.log('allocationsSpread', allocationsSpread.map(a => a.toString()))
    await hre.run("test-idle-token", {
      idleToken,
      allocations: allocationsSpread,
      unlent: 0,
      whale: '0xba12222222228d8ba445958a75a0704d566bf2c8', // bal v2
      govTokens: ['0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270'] // wmatic
    })
  }
})
