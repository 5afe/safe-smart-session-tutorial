import {
  MOCK_ATTESTER_ADDRESS,
  OWNABLE_VALIDATOR_ADDRESS,
  RHINESTONE_ATTESTER_ADDRESS,
  SMART_SESSIONS_ADDRESS,
  Session,
  SmartSessionMode,
  encodeSmartSessionSignature,
  getEnableSessionsAction,
  getOwnableValidatorMockSignature,
  getPermissionId,
  getRemoveSessionAction,
  getSmartSessionsValidator,
  getSudoPolicy,
  getTrustAttestersAction
} from '@rhinestone/module-sdk'
import { Account, Address, Hex, encodeAbiParameters, encodeFunctionData, erc20Abi, http, pad, toBytes, toHex, zeroAddress } from 'viem'
import { SafeSmartAccountClient, pimlicoUrl, publicClient } from './permissionless';
import { privateKeyToAccount } from 'viem/accounts';
import { sendUserOp } from './sendUserOp';
import { createBundlerClient } from 'viem/account-abstraction';
import { sepolia } from 'viem/chains';

export const STORAGE_PASSKEY_LIST_KEY = 'safe_passkey_list'

const privateKeySession = process.env.NEXT_PUBLIC_PRIVATE_KEY as Hex
const sessionAccount = privateKeyToAccount(privateKeySession)
export const usdtAddress = "0xCcE711c9dae1Fd676da911D66Bd5FCdFa4a4361A" as Address
const mintSelector = '0x1249c58b' as Hex
const transferSelector = '0xa9059cbb' as Hex

const actionMint = {
  actionTarget: usdtAddress,
  actionTargetSelector: mintSelector,
  actionPolicies: [
    {
      policy: getSudoPolicy().address,
      initData: getSudoPolicy().initData,
    },
  ],
}
const actionTransfer = {
  actionTarget: usdtAddress,
  actionTargetSelector: transferSelector,
  actionPolicies: [
    {
      policy: getSudoPolicy().address,
      initData: getSudoPolicy().initData,
    },
  ],
}
export const defaultSession = {
  sessionValidator: OWNABLE_VALIDATOR_ADDRESS,
  sessionValidatorInitData: encodeAbiParameters(
    [
      {
        type: 'uint256',
      },
      {
        type: 'address[]',
      },
    ],
    [
      BigInt(1),
      [sessionAccount.address],
    ]
  ),
  salt: toHex(toBytes('2', { size: 32 })),
  userOpPolicies: [],
  erc7739Policies: {
    allowedERC7739Content: [],
    erc1271Policies: [],
  },
  actions: [
    actionMint,
    actionTransfer,
  ],
} as Session

export const install7579SessionModule = async (
  safe: SafeSmartAccountClient,
  session: Session
) => {
  const sessionValidator = getSmartSessionsValidator({
    sessions: [session],
    hook: zeroAddress
  });

  const trustAttestersAction = getTrustAttestersAction({
    threshold: 1,
    attesters: [
      RHINESTONE_ATTESTER_ADDRESS, // Rhinestone Attester
      MOCK_ATTESTER_ADDRESS, // Mock Attester - do not use in production
    ],
  });

  const userOpHash = await safe.sendUserOperation({
    calls: [
      {
        to: trustAttestersAction.to,
        data: trustAttestersAction.callData
      },
      {
        to: safe.account.address,
        value: BigInt(0),
        data: encodeFunctionData({
          abi: [
            {
              name: 'installModule',
              type: 'function',
              stateMutability: 'nonpayable',
              inputs: [
                {
                  type: 'uint256',
                  name: 'moduleTypeId'
                },
                {
                  type: 'address',
                  name: 'module'
                },
                {
                  type: 'bytes',
                  name: 'initData'
                }
              ],
              outputs: []
            }
          ],
          functionName: 'installModule',
          args: [
            1n,
            SMART_SESSIONS_ADDRESS,
            sessionValidator.initData || '0x'
          ]
        })
      },
    ],
  })

  const receipt = await safe.waitForUserOperationReceipt({ hash: userOpHash })
  return receipt.receipt.transactionHash
}

