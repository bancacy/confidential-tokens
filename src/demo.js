require("dotenv").config();

const aztec = require("aztec.js");
const { getContractAddressesForNetwork, NetworkId } = require("@aztec/contract-addresses");
const aztecArtifacts = require("@aztec/contract-artifacts");

const BN = require("bn.js");
const path = require("path");

const accounts = require(path.join(__dirname, "accounts"));
const { sendTx } = require(path.join(__dirname, "tx"));
const web3 = require(path.join(__dirname, "web3Provider"));

const noteCoder = require('./noteCoder');

const account = aztec.secp256k1.accountFromPrivateKey(accounts[0].privateKey);

console.log('account public key = ', account.publicKey);
// Declare variables
let notes = [], proofs = [], proofHashes = [], proofOutputs = [];
let joinSplit, confidentialToken, erc20Mintable, noteRegistry;

// Get the Rinkeby contracts addresses
const confidentialTokenAddress = '0x8A7e7dD1b736B37e953f35a4dC4d103113d3D9Ca';
aztecAddresses = getContractAddressesForNetwork(NetworkId.Rinkeby);
joinSplit = new web3.eth.Contract(aztecArtifacts.JoinSplit.abi, aztecAddresses.joinSplit);
erc20Mintable = new web3.eth.Contract(aztecArtifacts.ERC20Mintable.abi, aztecAddresses.erc20Mintable);
confidentialToken = new web3.eth.Contract(aztecArtifacts.ZKERC20.abi, confidentialTokenAddress);

// -------------------------------------------------------------------------------
async function getNotes() {
    const createEvents = await confidentialToken.getPastEvents('LogCreateNote', {
        filter: { _owner: account.address },
        fromBlock: 0,
        toBlock: 'latest'
    });
    const destroyEvents = await confidentialToken.getPastEvents('LogDestroyNote', {
        filter: { _owner: account.address },
        fromBlock: 0,
        toBlock: 'latest'
    });
    const notePromises = createEvents.filter((event) => {
        let valid = true;
        destroyEvents.forEach((destroyEvent) => {
            if (destroyEvent.returnValues._noteHash === event.returnValues._noteHash) {
                valid = false;
            }
        });
        return valid;
    }).map((event) => {
        const metadata = event.returnValues._metadata;
        return noteCoder.fromEventData(metadata, account.privateKey);
    });
    const notes = await Promise.all(notePromises);
    return notes;
    console.log('notes = ', notes);
}

// -------------------------------------------------------------------------------
// Prepare the notes and the contracts
async function generateInitialNotes() {
    // Generate a bunch of random AZTEC notes
    notes = [
        aztec.note.create(account.publicKey, 100),
        aztec.note.create(account.publicKey, 100),
        aztec.note.create(account.publicKey, 100),
        aztec.note.create(account.publicKey, 100)
    ];

    // Create dem proofs
    proofs[0] = aztec.proof.joinSplit.encodeJoinSplitTransaction({
        inputNotes: [],
        outputNotes: notes.slice(0, 4),
        senderAddress: account.address,
        inputNoteOwners: [],
        publicOwner: account.address,
        kPublic: -400,
        aztecAddress: joinSplit.options.address,
    });

    // Generate proof outputs and hashes
    proofOutputs = proofs.map(({ expectedOutput }) => {
        return aztec.abiEncoder.outputCoder.getProofOutput(expectedOutput, 0);
    });
    proofHashes = proofOutputs.map(proofOutput => {
        return aztec.abiEncoder.outputCoder.hashProofOutput(proofOutput);
    });

    mintAndApproveTokens();
}

async function mintAndApproveTokens() {
    // The note registry's address is unique for each confidential token
    const noteRegistryAddress = await confidentialToken.methods.noteRegistry().call();
    noteRegistry = new web3.eth.Contract(aztecArtifacts.NoteRegistry.abi, noteRegistryAddress);

    // Mint ERC20 tokens
    console.log("Minting ERC20 tokens...");
    const scalingFactor = new BN(10);
    const tokensTransferred = new BN(100000);
    const mintData = erc20Mintable
        .methods
        .mint(account.address, scalingFactor.mul(tokensTransferred).toString(10))
        .encodeABI();
    await sendTx({
        from: account.address,
        to: aztecAddresses.erc20Mintable,
        data: mintData,
        privateKey: account.privateKey,
    });

    // Approve ERC20 spending
    console.log("Approving AZTEC to spend ERC20 tokens...");
    const approveData = erc20Mintable
        .methods
        .approve(noteRegistry.options.address, scalingFactor.mul(tokensTransferred).toString(10))
        .encodeABI();
    await sendTx({
        from: account.address,
        to: aztecAddresses.erc20Mintable,
        data: approveData,
        privateKey: account.privateKey,
    });

    // Approve AZTEC spending
    console.log("Approving AZTEC to spend notes...");
    for (let i = 0; i < proofs.length; ++i) {
        let data = noteRegistry
            .methods
            .publicApprove(proofHashes[i], 4000)
            .encodeABI();
        await sendTx({
            from: account.address,
            to: noteRegistry.options.address,
            data: data,
            privateKey: account.privateKey,
        });
    }

    console.log("Making a confidential token transfer...");
    let data = confidentialToken
        .methods
        .confidentialTransfer(proofs[0].proofData)
        .encodeABI();

    const receipt = await sendTx({
        from: account.address,
        to: confidentialToken.options.address,
        data: data,
        privateKey: account.privateKey,
    });
    console.log('Mined confidential token transfer! receipt = ', JSON.stringify(receipt));
}


// -------------------------------------------------------------------------------
async function confidentialTransfer(recipientPublicKey, value) {
    console.log('collecting AZTEC notes...');
    const noteCache = await getNotes();
    console.log('note cache = ', noteCache);
    let sum = 0;
    const inputNotes = [];
    let iterator = 0;
    while (sum < value) {
        if (iterator >= noteCache.length) {
            throw new Error('balance insufficient!');
        }
        inputNotes.push(noteCache[iterator]);
        sum += noteCache[iterator].k.toNumber();
        iterator += 1;
    }
    const remainder = sum - value;
    const outputNotes = [
        aztec.note.create(account.publicKey, remainder),
        aztec.note.create(recipientPublicKey, value),
    ];
    const inputNoteOwners = inputNotes.map(() => account);

    const proof = aztec.proof.joinSplit.encodeJoinSplitTransaction({
        inputNotes,
        outputNotes,
        senderAddress: account.address,
        inputNoteOwners,
        publicOwner: '',
        kPublic: 0,
        aztecAddress: joinSplit.options.address,
    });

    const data = confidentialToken
        .methods
        .confidentialTransfer(proof.proofData)
        .encodeABI();

    console.log('issuing confidential transfer...');
    const receipt = await sendTx({
        from: account.address,
        to: confidentialToken.options.address,
        data: data,
        privateKey: account.privateKey,
    });
    console.log('confidential transfer has been mined!, receipt = ', JSON.stringify(receipt));
}

// confidentialTransfer('0x046ab29946a840fee08f4417ad14f6af3c7570281f1fe4243d3cc81ce40da6dccb8bcf7eac596677a90538d47b7d27fc04995bf96e36a5b2e1b672da0cb523d3e0', 10);
generateInitialNotes();
