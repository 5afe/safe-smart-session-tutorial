import { Chain, HttpTransport, bytesToBigInt, createPublicClient, http } from 'viem'
import { SmartAccountClient, createSmartAccountClient } from "permissionless"
import { sepolia } from 'viem/chains'
import { Erc7579Actions, erc7579Actions } from 'permissionless/actions/erc7579'
import { ToSafeSmartAccountReturnType, toSafeSmartAccount } from "permissionless/accounts"
import {
  createPimlicoClient,
} from 'permissionless/clients/pimlico'
import { entryPoint07Address } from "viem/account-abstraction"
import { randomBytes } from 'crypto'

export enum OperationType {
  Call, // 0
  DelegateCall // 1
}

export interface MetaTransactionData {
  to: string
  value: string
  data: string
  operation?: OperationType
}

export type SafeSmartAccountClient = SmartAccountClient<HttpTransport, Chain, ToSafeSmartAccountReturnType<'0.7'>> & Erc7579Actions<ToSafeSmartAccountReturnType<'0.7'>>

const rpc_url = 'https://ethereum-sepolia-rpc.publicnode.com'
export const pimlicoUrl = `https://api.pimlico.io/v2/sepolia/rpc?apikey=${process.env.NEXT_PUBLIC_PIMLICO_API_KEY}`
export const safe4337ModuleAddress = '0x3Fdb5BC686e861480ef99A6E3FaAe03c0b9F32e2'
export const erc7579LaunchpadAddress = '0xEBe001b3D534B9B6E2500FB78E67a1A137f561CE'
export const PAYMASTER_ADDRESS = '0x0000000000325602a77416A16136FDafd04b299f' // SEPOLIA


export const publicClient = createPublicClient({
  chain: sepolia,
  transport: http(rpc_url),
})

export const pimlicoClient = createPimlicoClient({
  transport: http(pimlicoUrl),
  entryPoint: {
    address: entryPoint07Address,
    version: "0.7",
  },
})

export const getSmartAccountClient = async (signer: any, nonceKey?: bigint) => {
  const nonce = nonceKey? nonceKey : bytesToBigInt(randomBytes(4))
  const safeAccount = await toSafeSmartAccount({
    client: publicClient,
    owners: [signer],

    safe4337ModuleAddress, // These are not meant to be used in production as of now.
    erc7579LaunchpadAddress, // These are not meant to be used in production as of now.
    entryPoint: {
      address: entryPoint07Address,
      version: "0.7",
    }, // global entrypoint
    nonceKey: nonce,
    saltNonce: nonce,
    version: "1.4.1",
  })

  console.log(`Smart account address: https://sepolia.etherscan.io/address/${safeAccount.address}`)
  const smartAccountClient = createSmartAccountClient({
    account: safeAccount,
    chain: sepolia,
    bundlerTransport: http(pimlicoUrl),
    paymaster: pimlicoClient,
    userOperation: {
      estimateFeesPerGas: async () => {
        return (await pimlicoClient.getUserOperationGasPrice()).fast
      },
    },
  }).extend(erc7579Actions())



  return {safe: smartAccountClient as unknown as SafeSmartAccountClient, nonce}
}