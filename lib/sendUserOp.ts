import { Account, Address, Hex, http, pad } from 'viem'
import { sepolia } from 'viem/chains'
import { entryPoint07Address, getUserOperationHash } from 'viem/account-abstraction'
import { pimlicoClient, pimlicoUrl, publicClient } from './permissionless'
import { getAccountNonce } from 'permissionless/actions'
import { createSmartAccountClient } from 'permissionless'
import { erc7579Actions } from 'permissionless/actions/erc7579'

export type ExecuteAction = {
  target: Address
  value: BigInt
  callData: Hex
}

type SendUserOpParams = {
  actions: ExecuteAction[]
  account: Account
  signUserOpHash?: (userOpHash: Hex) => Promise<Hex>
  getDummySignature?: () => Promise<Hex>
  key?: bigint
}

export const sendUserOp = async ({
  actions,
  account,
  signUserOpHash,
  getDummySignature,
  key
}: SendUserOpParams) => {
  const accountCopy = {...account}
  const smartClient = createSmartAccountClient({
    account: accountCopy,
    chain: sepolia,
    bundlerTransport: http(pimlicoUrl),
    paymaster: pimlicoClient,
    userOperation: {
      estimateFeesPerGas: async () => {
        return (await pimlicoClient.getUserOperationGasPrice()).fast
      },
    },
  }).extend(erc7579Actions())


  const nonce = await getAccountNonce(publicClient, {
    address: account.address,
    entryPointAddress: entryPoint07Address,
    key
  })
  const signUserOpOriginal = smartClient.account!.signUserOperation
  const getStubOriginal = smartClient.account!.getStubSignature

  if (signUserOpHash) {
    smartClient.account!.signUserOperation = async (userOp:any): Promise<Hex> => {
      const hash = getUserOperationHash({
        userOperation: userOp,
        chainId: sepolia.id,
        entryPointVersion: "0.7",
        entryPointAddress: entryPoint07Address
    })

      return signUserOpHash(hash)
    }
  }

  if (getDummySignature) {
    smartClient.account!.getStubSignature = async (): Promise<Hex> => {
      return getDummySignature()
    }
  }

  const hash = await smartClient.sendUserOperation({
    account: smartClient.account!,
    calls: actions.map((action) => ({
      to: action.target,
      data: action.callData,
      value: action.value as bigint,
    })),
    nonce,
  })
  smartClient.account!.signUserOperation = signUserOpOriginal
  smartClient.account!.getStubSignature = getStubOriginal
  return hash
}
