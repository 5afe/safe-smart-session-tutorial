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
  getTrustAttestersAction,
} from '@rhinestone/module-sdk';
import {
  Address,
  Hex,
  encodeAbiParameters,
  encodeFunctionData,
  http,
  pad,
  toBytes,
  toHex,
  zeroAddress,
} from 'viem';
import { SafeSmartAccountClient, pimlicoUrl, publicClient } from './permissionless';
import { privateKeyToAccount } from 'viem/accounts';
import { sendUserOp } from './sendUserOp';
import { createBundlerClient } from 'viem/account-abstraction';
import { sepolia } from 'viem/chains';

const SESSION_CONFIG = {
  usdtAddress: '0xCcE711c9dae1Fd676da911D66Bd5FCdFa4a4361A' as Address,
  smartSessionAddress: SMART_SESSIONS_ADDRESS,
  mintSelector: '0x1249c58b' as Hex,
  transferSelector: '0xa9059cbb' as Hex,
};

const sessionAccount = privateKeyToAccount(process.env.NEXT_PUBLIC_PRIVATE_KEY as Hex);
const sudoPolicy = getSudoPolicy()

// Helper: Generate a session with common policies and structure
export const generateSession = (): Session => ({
  sessionValidator: OWNABLE_VALIDATOR_ADDRESS,
  sessionValidatorInitData: encodeAbiParameters(
    [{ type: 'uint256' }, { type: 'address[]' }],
    [BigInt(1), [sessionAccount.address]]
  ),
  salt: toHex(toBytes('2', { size: 32 })),
  userOpPolicies: [],
  erc7739Policies: { allowedERC7739Content: [], erc1271Policies: [] },
  actions: [
    { actionTarget: SESSION_CONFIG.usdtAddress, actionTargetSelector: SESSION_CONFIG.mintSelector, actionPolicies: [{ policy: sudoPolicy.address, initData: sudoPolicy.initData }] },
    { actionTarget: SESSION_CONFIG.usdtAddress, actionTargetSelector: SESSION_CONFIG.transferSelector, actionPolicies: [{ policy: sudoPolicy.address, initData: sudoPolicy.initData }] },
  ],
});

// Helper: Encapsulate user operation creation and bundling
const createBundler = () => createBundlerClient({ paymaster: true, client: publicClient, transport: http(pimlicoUrl), chain: sepolia });

// Helper: Run a session user operation
const executeUserOperation = async (safe: SafeSmartAccountClient, calls: { to: Address; value: bigint; data: Hex }[]) => {
  const userOpHash = await safe.sendUserOperation({ calls });
  const bundlerClient = createBundler();
  const receipt = await bundlerClient.waitForUserOperationReceipt({ hash: userOpHash });
  return receipt.receipt.transactionHash;
};

// Install session module
export const installSessionModule = async (safe: SafeSmartAccountClient, session: Session) => {
  const sessionValidator = getSmartSessionsValidator({ sessions: [session], hook: zeroAddress });
  const trustAttestersAction = getTrustAttestersAction({ threshold: 1, attesters: [RHINESTONE_ATTESTER_ADDRESS, MOCK_ATTESTER_ADDRESS] });
  return await executeUserOperation(safe, [
    { to: trustAttestersAction.to, value: 0n, data: trustAttestersAction.callData },
    {
      to: safe.account.address,
      value: 0n,
      data: encodeFunctionData({
        abi: [{ name: 'installModule', type: 'function', stateMutability: 'nonpayable', inputs: [{ type: 'uint256', name: 'moduleTypeId' }, { type: 'address', name: 'module' }, { type: 'bytes', name: 'initData' }], outputs: [] }],
        functionName: 'installModule',
        args: [1n, SESSION_CONFIG.smartSessionAddress, sessionValidator.initData || '0x'],
      }),
    },
  ]);
};

// Run a session key transaction
export const sessionKeyTransaction = async (safe: SafeSmartAccountClient, permissionId: Hex, target: Address, value: bigint, callData: Hex) => {
  const ophash = await sendUserOp({
    account: safe.account,
    actions: [{ target, value, callData }],
    key: BigInt(pad(SESSION_CONFIG.smartSessionAddress, { dir: 'right', size: 24 })),
    signUserOpHash: async (userOpHash) => {
      const signature = await sessionAccount.signMessage({ message: { raw: userOpHash } });
      return encodeSmartSessionSignature({ mode: SmartSessionMode.USE, permissionId, signature });
    },
    getDummySignature: async () => encodeSmartSessionSignature({ mode: SmartSessionMode.USE, permissionId, signature: getOwnableValidatorMockSignature({ threshold: 1 }) }),
  });

  const bundlerClient = createBundler();
  const receipt = await bundlerClient.waitForUserOperationReceipt({ hash: ophash });
  return receipt.receipt.transactionHash;
};

// Update a session with enable/remove actions
export const updateSession = async (safe: SafeSmartAccountClient, session: Session) => {
  const removeAction = getRemoveSessionAction({ permissionId: (await getPermissionId({ session })) as Hex });
  const enableAction = getEnableSessionsAction({ sessions: [session] });
  return await executeUserOperation(safe, [
    { to: removeAction.to, value: 0n, data: removeAction.data },
    { to: enableAction.to, value: 0n, data: enableAction.data },
  ]);
};
