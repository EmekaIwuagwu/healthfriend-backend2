const { ethers } = require('ethers');
const Web3 = require('web3');
const axios = require('axios');
const { logError, logSecurity } = require('./logger');

// Network configurations
const NETWORKS = {
  ethereum: {
    chainId: 1,
    name: 'Ethereum Mainnet',
    rpcUrl: `https://mainnet.infura.io/v3/${process.env.INFURA_PROJECT_ID}`,
    explorer: 'https://etherscan.io',
    nativeCurrency: {
      name: 'Ether',
      symbol: 'ETH',
      decimals: 18
    },
    gasMultiplier: 1.2
  },
  polygon: {
    chainId: 137,
    name: 'Polygon Mainnet',
    rpcUrl: process.env.POLYGON_RPC_URL || `https://polygon-mainnet.infura.io/v3/${process.env.INFURA_PROJECT_ID}`,
    explorer: 'https://polygonscan.com',
    nativeCurrency: {
      name: 'MATIC',
      symbol: 'MATIC',
      decimals: 18
    },
    gasMultiplier: 1.1
  },
  polygonTestnet: {
    chainId: 80001,
    name: 'Polygon Mumbai Testnet',
    rpcUrl: `https://polygon-mumbai.infura.io/v3/${process.env.INFURA_PROJECT_ID}`,
    explorer: 'https://mumbai.polygonscan.com',
    nativeCurrency: {
      name: 'MATIC',
      symbol: 'MATIC',
      decimals: 18
    },
    gasMultiplier: 1.1
  }
};

// Current network (defaults to Polygon)
const CURRENT_NETWORK = NETWORKS[process.env.ETHEREUM_NETWORK] || NETWORKS.polygon;

// Supported tokens
const SUPPORTED_TOKENS = {
  ETH: {
    symbol: 'ETH',
    decimals: 18,
    address: null, // Native token
    networks: ['ethereum']
  },
  MATIC: {
    symbol: 'MATIC',
    decimals: 18,
    address: null, // Native token
    networks: ['polygon', 'polygonTestnet']
  },
  USDC: {
    symbol: 'USDC',
    decimals: 6,
    address: {
      ethereum: '0xA0b86a33E6417eFf4a525F0E31a9D30C42Cb7D58',
      polygon: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
      polygonTestnet: '0x742d35Cc6b6b36A77AEC0AE8e1Ae8cE9c52e1bE6'
    },
    networks: ['ethereum', 'polygon', 'polygonTestnet']
  },
  USDT: {
    symbol: 'USDT',
    decimals: 6,
    address: {
      ethereum: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
      polygon: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
      polygonTestnet: '0x742d35Cc6b6b36A77AEC0AE8e1Ae8cE9c52e1bE6'
    },
    networks: ['ethereum', 'polygon', 'polygonTestnet']
  }
};

// ERC-20 ABI for token interactions
const ERC20_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
  'function transfer(address to, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'event Transfer(address indexed from, address indexed to, uint256 value)'
];

// Initialize providers
const initializeProviders = () => {
  const providers = {};
  
  Object.keys(NETWORKS).forEach(network => {
    try {
      providers[network] = new ethers.providers.JsonRpcProvider(NETWORKS[network].rpcUrl);
      console.log(`✅ ${NETWORKS[network].name} provider initialized`);
    } catch (error) {
      console.error(`❌ Failed to initialize ${network} provider:`, error.message);
      logError(error, { context: 'Web3 Provider Initialization', network });
    }
  });
  
  return providers;
};

const providers = initializeProviders();
const currentProvider = providers[process.env.ETHEREUM_NETWORK] || providers.polygon;

// Web3 utility class
class Web3Utils {
  constructor() {
    this.providers = providers;
    this.currentProvider = currentProvider;
    this.network = CURRENT_NETWORK;
  }

