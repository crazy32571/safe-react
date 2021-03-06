import { AbiItem } from 'web3-utils'
import contract from 'truffle-contract'
import Web3 from 'web3'
import ProxyFactorySol from '@gnosis.pm/safe-contracts/build/contracts/GnosisSafeProxyFactory.json'
import GnosisSafeSol from '@gnosis.pm/safe-contracts/build/contracts/GnosisSafe.json'
import SafeProxy from '@gnosis.pm/safe-contracts/build/contracts/GnosisSafeProxy.json'
import { ensureOnce } from 'src/utils/singleton'
import memoize from 'lodash.memoize'
import { getWeb3, getNetworkIdFrom } from 'src/logic/wallets/getWeb3'
import { calculateGasOf, calculateGasPrice } from 'src/logic/wallets/ethTransactions'
import { ZERO_ADDRESS } from 'src/logic/wallets/ethAddresses'
import { isProxyCode } from 'src/logic/contracts/historicProxyCode'
import { GnosisSafeProxyFactory } from 'src/types/contracts/GnosisSafeProxyFactory.d';
import { GnosisSafe } from 'src/types/contracts/GnosisSafe.d'

export const SENTINEL_ADDRESS = '0x0000000000000000000000000000000000000001'
export const MULTI_SEND_ADDRESS = '0x8d29be29923b68abfdd21e541b9374737b49cdad'
export const SAFE_MASTER_COPY_ADDRESS = '0x34CfAC646f301356fAa8B21e94227e3583Fe3F5F'
export const DEFAULT_FALLBACK_HANDLER_ADDRESS = '0xd5D82B6aDDc9027B22dCA772Aa68D5d74cdBdF44'
export const SAFE_MASTER_COPY_ADDRESS_V10 = '0xb6029EA3B2c51D09a50B53CA8012FeEB05bDa35A'


let proxyFactoryMaster
let safeMaster

const createGnosisSafeContract = (web3: Web3) => {
  const gnosisSafe = contract(GnosisSafeSol)
  gnosisSafe.setProvider(web3.currentProvider)

  return gnosisSafe
}

const createProxyFactoryContract = (web3: Web3, networkId: number): GnosisSafeProxyFactory => {
  const contractAddress = ProxyFactorySol.networks[networkId].address
  const proxyFactory = new web3.eth.Contract(ProxyFactorySol.abi as AbiItem[], contractAddress) as unknown as GnosisSafeProxyFactory

  return proxyFactory
}

export const getGnosisSafeContract = memoize(createGnosisSafeContract)
const getCreateProxyFactoryContract = memoize(createProxyFactoryContract)

const instantiateMasterCopies = async () => {
  const web3 = getWeb3()
  const networkId = await getNetworkIdFrom(web3)

  // Create ProxyFactory Master Copy
  proxyFactoryMaster = getCreateProxyFactoryContract(web3, networkId)

  // Initialize Safe master copy
  const GnosisSafe = getGnosisSafeContract(web3)
  safeMaster = await GnosisSafe.deployed()
}

// ONLY USED IN TEST ENVIRONMENT
const createMasterCopies = async () => {
  const web3 = getWeb3()
  const accounts = await web3.eth.getAccounts()
  const userAccount = accounts[0]

  const ProxyFactory = getCreateProxyFactoryContract(web3, 4441)
  proxyFactoryMaster = await ProxyFactory.deploy({ data: GnosisSafeSol.bytecode }).send({ from: userAccount, gas: 5000000 })

  const GnosisSafe = getGnosisSafeContract(web3)
  safeMaster = await GnosisSafe.new({ from: userAccount, gas: '7000000' })
}

export const initContracts = process.env.NODE_ENV === 'test' ? ensureOnce(createMasterCopies) : instantiateMasterCopies

export const getSafeMasterContract = async () => {
  await initContracts()

  return safeMaster
}

export const getSafeDeploymentTransaction = (safeAccounts, numConfirmations) => {
  const gnosisSafeData = safeMaster.contract.methods
    .setup(safeAccounts, numConfirmations, ZERO_ADDRESS, '0x', DEFAULT_FALLBACK_HANDLER_ADDRESS, ZERO_ADDRESS, 0, ZERO_ADDRESS)
    .encodeABI()

  return proxyFactoryMaster.methods.createProxy(safeMaster.address, gnosisSafeData)
}

export const estimateGasForDeployingSafe = async (
  safeAccounts,
  numConfirmations,
  userAccount,
) => {
  const gnosisSafeData = await safeMaster.contract.methods
    .setup(safeAccounts, numConfirmations, ZERO_ADDRESS, '0x', DEFAULT_FALLBACK_HANDLER_ADDRESS, ZERO_ADDRESS, 0, ZERO_ADDRESS)
    .encodeABI()
  const proxyFactoryData = proxyFactoryMaster.methods
    .createProxy(safeMaster.address, gnosisSafeData)
    .encodeABI()
  const gas = await calculateGasOf(proxyFactoryData, userAccount, proxyFactoryMaster.address)
  const gasPrice = await calculateGasPrice()

  return gas * parseInt(gasPrice, 10)
}

export const getGnosisSafeInstanceAt = async (safeAddress: string): Promise<GnosisSafe> => {
  const web3 = getWeb3()
  const gnosisSafe = await new web3.eth.Contract(GnosisSafeSol.abi as AbiItem[], safeAddress) as unknown as GnosisSafe

  return gnosisSafe
}

const cleanByteCodeMetadata = (bytecode: string): string => {
  const metaData = 'a165'
  return bytecode.substring(0, bytecode.lastIndexOf(metaData))
}

export const validateProxy = async (safeAddress: string): Promise<boolean> => {
  // https://solidity.readthedocs.io/en/latest/metadata.html#usage-for-source-code-verification
  const web3 = getWeb3()
  const code = await web3.eth.getCode(safeAddress)
  const codeWithoutMetadata = cleanByteCodeMetadata(code)
  const supportedProxies = [SafeProxy]
  for (let i = 0; i < supportedProxies.length; i += 1) {
    const proxy = supportedProxies[i]
    const proxyCode = proxy.deployedBytecode
    const proxyCodeWithoutMetadata = cleanByteCodeMetadata(proxyCode)
    if (codeWithoutMetadata === proxyCodeWithoutMetadata) {
      return true
    }
  }


  return isProxyCode(codeWithoutMetadata)
}
