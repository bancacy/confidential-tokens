require("dotenv").config();

const aztec = require("aztec.js");
const { getContractAddressesForNetwork, NetworkId } = require("@aztec/contract-addresses");
const artifacts = require("@aztec/contract-artifacts");

const BN = require("bn.js");
const { expect } = require("chai");
const Web3 = require("web3");
const { padLeft } = require("web3-utils");

// Connect web3 to the rinkeby testnet via infura
const url = `https://rinkeby.infura.io/${process.env.INFURA_API_KEY}`;
const web3 = new Web3(new Web3.providers.HttpProvider(url));

// Declare varaibles
let accounts = [], notes = [], noteRegistryAddress, output = {}, proofs = [];
let aztecJoinSplit, confidentialToken, erc20Mintable, noteRegistry;

// Prepare the notes and the contracts
(async function() {
  // Generate a bunch of random accounts
  accounts = [...new Array(10)].map(() => aztec.secp256k1.generateAccount());
  output.accounts = accounts;

  // Generate a bunch of random AZTEC notes
  notes = [
    ...accounts.map(({ publicKey }, i) => aztec.note.create(publicKey, i * 10)),
    ...accounts.map(({ publicKey }, i) => aztec.note.create(publicKey, i * 10)),
  ];
  output.note = {};
  output.note.gamma = notes[0].gamma;
  output.note.sigma = notes[0].sigma;

  // Create a dummy common reference string for the ACE
  const hx = new BN("7673901602397024137095011250362199966051872585513276903826533215767972925880", 10);
  const hy = new BN("8489654445897228341090914135473290831551238522473825886865492707826370766375", 10);
  const crs = [
    `0x${padLeft(hx.toString(16), 64)}`,
    `0x${padLeft(hy.toString(16), 64)}`,
    ...aztec.params.t2,
  ];
  output.crs = crs;

  // Get the Rinkeby contracts addresses
  const addresses = getContractAddressesForNetwork(NetworkId.Rinkeby);
  aztecJoinSplit = new web3.eth.Contract(artifacts.AZTECJoinSplit, addresses.aztecJoinSplit);
  confidentialToken = new web3.eth.Contract(artifacts.ZKERC20, process.env.CONFIDENTIAL_TOKEN_ADDRESS);
  erc20Mintable = new web3.eth.Contract(artifacts.ERC20Mintable, addresses.erc20Mintable);

  // The note registry's address is dynamic
  noteRegistryAddress = await confidentialToken.methods.noteRegistry.call();
  noteRegistry = new web3.eth.Contract(artifacts.NoteRegistry, noteRegistryAddress);

  // Create dem proofs
  proofs[0] = aztec.proof.joinSplit.encodeJoinSplitTransaction({
    inputNotes: [],
    outputNotes: notes.slice(0, 2),
    senderAddress: accounts[0],
    inputNoteOwners: [],
    publicOwner: accounts[0],
    kPublic: -10,
    aztecAddress: aztecJoinSplit.options.address
  });

  proofs[1] = aztec.proof.joinSplit.encodeJoinSplitTransaction({
    inputNotes: notes.slice(0, 2),
    outputNotes: notes.slice(2, 4),
    senderAddress: accounts[0],
    inputNoteOwners: accounts.slice(0, 2),
    publicOwner: accounts[1],
    kPublic: -40,
    aztecAddress: aztecJoinSplit.address,
  });

  proofs[2] = aztec.proof.joinSplit.encodeJoinSplitTransaction({
    inputNotes: [],
    outputNotes: notes.slice(6, 8),
    senderAddress: accounts[0],
    inputNoteOwners: [],
    publicOwner: accounts[2],
    kPublic: -130,
    aztecAddress: aztecJoinSplit.options.address,
  });

  proofs[3] = aztec.proof.joinSplit.encodeJoinSplitTransaction({
    inputNotes: notes.slice(6, 8),
    outputNotes: notes.slice(4, 6),
    senderAddress: accounts[0],
    inputNoteOwners: accounts.slice(6, 8),
    publicOwner: accounts[2],
    kPublic: 40,
    aztecAddress: aztecJoinSplit.options.address,
  });

  proofs[4] = aztec.proof.joinSplit.encodeJoinSplitTransaction({
    inputNotes: [],
    outputNotes: [notes[0], notes[3]],
    senderAddress: accounts[0],
    inputNoteOwners: [],
    publicOwner: accounts[3],
    kPublic: -30,
    aztecAddress: aztecJoinSplit.address,
  });

  proofs[5] = aztec.proof.joinSplit.encodeJoinSplitTransaction({
    inputNotes: [notes[0], notes[3]],
    outputNotes: [notes[1], notes[2]],
    senderAddress: accounts[0],
    inputNoteOwners: [accounts[0], accounts[3]],
    publicOwner: accounts[3],
    kPublic: 0, // perfectly balanced...
    aztecAddress: aztecJoinSplit.address,
  });
}());

(async function() {
  // Mint ERC20 tokens
  console.log("Minting ERC20 tokens...\n");
  const scalingFactor = new BN(1000000000000000000);
  const tokensTransferred = new BN(100000);
  await Promise.all(
    accounts.map(account => {
      erc20Mintable
        .methods
        .mint(
          account, 
          scalingFactor.mul(tokensTransferred)
        )
        .send({
          from: account,
          gas: 4700000
        });
    })
  );

  // Approve ERC20 spending
  console.log("Approving AZTEC to spend ERC20 tokens...\n");
  await Promise.all(
    accounts.map(account => {
      erc20Mintable
        .methods
        .approve(
          noteRegistryAddress,
          scalingFactor.mul(tokensTransferred)
        )
        .send({
          from: account,
          gas: 4700000
        });
    })
  );

  // Approve AZTEC spending
  const proofOutputs = proofs.map(({ expectedOutput }) => {
    aztec.abiEncoder.outputCoder.getProofOutput(expectedOutput, 0);
  });
  const proofHashes = proofOutputs.map(proofOutput => {
    aztec.abiEncoder.outputCoder.hashProofOutput(proofOutput);
  });
  await noteRegistry
    .methods
    .publicApprove(proofHashes[0], 10)
    .send({ from: accounts[0] });
  await noteRegistry
    .methods
    .publicApprove(proofHashes[1], 40)
    .send({ from: accounts[1] });
  await noteRegistry
    .methods
    .publicApprove(proofHashes[2], 130)
    .send({ from: accounts[2] });
  await noteRegistry
    .methods
    .publicApprove(proofHashes[4], 30)
    .send( { from: accounts[3] });
  await Promise.all(
    accounts.map(account => {
      noteRegistry
        .methods
        .publicApprove(
          noteRegistryAddress,
          scalingFactor.mul(tokensTransferred)
        )
        .send({
          from: account,
          gas: 4700000
        });
    })
  );
}());

// Make a confidential transfer
(async function() {
  const { receipt } = await confidentialToken
    .methods
    .confidentialTransfer(proofs[0].proofData)
    .send();
  console.log("receipt", receipt);
  expect(receipt.status).to.equal(true);
}());

console.log(JSON.stringify(output, null, 2));
