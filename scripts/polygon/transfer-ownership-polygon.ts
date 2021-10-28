import { BigNumber } from "ethers";
import { task } from "hardhat/config"
import { LedgerSigner } from "@ethersproject/hardware-wallets";
import {SafeEthersSigner, SafeService} from "@gnosis.pm/safe-ethers-adapters"

const addrs = require("../../common/addresses");
const addr0 = addrs.addr0;
// const ERC20_ABI = require("../abi/ERC20.json")
const toBN = function(v: any): BigNumber { return BigNumber.from(v.toString()) };
const assertEqualAddress = (a: string, b: string) => {
  if (a.toLowerCase() !== b.toLowerCase()) {
    throw(`expected address ${a} to be equal to ${b}`);
  }
}

export default task("transfer-ownership-polygon", "Transfer ownership", async(_, hre) => {
  const isLocalNet = hre.network.name == 'hardhat';
  let signer;
  if (isLocalNet) {
    await hre.network.provider.send("hardhat_impersonateAccount", [addrs.polygonDev])
    signer = await hre.ethers.getSigner(addrs.polygonDev)
    await hre.network.provider.send("hardhat_setBalance", [addrs.polygonDev, "0xffffffffffffffff"])
  } else {
    signer = new LedgerSigner(hre.ethers.provider, undefined, "m/44'/60'/0'/0/0");
    // const service = new SafeService('https://safe-transaction.gnosis.io/')
    // signer = await SafeEthersSigner.create(ADDRESSES.devLeagueMultisig, signer, service, hre.ethers.provider)
  }

  const proxyAdminAddress = addrs.proxyAdminPolygon;
  const oracleV3Address = addrs.priceOracleV3Matic;
  const idleTokenAddresses = [
    addrs.maticIdleDAIV4,
    addrs.maticIdleUSDCV4,
    addrs.maticIdleWETHV4
  ];
  const newAdminAddress = addrs.treasuryMultisigMatic;

  if (!newAdminAddress) {
    console.log("set the newAdminAddress variable");
    return;
  }

  console.log(`newAdminAddress ${newAdminAddress}`);

  // IDLE TOKENS
  for (var i = 0; i < idleTokenAddresses.length; i++) {
    let idleToken = await hre.ethers.getContractAt((await hre.artifacts.readArtifact("IOwnable")).abi, idleTokenAddresses[i]);
    idleToken = idleToken.connect(signer);
    console.log("setting new owner to IdleToken ", idleTokenAddresses[i]);
    await idleToken.transferOwnership(newAdminAddress);
    assertEqualAddress(newAdminAddress, await idleToken.owner());
  }

  // PROXY ADMIN
  let proxyAdmin = await hre.ethers.getContractAt((await hre.artifacts.readArtifact("IProxyAdmin")).abi, proxyAdminAddress);
  proxyAdmin = proxyAdmin.connect(signer);
  console.log("setting new admin to ProxyAdmin ", proxyAdminAddress);
  await proxyAdmin.transferOwnership(newAdminAddress);
  assertEqualAddress(newAdminAddress, await proxyAdmin.owner());

  // ORACLE IOwnable
  let oracle = await hre.ethers.getContractAt((await hre.artifacts.readArtifact("IOwnable")).abi, oracleV3Address);
  oracle = oracle.connect(signer);
  console.log("setting new admin to Oracle", oracleV3Address);
  await oracle.transferOwnership(newAdminAddress);
  assertEqualAddress(newAdminAddress, await oracle.owner());
})