  // Wallet signature verification
  async verifySignature(message, signature, address) {
    try {
      const recoveredAddress = ethers.utils.verifyMessage(message, signature);
      const isValid = recoveredAddress.toLowerCase() === address.toLowerCase();
      
      if (!isValid) {
        logSecurity(
          'invalid_wallet_signature',
          null,
          null,
          null,
          'medium',
          {
            providedAddress: address,
            recoveredAddress,
            message: message.substring(0, 100)
          }
        );
      }
      
      return {
        isValid,
        recoveredAddress,
        providedAddress: address
      };
    } catch (error) {
      logError(error, { 
        context: 'Signature Verification',
        address,
        message: message.substring(0, 100)
      });
      return {
        isValid: false,
        error: error.message
      };
    }
  }

  // Generate message for wallet signature
  generateSignatureMessage(walletAddress, nonce, timestamp = Date.now()) {
    return `HealthFriend Authentication\n\nWallet: ${walletAddress}\nNonce: ${nonce}\nTimestamp: ${timestamp}\n\nSign this message to authenticate with HealthFriend.`;
  }

  // Validate Ethereum address
  isValidAddress(address) {
    try {
      return ethers.utils.isAddress(address);
    } catch (error) {
      return false;
    }
  }

  // Get account balance (native token)
  async getBalance(address, network = null) {
    try {
      const provider = network ? this.providers[network] : this.currentProvider;
      if (!provider) throw new Error('Provider not available');

      const balance = await provider.getBalance(address);
      return {
        wei: balance.toString(),
        ether: ethers.utils.formatEther(balance),
        formatted: parseFloat(ethers.utils.formatEther(balance)).toFixed(4)
      };
    } catch (error) {
      logError(error, { context: 'Get Balance', address, network });
      throw new Error('Failed to get balance');
    }
  }

  // Get ERC-20 token balance
  async getTokenBalance(tokenAddress, walletAddress, network = null) {
    try {
      const provider = network ? this.providers[network] : this.currentProvider;
      if (!provider) throw new Error('Provider not available');

      const contract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
      
      const [balance, decimals, symbol] = await Promise.all([
        contract.balanceOf(walletAddress),
        contract.decimals(),
        contract.symbol()
      ]);

      const formatted = ethers.utils.formatUnits(balance, decimals);
      
      return {
        raw: balance.toString(),
        formatted: parseFloat(formatted).toFixed(6),
        decimals,
        symbol,
        tokenAddress
      };
    } catch (error) {
      logError(error, { 
        context: 'Get Token Balance',
        tokenAddress,
        walletAddress,
        network
      });
      throw new Error('Failed to get token balance');
    }
  }

  // Get transaction details
  async getTransaction(txHash, network = null) {
    try {
      const provider = network ? this.providers[network] : this.currentProvider;
      if (!provider) throw new Error('Provider not available');

      const [transaction, receipt] = await Promise.all([
        provider.getTransaction(txHash),
        provider.getTransactionReceipt(txHash).catch(() => null)
      ]);

      if (!transaction) {
        throw new Error('Transaction not found');
      }

      return {
        hash: transaction.hash,
        from: transaction.from,
        to: transaction.to,
        value: ethers.utils.formatEther(transaction.value),
        gasPrice: ethers.utils.formatUnits(transaction.gasPrice, 'gwei'),
        gasLimit: transaction.gasLimit.toString(),
        gasUsed: receipt ? receipt.gasUsed.toString() : null,
        blockNumber: transaction.blockNumber,
        blockHash: transaction.blockHash,
        confirmations: transaction.confirmations,
        status: receipt ? (receipt.status === 1 ? 'success' : 'failed') : 'pending',
        timestamp: transaction.timestamp,
        receipt
      };
    } catch (error) {
      logError(error, { context: 'Get Transaction', txHash, network });
      throw new Error('Failed to get transaction details');
    }
  }