export const sessionKeyMint = async (safe: SafeSmartAccountClient, session: Session) => {
  const permissionId = (await getPermissionId({
    session,
  })) as Hex
  const ophash = await sendUserOp({
    account: safe.account as Account,
    actions: [
      {
        target: actionMint.actionTarget,
        value: BigInt(0),
        callData: actionMint.actionTargetSelector,
      },
    ],
    key: BigInt(
      pad(SMART_SESSIONS_ADDRESS, {
        dir: 'right',
        size: 24,
      }),
    ),
    signUserOpHash: async (userOpHash) => {
      const signer = privateKeyToAccount(privateKeySession)

      const signature = await signer.signMessage({
        message: { raw: userOpHash },
      })

      return encodeSmartSessionSignature({
        mode: SmartSessionMode.USE,
        permissionId,
        signature,
      })
    },
    getDummySignature: async () => {
      return encodeSmartSessionSignature({
        mode: SmartSessionMode.USE,
        permissionId,
        signature: getOwnableValidatorMockSignature({
          threshold: 1,
        }),
      })
    },
  })

  const bundlerClient = createBundlerClient({
    paymaster: true,
    client: publicClient,
    transport: http(pimlicoUrl),
    chain: sepolia
  })

  const receipt = await bundlerClient.waitForUserOperationReceipt({ hash: ophash })

  return receipt.receipt.transactionHash
}

export const sessionKeyERC20Transfer = async (safe: SafeSmartAccountClient, to: Hex, value: bigint, session: Session) => {
  const permissionId = (await getPermissionId({
    session,
  })) as Hex
  const callData = encodeFunctionData({
    abi: erc20Abi,
    functionName: 'transfer',
    args: [to, value]
  })
  const ophash = await sendUserOp({
    account: safe.account as Account,
    actions: [
      {
        target: actionTransfer.actionTarget,
        value: BigInt(0),
        callData: callData,
      },
    ],
    key: BigInt(
      pad(SMART_SESSIONS_ADDRESS, {
        dir: 'right',
        size: 24,
      }),
    ),
    signUserOpHash: async (userOpHash) => {
      const signer = privateKeyToAccount(privateKeySession)

      const signature = await signer.signMessage({
        message: { raw: userOpHash },
      })

      return encodeSmartSessionSignature({
        mode: SmartSessionMode.USE,
        permissionId,
        signature,
      })
    },
    getDummySignature: async () => {
      return encodeSmartSessionSignature({
        mode: SmartSessionMode.USE,
        permissionId,
        signature: getOwnableValidatorMockSignature({
          threshold: 1,
        }),
      })
    },
  })

  const bundlerClient = createBundlerClient({
    paymaster: true,
    client: publicClient,
    transport: http(pimlicoUrl),
    chain: sepolia
  })

  const receipt = await bundlerClient.waitForUserOperationReceipt({ hash: ophash, timeout: 1000000000 })

  return receipt.receipt.transactionHash
}

export const sessionKeyNativeTransfer = async (safe: SafeSmartAccountClient, to: Hex, value: bigint, session: Session) => {
  const permissionId = (await getPermissionId({
    session,
  })) as Hex
  const ophash = await sendUserOp({
    account: safe.account as Account,
    actions: [
      {
        target: to,
        value: BigInt(value),
        callData: '0x00000000',
      },
    ],
    key: BigInt(
      pad(SMART_SESSIONS_ADDRESS, {
        dir: 'right',
        size: 24,
      }),
    ),
    signUserOpHash: async (userOpHash) => {
      const signer = privateKeyToAccount(privateKeySession)

      const signature = await signer.signMessage({
        message: { raw: userOpHash },
      })

      return encodeSmartSessionSignature({
        mode: SmartSessionMode.USE,
        permissionId,
        signature,
      })
    },
    getDummySignature: async () => {
      return encodeSmartSessionSignature({
        mode: SmartSessionMode.USE,
        permissionId,
        signature: getOwnableValidatorMockSignature({
          threshold: 1,
        }),
      })
    },
  })

  const bundlerClient = createBundlerClient({
    paymaster: true,
    client: publicClient,
    transport: http(pimlicoUrl),
    chain: sepolia
  })

  const receipt = await bundlerClient.waitForUserOperationReceipt({ hash: ophash, timeout: 1000000000 })

  return receipt.receipt.transactionHash
}

export const updateSession = async (safe: SafeSmartAccountClient, session: Session) => {
  const removeAction = getRemoveSessionAction({
    permissionId: (await getPermissionId({
      session,
    })) as Hex
  })
  const enableAction = getEnableSessionsAction({
    sessions: [session]
  })
  const bundlerClient = createBundlerClient({
    paymaster: true,
    client: publicClient,
    transport: http(pimlicoUrl),
    chain: sepolia
  })
  const userOpHash = await safe.sendUserOperation({
    calls: [{
      to: removeAction.to,
      value: 0n,
      data: removeAction.data
    },{
      to: enableAction.to,
      value: 0n,
      data: enableAction.data
    }]
  })
  const receipt = await bundlerClient.waitForUserOperationReceipt({ hash: userOpHash })
  return receipt.receipt.transactionHash
}