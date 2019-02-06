pragma solidity ^0.4.24;

import "@aztec/protocol/contracts/ZKERC20/ZKERC20.sol";

contract MyConfidentialToken is ZKERC20 {

  string public name;
  
  constructor () public {}
}