  // Monitor transaction confirmations
  async monitorTransaction(txHash, requiredConfirmations = 12, network = null, onConfirmation = null) {
    try {
      const provider = network ? this.providers[network] : this.currentProvider;
      if (!provider) throw new Error('Provider not available');

      return new Promise((resolve, reject) => {
        let confirmations = 0;
        const timeout = setTimeout(() => {
          reject(new Error('Transaction monitoring timeout'));
        }, 30 * 60 * 1000); // 30 minutes timeout

        const checkConfirmations = async () => {
          try {
            const receipt = await provider.getTransactionReceipt(txHash);
            
            if (!receipt) {
              setTimeout(checkConfirmations, 5000); // Check every 5 seconds
              return;
            }

            const currentBlock = await provider.getBlockNumber();
            confirmations = currentBlock - receipt.blockNumber + 1;

            if (onConfirmation) {
              onConfirmation(confirmations, requiredConfirmations);
            }

            if (confirmations >= requiredConfirmations) {
              clearTimeout(timeout);
              resolve({
                confirmed: true,
                confirmations,
                receipt,
                status: receipt.status === 1 ? 'success' : 'failed'
              });
            } else {
              setTimeout(checkConfirmations, 15000); // Check every 15 seconds
            }
          } catch (error) {
            clearTimeout(timeout);
            reject(error);
          }
        };

        checkConfirmations();
      });
    } catch (error) {
      logError(error, { context: 'Monitor Transaction', txHash, network });
      throw error;
    }
  }

  // Estimate gas for transaction
  async estimateGas(transactionData, network = null) {
    try {
      const provider = network ? this.providers[network] : this.currentProvider;
      if (!provider) throw new Error('Provider not available');

      const gasEstimate = await provider.estimateGas(transactionData);
      const gasPrice = await provider.getGasPrice();
      
      const networkConfig = network ? NETWORKS[network] : this.network;
      const adjustedGasLimit = gasEstimate.mul(Math.floor(networkConfig.gasMultiplier * 100)).div(100);
      
      return {
        gasLimit: adjustedGasLimit.toString(),
        gasPrice: gasPrice.toString(),
        gasPriceGwei: ethers.utils.formatUnits(gasPrice, 'gwei'),
        estimatedCost: ethers.utils.formatEther(adjustedGasLimit.mul(gasPrice)),
        network: networkConfig.name
      };
    } catch (error) {
      logError(error, { context: 'Gas Estimation', transactionData, network });
      throw new Error('Failed to estimate gas');
    }
  }

  // Get current gas prices
  async getGasPrices(network = null) {
    try {
      const provider = network ? this.providers[network] : this.currentProvider;
      if (!provider) throw new Error('Provider not available');

      const gasPrice = await provider.getGasPrice();
      const gasPriceGwei = parseFloat(ethers.utils.formatUnits(gasPrice, 'gwei'));

      return {
        standard: {
          gasPrice: gasPrice.toString(),
          gwei: gasPriceGwei.toFixed(2)
        },
        fast: {
          gasPrice: gasPrice.mul(120).div(100).toString(), // 20% higher
          gwei: (gasPriceGwei * 1.2).toFixed(2)
        },
        fastest: {
          gasPrice: gasPrice.mul(150).div(100).toString(), // 50% higher
          gwei: (gasPriceGwei * 1.5).toFixed(2)
        }
      };
    } catch (error) {
      logError(error, { context: 'Get Gas Prices', network });
      throw new Error('Failed to get gas prices');
    }
  }

  // Convert between units
  formatUnits(value, decimals = 18) {
    try {
      return ethers.utils.formatUnits(value, decimals);
    } catch (error) {
      throw new Error('Failed to format units');
    }
  }

  parseUnits(value, decimals = 18) {
    try {
      return ethers.utils.parseUnits(value.toString(), decimals);
    } catch (error) {
      throw new Error('Failed to parse units');
    }
  }

