export const CHAIN_ID = 420420777n;
export const CHAIN_ID_HEX = '0x190f1ca9';
export const RPC = 'https://test-evm-rpc-v3.portaldot.dev';
export const TOKEN = import.meta.env.VITE_PUSD_ADDRESS || '0x00001E6100000000000000000000000000010000';
export const CONTRACT_ADDRESS = import.meta.env.VITE_SETLORA_CONTRACT_ADDRESS || '';
export const CONTRACT_ABI = [
  'function settle(uint256[] invoiceNumbers,address[] recipients,uint256[] amounts) external',
  'function isSettled(address payer,uint256 invoiceNumber) view returns (bool)',
  'function token() view returns (address)',
  'event InvoiceSettled(address indexed payer,uint256 indexed invoiceNumber,address indexed recipient,uint256 amount)',
  'event BatchSettled(address indexed payer,uint256 count,uint256 total)'
];
export const ERC20_ABI = [
  'function decimals() view returns (uint8)',
  'function balanceOf(address) view returns (uint256)',
  'function allowance(address,address) view returns (uint256)',
  'function approve(address,uint256) returns (bool)'
];
