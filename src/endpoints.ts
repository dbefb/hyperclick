export function exchangeNetwork(url:string):'Mainnet'|'Testnet'|undefined {
  if(['https://api.hyperliquid.xyz/exchange','https://api-ui.hyperliquid.xyz/exchange'].includes(url))return 'Mainnet';
  if(['https://api.hyperliquid-testnet.xyz/exchange','https://api-ui.hyperliquid-testnet.xyz/exchange'].includes(url))return 'Testnet';
}