  // Cryptocurrency price utilities
  async getCryptoPrices(symbols = ['ETH', 'MATIC', 'USDC', 'USDT']) {
    try {
      const response = await axios.get('https://api.coingecko.com/api/v3/simple/price', {
        params: {
          ids: 'ethereum,matic-network,usd-coin,tether',
          vs_currencies: 'usd',
          include_24hr_change: true,
          include_market_cap: true
        },
        timeout: 10000
      });

      const priceMap = {
        'ethereum': 'ETH',
        'matic-network': 'MATIC',
        'usd-coin': 'USDC',
        'tether': 'USDT'
      };

      const prices = {};
      Object.entries(response.data).forEach(([key, value]) => {
        const symbol = priceMap[key];
        if (symbol && symbols.includes(symbol)) {
          prices[symbol] = {
            usd: value.usd,
            change24h: value.usd_24h_change,
            marketCap: value.usd_market_cap,
            lastUpdated: Date.now()
          };
        }
      });

      return prices;
    } catch (error) {
      logError(error, { context: 'Get Crypto Prices', symbols });
      
      // Return fallback prices if API fails
      const fallbackPrices = {};
      symbols.forEach(symbol => {
        fallbackPrices[symbol] = {
          usd: symbol === 'USDC' || symbol === 'USDT' ? 1 : 2000, // Fallback values
          change24h: 0,
          marketCap: 0,
          lastUpdated: Date.now(),
          isFallback: true
        };
      });
      
      return fallbackPrices;
    }
  }

  // Convert USD amount to crypto amount
  async convertUSDToCrypto(usdAmount, cryptoSymbol) {
    try {
      const prices = await this.getCryptoPrices([cryptoSymbol]);
      const cryptoPrice = prices[cryptoSymbol];
      
      if (!cryptoPrice) {
        throw new Error(`Price not available for ${cryptoSymbol}`);
      }

      const cryptoAmount = usdAmount / cryptoPrice.usd;
      
      return {
        usdAmount,
        cryptoAmount,
        cryptoSymbol,
        exchangeRate: cryptoPrice.usd,
        formatted: cryptoAmount.toFixed(6),
        timestamp: Date.now()
      };
    } catch (error) {
      logError(error, { context: 'USD to Crypto Conversion', usdAmount, cryptoSymbol });
      throw new Error('Failed to convert USD to crypto');
    }
  }

  // Convert crypto amount to USD
  async convertCryptoToUSD(cryptoAmount, cryptoSymbol) {
    try {
      const prices = await this.getCryptoPrices([cryptoSymbol]);
      const cryptoPrice = prices[cryptoSymbol];
      
      if (!cryptoPrice) {
        throw new Error(`Price not available for ${cryptoSymbol}`);
      }

      const usdAmount = cryptoAmount * cryptoPrice.usd;
      
      return {
        cryptoAmount,
        usdAmount,
        cryptoSymbol,
        exchangeRate: cryptoPrice.usd,
        formatted: usdAmount.toFixed(2),
        timestamp: Date.now()
      };
    } catch (error) {
      logError(error, { context: 'Crypto to USD Conversion', cryptoAmount, cryptoSymbol });
      throw new Error('Failed to convert crypto to USD');
    }
  }

  // Validate transaction hash
  isValidTransactionHash(txHash) {
    try {
      return /^0x[a-fA-F0-9]{64}$/.test(txHash);
    } catch (error) {
      return false;
    }
  }

  // Get network info
  getNetworkInfo(network = null) {
    return network ? NETWORKS[network] : this.network;
  }

  // Get supported tokens
  getSupportedTokens(network = null) {
    const networkName = network || process.env.ETHEREUM_NETWORK || 'polygon';
    
    return Object.entries(SUPPORTED_TOKENS)
      .filter(([, token]) => token.networks.includes(networkName))
      .reduce((acc, [symbol, token]) => {
        acc[symbol] = {
          ...token,
          address: token.address ? token.address[networkName] : null
        };
        return acc;
      }, {});
  }

  // Check if address is a contract
  async isContract(address, network = null) {
    try {
      const provider = network ? this.providers[network] : this.currentProvider;
      if (!provider) throw new Error('Provider not available');

      const code = await provider.getCode(address);
      return code !== '0x';
    } catch (error) {
      logError(error, { context: 'Contract Check', address, network });
      return false;
    }
  }

