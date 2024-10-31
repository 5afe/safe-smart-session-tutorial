import React, { useEffect, useState } from 'react'
import { SafeSmartAccountClient } from '@/lib/permissionless'
import { Hex, toFunctionSelector, AbiFunction, encodeAbiParameters, encodeFunctionData, Address } from 'viem'
import { debounce } from 'lodash'
import { sessionKeyTransaction } from '@/lib/smartSession'
import { Session, getPermissionId } from '@rhinestone/module-sdk'

interface TransactionBuilderProps {
    safe: SafeSmartAccountClient
    updateTransactionHistory: (hash: string, success: boolean) => void
    enabled: boolean
    session: Session
}

const TransactionBuilder: React.FC<TransactionBuilderProps> = ({ safe, updateTransactionHistory, enabled, session }) => {
    const [contractAddress, setContractAddress] = useState<Address | null>()
    const [contractABI, setContractABI] = useState<AbiFunction[]>([])
    const [loadingABI, setLoadingABI] = useState(false)
    const [abiError, setAbiError] = useState<string | null>(null)
    const [selectedFunction, setSelectedFunction] = useState<AbiFunction | null>(null)
    const [parameterValues, setParameterValues] = useState<{ [key: string]: string }>({})
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState(false)

    // Fetch ABI when contract address changes
    useEffect(() => {
        if (!contractAddress) return

        const fetchContractABI = async () => {
            setLoadingABI(true)
            setAbiError(null)

            try {
                const response = await fetch(`https://abidata.net/${contractAddress}?network=sepolia`)
                const json = await response.json()
                let abi: AbiFunction[] = []

                if (json.abi && json.abi.length) {
                    abi = json.abi.filter(
                        (item: { type: string; stateMutability: string }) =>
                            item.type === 'function' && item.stateMutability === 'nonpayable'
                    )
                }

                if (abi.length === 0) {
                    abi.push({ name: 'native-transfer', inputs: [], outputs: [], type: 'function', stateMutability: 'payable' }) // Fallback for native transfer
                }

                setContractABI(abi)
            } catch {
                setAbiError('Failed to fetch contract ABI. Please check the address.')
                setContractABI([{ name: 'native-transfer', inputs: [], outputs: [], type: 'function', stateMutability: 'payable' }])
            } finally {
                setLoadingABI(false)
            }
        }

        fetchContractABI()
    }, [contractAddress])

    // Debounced function for handling contract address input
    const handleContractAddressChange = debounce((value: Address) => {
        setContractAddress(value)
    }, 300)

    const handleFunctionChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
        const selectedIndex = event.target.selectedIndex
        const func = contractABI[selectedIndex]
        setSelectedFunction(func)
        // Reset parameter values when function changes
        setParameterValues({})
    }

    const handleParameterChange = (paramName: string, value: string) => {
        setParameterValues((prev) => ({ ...prev, [paramName]: value }))
    }

    const handleSubmit = async () => {
        setLoading(true)
        setError(false)
        if (!contractAddress) return

        try {
            // Encode the parameters based on the function's inputs
            console.log(selectedFunction)
            const callData = encodeFunctionData({
                abi: contractABI,
                functionName: selectedFunction?.name,
                args: Object.values(parameterValues)
            })
            const permissionId = await getPermissionId({
                session,
              }) as Hex
            const txHash = await sessionKeyTransaction(safe, permissionId, contractAddress, 0n, callData)
            updateTransactionHistory(txHash, true)
        } catch (error) {
            setError(true)
            console.log(error)
        } finally {
            setLoading(false)
        }
    }

    return (
        <div style={styles.container}>
            <h3>Transaction Builder</h3>
            <div style={styles.inputGroup}>
                <label>Contract Address:</label>
                <input
                    style={styles.input}
                    onChange={(e) => handleContractAddressChange(e.target.value as Address)}
                />
                {abiError && <p style={{ color: 'red' }}>{abiError}</p>}
            </div>
            <div style={styles.inputGroup}>
                <label>Function Selector:</label>
                <select
                    style={styles.input}
                    onChange={handleFunctionChange}
                    disabled={loadingABI || contractABI.length === 0}
                >
                    {loadingABI ? (
                        <option>Loading ABI...</option>
                    ) : (
                        contractABI.map((func) => (
                            <option key={func.name} value={func.name}>
                                {func.name}
                            </option>
                        ))
                    )}
                </select>
            </div>

            {/* Render input fields for each parameter in the selected function */}
            {selectedFunction && selectedFunction.inputs.length > 0 && (
                <div>
                    <h4>Function Parameters</h4>
                    {selectedFunction.inputs.map((param, index) => (
                        <div key={index} style={styles.inputGroup}>
                            <label>{param.name || `param${index + 1}`} ({param.type}):</label>
                            <input
                                style={styles.input}
                                value={parameterValues[param.name as string] || ''}
                                onChange={(e) => handleParameterChange(param.name as string, e.target.value)}
                            />
                        </div>
                    ))}
                </div>
            )}

            <button
                style={styles.button}
                onClick={handleSubmit}
                disabled={loading || !contractAddress || !selectedFunction || enabled}
            >
                {loading ? 'Processing...' : 'Send Transaction'}
            </button>
            {error && <p style={{ color: 'red' }}>Transaction failed. Please try again.</p>}
        </div>
    )
}

const styles = {
    container: { marginTop: '20px', padding: '10px' },
    inputGroup: { marginBottom: '10px' },
    input: { padding: '8px', width: '100%' },
    button: { padding: '10px', cursor: 'pointer' },
}

export default TransactionBuilder
