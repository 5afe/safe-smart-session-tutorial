import { Address, Hex, encodeFunctionData, http, keccak256, stringToHex } from "viem";
import { OperationType, SafeSmartAccountClient, pimlicoClient, pimlicoUrl, publicClient } from "./permissionless";
import { rolesAbi, setUpRolesMod } from "zodiac-roles-sdk";
import { usdtAddress } from "./smartSession";
import { sepolia } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { toSafeSmartAccount } from "permissionless/accounts";
import { createSmartAccountClient } from "permissionless";

const privateKeySession = process.env.NEXT_PUBLIC_PRIVATE_KEY as Hex
const sessionAccount = privateKeyToAccount(privateKeySession)

const getSafeSession = async () => {
    const safeSessionRoles = await toSafeSmartAccount({
        client: publicClient,
        owners: [sessionAccount],
        nonceKey: 1n,
        saltNonce: 1n,
        version: "1.4.1"
    })
    
    const smartAccountClient = createSmartAccountClient({
        account: safeSessionRoles,
        chain: sepolia,
        bundlerTransport: http(pimlicoUrl),
        paymaster: pimlicoClient,
        userOperation: {
          estimateFeesPerGas: async () => {
            return (await pimlicoClient.getUserOperationGasPrice()).fast
          },
        },
      })
      return smartAccountClient
}


export const installRoles = async (safe: SafeSmartAccountClient) => {
    const smartAccountClient = await getSafeSession()
    console.log("Safe install",smartAccountClient.account.address)
    const roleSetup = setUpRolesMod({
        avatar: safe.account.address,
        owner: safe.account.address,
        target: safe.account.address,
        roles: [{
            key: 'DEFAULT',
            members: [smartAccountClient.account.address],
            permissions: [{ targetAddress: usdtAddress }]
        }]
    })
    const calls = roleSetup.map(call => {
        return {
            to: call.to as Address,
            data: call.data as Hex
        }
    }
    )
    const userOpHash = await safe.sendUserOperation({
        calls: calls
    })
    const receipt = await safe.waitForUserOperationReceipt({ hash: userOpHash })
    return receipt.receipt.transactionHash
}

export const rolesMint = async () => {
    const smartAccountClient = await getSafeSession()
    console.log("Safe mint",smartAccountClient.account.address)
    
    const userOpHash = await smartAccountClient.sendUserOperation({
        calls: [
            {
                to: '0xBC8a19D8f48D26A1484D99b571A0129019745603',
                data: encodeFunctionData({
                    abi: rolesAbi,
                    functionName: 'execTransactionWithRole',
                    args:[usdtAddress, 0n, '0x1249c58b', OperationType.Call, stringToHex('DEFAULT', { size: 32 }), false]
                })
            }
        ]
    })
    const receipt = await smartAccountClient.waitForUserOperationReceipt({ hash: userOpHash })
    return receipt.receipt.transactionHash
}