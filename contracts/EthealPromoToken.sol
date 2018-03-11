pragma solidity ^0.4.17;

import "./MiniMeToken.sol";

/**
 * @title EthealToken
 * @dev Basic MiniMe token
 */
contract EthealPromoToken is MiniMeToken {
    function EthealPromoToken(address _controller, address _tokenFactory) 
        MiniMeToken(
            _tokenFactory,
            0x0,                // no parent token
            0,                  // no snapshot block number from parent
            "Etheal PROMO Token",     // Token name
            18,                 // Decimals
            "HealP",             // Symbol
            true                // Enable transfers
        )
    {
        changeController(_controller);
    }
}