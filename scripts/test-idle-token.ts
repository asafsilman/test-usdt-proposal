import { BigNumber, Contract } from "ethers";
import { task } from "hardhat/config"

const addresses = require("./addresses")
const toBN = function(v: any): BigNumber { return BigNumber.from(v.toString()) };

export default task("test-idle-token", "Test an idleToken by doing a rebalance", async (args: any, hre) => {
    const REBALANCER = addresses.rebalancerManager;
    await hre.network.provider.send("hardhat_impersonateAccount", [REBALANCER])
    let rebalancer = await hre.ethers.getSigner(REBALANCER)

    if (!args.idleToken || !args.allocations || args.allocations.length === 0) {
      console.log('Error missing task args');
      return;
    }

    let unlent = args.unlent || 0;
    let whale = args.whale || '';
    let idleToken = args.idleToken.connect(rebalancer)
    let allocations = args.allocations;

    const waitBlocks = async (n: number) => {
      console.log(`mining ${n} blocks...`);
      for (var i = 0; i < n; i++) {
        await hre.ethers.provider.send("evm_mine", []);
      };
    }

    const setAllocationsAndRebalance = async (idleToken: Contract, allocations: number[], unlent: number, whale: string) => {
        const underlying = await idleToken.token();
        const underlyingContract = await hre.ethers.getContractAt("IERC20Detailed", underlying);
        const tokenDecimals = await underlyingContract.decimals();
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

    const mintAndRedeem = async (account: any) => {
      const underlying = await idleToken.token();
      const underlyingContract = await hre.ethers.getContractAt("IERC20Detailed", underlying);
      const idleContract = await hre.ethers.getContractAt("IERC20Detailed", addresses.IDLE);
      const tokenDecimals = await underlyingContract.decimals();
      const oneToken = toBN(`10`).pow(tokenDecimals);

      whale = "0xc3d03e4f041fd4cd388c549ee2a29a9e5075882f";
      const whaleSigner = await hre.ethers.getSigner(whale);
      await hre.ethers.provider.send("hardhat_setBalance", [whale, "0xffffffffffffffff"])
      await hre.network.provider.request({
        method: "hardhat_impersonateAccount",
        params: [whale],
      });

      console.log("underlying", underlyingContract.address, await underlyingContract.name());
      console.log("whale", whale)
      console.log("whale balance", (await underlyingContract.balanceOf(whale)).toString())

      const amount = oneToken.mul(toBN("100"));
      await underlyingContract.connect(whaleSigner).transfer(account.address, amount);
      await underlyingContract.connect(account).approve(idleToken.address, amount);
      await idleToken.connect(account).mintIdleToken(amount, true, addresses.addr0);

      await waitBlocks(1000);
      console.log("IDLE balance before", (await idleContract.balanceOf(account.address)).toString());
      const balance = await idleToken.balanceOf(account.address);
      await idleToken.connect(account).redeemIdleToken(balance);
      console.log("IDLE balance after", (await idleContract.balanceOf(account.address)).toString());
    }

    const govTokens = await idleToken.getGovTokens();
    console.log(`Gov Tokens (${govTokens.length}): `);
    for (let i = 0; i < govTokens.length; i++) {
      const govToken = await hre.ethers.getContractAt("IERC20Detailed", govTokens[i]);
      console.log("- ", await govToken.name(), govToken.address);
    }

    const accounts = await hre.ethers.getSigners();
    await setAllocationsAndRebalance(idleToken, allocations, unlent, whale);
    await mintAndRedeem(accounts[0]);

})
