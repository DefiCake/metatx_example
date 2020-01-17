pragma solidity ^0.5.0;

import "@openzeppelin/contracts/token/ERC777/ERC777.sol";

contract USDT is ERC777 {

    constructor(address[] memory ops) ERC777 ("USD Tether", "USDT", ops) public{}

    function mint(uint amount) public {
        _mint(msg.sender, msg.sender, amount, "", "");
    }
}
