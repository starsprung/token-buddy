const Web3 = require("web3");

const { hdkey } = require("ethereumjs-wallet");
const bip39 = require("bip39");

let config = {};

module.exports = {
  init: async (data) => {
    if (!data) {
      throw new Error("You must provide initialization values");
    }
    if (typeof data.index !== "number") {
      throw new Error("No wallet index provided");
    }
    if (!data.provider) {
      throw new Error("No WS provider supplied");
    }
    if (!data.token) {
      throw new Error("No token JSON supplied");
    }
    if (!data.token.abi) {
      throw new Error("No token JSON ABI supplied");
    }
    if (!data.token.contract_address) {
      throw new Error("No token JSON contract address provided");
    }
    if (!data.mnemonic) {
      console.log("! token-helper init called with no mnemonic, creating one");
      data.mnemonic = bip39.generateMnemonic();
    }
    config = {
      mnemonic: data.mnemonic,
      index: data.index,
      token: data.token,
    };
    const seed = await bip39.mnemonicToSeed(config.mnemonic);
    config.root = hdkey.fromMasterSeed(seed);
    config.web3 = new Web3(data.provider);
  },
  newAccount: () => {
    // create a new address and advance the index one
    const addrNode = config.root.derivePath("m/44'/60'/0'/0/0");
    const wallet = addrNode.getWallet();
    config.wallet = wallet;
    const address = wallet.getAddressString();
    return address;
  },
  getBalance: async (address) => {
    const result = await config.web3.eth.getBalance(address);
    return result;
  },
  getTokenBalance: async (address) => {
    const contract = new config.web3.eth.Contract(
      config.token.abi,
      config.token.contract_address
    );
    const result = await contract.methods.balanceOf(address).call();
    return result;
  },
  sendTokens: async (fromAddress, toAddress, amount) => {
    const contract = new config.web3.eth.Contract(
      config.token.abi,
      config.token.contract_address,
      {
        from: fromAddress,
      }
    );
    const privateKey = `0x${config.wallet.privateKey.toString("hex")}`;
    const account = config.web3.eth.accounts.privateKeyToAccount(privateKey);
    config.web3.eth.accounts.wallet.create();
    config.web3.eth.accounts.wallet.add(account);
    // token has 3 decimal places, 1000 -> 1.000
    const estimatedGas = await contract.methods
      .transfer(toAddress, amount)
      .estimateGas();

    const result = await contract.methods.transfer(toAddress, amount).send({
      from: fromAddress,
      gas: estimatedGas,
      value: 0x0,
    });
    return result;
  },
  getTransactions: async () => {
    const address = config.wallet.getAddressString().toLowerCase();

    const endBlockNumber = await config.web3.eth.getBlockNumber();
    console.log(`Using endBlockNumber: ${endBlockNumber}`);

    const startBlockNumber = Math.max(endBlockNumber - 1000, 0);

    console.log(`Using startBlockNumber: ${startBlockNumber}`);
    console.log(
      `Searching for transactions to/from account "${address}" within blocks ${startBlockNumber} and ${endBlockNumber}`
    );

    for (let i = startBlockNumber; i <= endBlockNumber; i++) {
      const block = await config.web3.eth.getBlock(i, true);
      if (block != null && block.transactions != null) {
        block.transactions.forEach((e) => {
          if (
            address == e.from.toLowerCase() ||
            address == e.to.toLowerCase()
          ) {
            console.log(`
             tx hash         : ${e.hash}
             nonce           : ${e.nonce}
             blockHash       : ${e.blockHash}
             blockNumber     : ${e.blockNumber}
             transactionIndex: ${e.transactionIndex}
             from            : ${e.from}
             to              : ${e.to}
             value           : ${e.value}
             time            : ${block.timestamp} ${new Date(
              block.timestamp * 1000
            ).toGMTString()}
             gasPrice        : ${e.gasPrice}
             gas             : ${e.gas}
             input           : ${e.input}`);
          }
        });

        console.log(block);
      }
    }
  },
};
