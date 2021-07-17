import { BigNumber, Contract } from "ethers";
import { task } from "hardhat/config"

const addresses = require("./addresses")
const toBN = function(v: any): BigNumber { return BigNumber.from(v.toString()) };

export default task("test-proposal", "Test the proposal", async(_, hre) => {
    let proposalInfo = await hre.run("simulate-proposal")

    const REBALANCER = "0xB3C8e5534F0063545CBbb7Ce86854Bf42dB8872B"
    
    await hre.network.provider.send("hardhat_impersonateAccount", [REBALANCER])
    let rebalancer = await hre.ethers.getSigner(REBALANCER)

    let idleUSDTv4 = proposalInfo.idleUSDTv4.connect(rebalancer)

    const setAllocationsAndRebalance = async (idleToken: Contract, allocations: number[], unlent: number, whale: string) => {
        const underlying = await idleToken.token();
        const underlyingContract = await hre.ethers.getContractAt("IERC20Detailed", underlying);
        const tokenDecimals = await underlyingContract.decimals();
        // console.log('tokenDecimals', tokenDecimals.toString());
        const oneToken = toBN(`10`).pow(tokenDecimals);
        console.log(`decimals: ${tokenDecimals}`)
        console.log("total supply", (await idleToken.totalSupply()).toString());
    
        if (unlent) {
          console.log('whale transfer, balance is', (await underlyingContract.balanceOf(whale)).toString());
          const amount = oneToken.mul(toBN(unlent));
          console.log(`amount: ${amount}`)
          await underlyingContract.transfer(idleToken.address, amount, { from: whale });
          console.log('whale transfer complete');
        }
    
        console.log('# unlent balance: ', toBN(await underlyingContract.balanceOf(idleToken.address)).div(oneToken).toString());
        const tokens = (await idleToken.getAPRs())["0"];
        console.log("tokens", tokens.join(", "));
        const idleTokenDecimals = toBN(await idleToken.decimals());
        const idleTokenName = await idleToken.name();
        // const toIdleTokenUnit = v => v.div(toBN("10").pow(idleTokenDecimals));
        console.log("curr allocations", (await idleToken.getAllocations()).map((x: any) => x.toString()));
    
        let bn_allocations = allocations.map<BigNumber>(toBN);
        console.log("new allocations", bn_allocations.toString());
    
        await idleToken.setAllocations(bn_allocations);
        const newAllocations = await idleToken.getAllocations();
        console.log("done setting allocations for", idleTokenName, "-", newAllocations.join(", "));
        console.log("rebalancing");
        const tx = await idleToken.rebalance();
        const receipt = await tx.wait()
        console.log("⛽ rebalancing done GAS SPENT: ", receipt.gasUsed.toString())
    
        console.log('# unlent balance: ', toBN(await underlyingContract.balanceOf(idleToken.address)).div(oneToken).toString());
        for (var i = 0; i < tokens.length; i++) {
            const token = await hre.ethers.getContractAt("IERC20Detailed", tokens[i]);
            const tokenDecimals = toBN(await token.decimals());
            const toTokenUnit = (v: any) => v.div(toBN("10").pow(tokenDecimals));
            const name = await token.name();
            const balance = toTokenUnit(toBN(await token.balanceOf(idleToken.address)));
            console.log("token balance", name, balance.toString());
            // console.log("token balance", name, tokens[i], balance.toString());
        };
    }

    await setAllocationsAndRebalance(idleUSDTv4, [0, 0, 0, 100000], 0, "");
    await setAllocationsAndRebalance(idleUSDTv4, [25000, 25000, 25000, 25000], 0, "");
})
