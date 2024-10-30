import { AbiFunction, Address, Hex, parseAbi, toFunctionSelector } from 'viem';
import React, { useEffect, useState } from 'react';
import { ActionData } from '@rhinestone/module-sdk';
import { debounce } from 'lodash'; // Optional: Use debounce to improve input handling

interface ActionRowProps {
    action: ActionData;
    index: number;
    onInputChange: (index: number, field: 'actionTarget' | 'actionTargetSelector', value: Address | Hex) => void;
    onRemove: (index: number) => void;
}

const ActionRow: React.FC<ActionRowProps> = ({ action, index, onInputChange, onRemove }) => {
    const [contractAddress, setContractAddress] = useState<Hex>(action.actionTarget);
    const [contractABI, setContractABI] = useState<any>(null);
    const [loadingABI, setLoadingABI] = useState<boolean>(false); // Loading state
    const [abiError, setAbiError] = useState<string | null>(null)

    useEffect(() => {
        if (!contractAddress) return; // Prevent fetching if the address is not set

        const fetchContractABI = async () => {
            try {
                setLoadingABI(true); // Set loading state to true
                const response = await fetch(`https://abidata.net/${contractAddress}?network=sepolia`);
                const json = await response.json();
                let abi = []
                if (json.abi[1].name !== 'CloseStream') { // Somehow etherscan provides an ABI for EOA wallet.
                    abi = json.abi.filter((line: { type: string; stateMutability: string }) => {
                        return line.type === 'function' && line.stateMutability === 'nonpayable';
                    });
                }
                abi.push({ name: 'native-transfer' })
                setContractABI(abi);
                setAbiError(null);
            } catch (error) {
                setAbiError('Failed to fetch contract ABI');
                setContractABI([{ name: 'native-transfer' }]);
            } finally {
                setLoadingABI(false); // Set loading state to false
            }
        };

        fetchContractABI();
    }, [contractAddress]);

    // Debounce contract address input handling (prevents too many fetches)
    const handleAddressBlur = debounce((value: Address) => {
        onInputChange(index, 'actionTarget', value);
        setContractAddress(value);
    }, 300); // 300ms debounce delay

    return (
        <tr>
            <td style={{ border: '1px solid #ccc', padding: '8px' }}>
                {abiError && <div style={{ color: 'red' }}>{abiError + " Please enter an address"}</div>} {/* Error message */}

                <input
                    type="text"
                    defaultValue={action.actionTarget}
                    onBlur={(e) => handleAddressBlur(e.target.value as Address)}
                />
            </td>
            <td style={{ border: '1px solid #ccc', padding: '8px' }}>
                <select
                    defaultValue={action.actionTargetSelector}
                    onChange={(e) => {
                        const selectedIndex = e.target.selectedIndex;
                        let functionSelector = '0x00000000' as Hex;
                        if (e.target.value !== 'native-transfer') {
                            functionSelector = contractABI ? toFunctionSelector(contractABI[selectedIndex]) : '0x';
                        }
                        onInputChange(index, 'actionTargetSelector', functionSelector);
                    }}
                >
                    {loadingABI ? (
                        <option value="">Loading ABI...</option> // Show loading option
                    ) : contractABI ? (
                        contractABI.map((func: AbiFunction) => (
                            <option key={func.name} value={func.name} selected={action.actionTargetSelector == toFunctionSelector(func)}>
                                {func.name}
                            </option>
                        ))
                    ) : (
                        <option value="native-transfer">native transfer</option> // Fallback option
                    )}
                </select>
            </td>
            <td style={{ border: '1px solid #ccc', padding: '8px' }}>
                <button onClick={() => onRemove(index)}>Remove</button>
            </td>
        </tr>
    );
};

export default ActionRow;
