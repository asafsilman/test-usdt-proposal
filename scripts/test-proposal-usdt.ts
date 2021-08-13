import { BigNumber, Contract } from "ethers";
import { task } from "hardhat/config"

const addresses = require("./addresses")
const toBN = function(v: any): BigNumber { return BigNumber.from(v.toString()) };

export default task("test-proposal-usdt", "Test the proposal", async(_, hre) => {
  let info = await hre.run("simulate-proposal");
  await hre.run("test-idle-token", {idleToken: info.idleUSDTv4, allocations: [0, 0, 0, 100000], unlent: 0, whale: ''})
  await hre.run("test-idle-token", {idleToken: info.idleUSDTv4, allocations: [25000, 25000, 25000, 25000], unlent: 0, whale: ''})
});