  // Get block information
  async getBlock(blockNumber = 'latest', network = null) {
    try {
      const provider = network ? this.providers[network] : this.currentProvider;
      if (!provider) throw new Error('Provider not available');

      const block = await provider.getBlock(blockNumber);
      
      return {
        number: block.number,
        hash: block.hash,
        timestamp: block.timestamp,
        transactions: block.transactions.length,
        gasUsed: block.gasUsed.toString(),
        gasLimit: block.gasLimit.toString(),
        miner: block.miner,
        difficulty: block.difficulty?.toString(),
        totalDifficulty: block.totalDifficulty?.toString()
      };
    } catch (error) {
      logError(error, { context: 'Get Block', blockNumber, network });
      throw new Error('Failed to get block information');
    }
  }

  // Generate payment QR code data
  generatePaymentQRData(recipientAddress, amount, tokenSymbol = 'ETH', memo = '') {
    try {
      // EIP-681 format for crypto payments
      const baseUrl = tokenSymbol === 'ETH' ? 'ethereum:' : `ethereum:${SUPPORTED_TOKENS[tokenSymbol]?.address || ''}@${this.network.chainId}/transfer?address=`;
      
      const params = new URLSearchParams();
      if (amount) params.append('value', this.parseUnits(amount.toString()).toString());
      if (memo) params.append('data', memo);
      
      const qrData = `${baseUrl}${recipientAddress}${params.toString() ? '?' + params.toString() : ''}`;
      
      return {
        qrData,
        recipient: recipientAddress,
        amount,
        token: tokenSymbol,
        network: this.network.name,
        memo
      };
    } catch (error) {
      logError(error, { context: 'Generate Payment QR', recipientAddress, amount, tokenSymbol });
      throw new Error('Failed to generate payment QR data');
    }
  }

  // Transaction status checker
  async getTransactionStatus(txHash, network = null) {
    try {
      const transaction = await this.getTransaction(txHash, network);
      
      let status = 'unknown';
      let confirmations = 0;
      
      if (transaction.receipt) {
        status = transaction.status;
        confirmations = transaction.confirmations || 0;
      } else if (transaction.blockNumber) {
        status = 'pending';
        const currentBlock = await this.currentProvider.getBlockNumber();
        confirmations = currentBlock - transaction.blockNumber + 1;
      } else {
        status = 'pending';
      }

      return {
        hash: txHash,
        status,
        confirmations,
        isConfirmed: confirmations >= 12,
        isPending: status === 'pending',
        isSuccess: status === 'success',
        isFailed: status === 'failed',
        transaction
      };
    } catch (error) {
      if (error.message.includes('not found')) {
        return {
          hash: txHash,
          status: 'not_found',
          confirmations: 0,
          isConfirmed: false,
          isPending: false,
          isSuccess: false,
          isFailed: false
        };
      }
      
      logError(error, { context: 'Get Transaction Status', txHash, network });
      throw error;
    }
  }
}

// Create singleton instance
const web3Utils = new Web3Utils();

// Export utilities
module.exports = {
  // Main class instance
  web3Utils,
  
  // Direct utility functions
  verifySignature: web3Utils.verifySignature.bind(web3Utils),
  generateSignatureMessage: web3Utils.generateSignatureMessage.bind(web3Utils),
  isValidAddress: web3Utils.isValidAddress.bind(web3Utils),
  getBalance: web3Utils.getBalance.bind(web3Utils),
  getTransaction: web3Utils.getTransaction.bind(web3Utils),
  monitorTransaction: web3Utils.monitorTransaction.bind(web3Utils),
  getCryptoPrices: web3Utils.getCryptoPrices.bind(web3Utils),
  convertUSDToCrypto: web3Utils.convertUSDToCrypto.bind(web3Utils),
  convertCryptoToUSD: web3Utils.convertCryptoToUSD.bind(web3Utils),
  isValidTransactionHash: web3Utils.isValidTransactionHash.bind(web3Utils),
  
  // Configuration exports
  NETWORKS,
  SUPPORTED_TOKENS,
  CURRENT_NETWORK,
  
  // Provider access
  getProvider: (network) => providers[network] || currentProvider,
  getCurrentProvider: () => currentProvider
};