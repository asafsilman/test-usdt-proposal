import { subtask } from "hardhat/config"
import { AbiCoder } from "@ethersproject/abi";
import { Contract } from "@ethersproject/contracts";

const addresses = require("./addresses")

const deployWrapperProxy = async (
    proxyFactory: Contract,
    implementationAddress: string,
    tokenAddress: string,
    idleTokenAddress: string,
    ownerAddress: string,
    from: string) => {
    const initSig = "initialize(address,address,address)";
    const abiCoder = new AbiCoder()
    const initData = abiCoder.encode(
        ['address', 'address', 'address'],
        [tokenAddress, idleTokenAddress, ownerAddress]
    )
    // const initData = web3.eth.abi.encodeParameters(
    //     ["address", "address", "address"],
    //     [tokenAddress, idleTokenAddress, ownerAddress]
    // );

    console.log("initSig", initSig);
    console.log("initData", initData);

    const result = await proxyFactory.createAndCall(implementationAddress, initSig, initData, { from: from });
    const receipt = await result.wait()
    const wrapperAddress = receipt.events[receipt.events.length-1].args.proxy;
    return wrapperAddress;
}

export default subtask("deploy-contracts", "Deploy contract for proposal", async(_, hre) => {
    // SETUP
    const network = 'mainnet' // for testing purposes

    const IDLE_WHALE = "0xe8eA8bAE250028a8709A3841E0Ae1a44820d677b"
    const DEPLOYER = hre.waffle.provider.getWallets()[0]
  
    await hre.network.provider.send("hardhat_impersonateAccount", [IDLE_WHALE])
    await hre.network.provider.send("hardhat_setBalance", [IDLE_WHALE, "0xffffffffffffffff"])

    const proxyFactory = await hre.ethers.getContractAt(
        "MinimalInitializableProxyFactory",
        addresses.minimalInitializableProxyFactory[network]
    )

    const IdleCompoundLikeImplementation = await hre.ethers.getContractFactory("IdleCompoundLike")
    const idleCompoundLikeImplementation = await IdleCompoundLikeImplementation.deploy()

    const idleUSDTv4 = await hre.ethers.getContractAt(
        require("../abi/IdleTokenGovernance.json"),
        addresses.idleUSDTV4
    )

    console.log(`Deployed implementation to ${idleCompoundLikeImplementation.address}`)

    const crUSDT = addresses.crUSDT[network]

    const usdtCREAMWrapper = await deployWrapperProxy(
        proxyFactory,
        idleCompoundLikeImplementation.address,
        crUSDT,
        idleUSDTv4.address,
        idleUSDTv4.address,
        DEPLOYER.address
    )

    console.log(`Deployed usdtCREAMWrapper to ${usdtCREAMWrapper}`)

    return {
        crUSDT: crUSDT,
        idleUSDTv4: idleUSDTv4,
        usdtCREAMWrapper: usdtCREAMWrapper,
        IDLE_WHALE: IDLE_WHALE,
        CREAM: addresses.CREAM[network]
    }
})
