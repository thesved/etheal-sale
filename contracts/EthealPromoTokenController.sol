pragma solidity ^0.4.17;

import "./SafeMath.sol";
import "./ERC20MiniMe.sol";
import "./TokenController.sol";
import "./HasNoTokens.sol";
import "./Pausable.sol";
import "./iEthealSale.sol";

/**
 * @title EthealPromoToken
 * @author thesved
 * @notice Controller of the Etheal PROMO Token
 */
contract EthealPromoTokenController is Pausable, HasNoTokens {
    using SafeMath for uint;

    // when migrating this contains the address of the new controller
    TokenController public newController;

    // PromoToken which this controlls
    ERC20MiniMe public ethealPromoToken;

    // Address of crowdsale where we set promo token bonus
    iEthealSale public crowdsale;


    ////////////////
    // Constructor, overrides
    ////////////////

    /// @dev overrides HasNoTokens#extractTokens to make it possible to extract any tokens
    function extractTokens(address _token, address _claimer) onlyOwner public {
        super.extractTokens(_token, _claimer);
    }


    ////////////////
    // Handle ownership - only for owner
    ////////////////

    /// @notice replaces controller when it was not yet replaced, only multisig can do it
    function setNewController(address _controller) public onlyOwner {
        require(_controller != address(0) && newController == address(0));

        newController = TokenController(_controller);
        ethealPromoToken.changeController(_controller);

        // send eth
        uint256 _stake = this.balance;
        if (_stake > 0) {
            _controller.transfer(_stake);
        }

        // send tokens
        _stake = ethealPromoToken.balanceOf(this);
        if (_stake > 0) {
            ethealPromoToken.transfer(_controller, _stake);
        }
    }

    /// @notice set the crowdsale contract: we will set the bonus on this contract
    function setCrowdsale(address _crowdsale) public onlyOwner {
        require(_crowdsale != address(0));

        crowdsale = iEthealSale(_crowdsale);
    }

    /// @notice set the token
    function setPromoToken(address _token) public onlyOwner {
        require(_token != address(0));

        ethealPromoToken = ERC20MiniMe(_token);
    }


    ////////////////
    // Distribute tokens
    ////////////////

    /// @notice Distribute promo token
    function distributeToken(address _to, uint256 _amount) public onlyOwner {
        distributeTokenInternal(_to, _amount);
    }

    /// @notice Distribute promo token for multiple addresses
    function distributeManyToken(address[] _to, uint256 _amount) external onlyOwner {
        for (uint256 i=0; i<_to.length; i++) {
            distributeTokenInternal(_to[i], _amount);
        }
    }

    /// @notice Internal function for generation, no check for faster mass action
    function distributeTokenInternal(address _to, uint256 _amount) internal {
        ethealPromoToken.generateTokens(_to, _amount);
    }

    /// @notice burn promo token
    function burnToken(address _where, uint256 _amount) public onlyOwner {
        require(ethealPromoToken.destroyTokens(_where, _amount));
    }

    /// @notice burn promo token on multiple addresses
    function burnManyToken(address[] _where, uint256 _amount) external onlyOwner {
        for (uint256 i=0; i<_where.length; i++) {
            burnToken(_where[i], _amount);
        }
    }


    ////////////////
    // MiniMe Controller functions
    ////////////////

    /// @notice No eth payment to the token contract
    function proxyPayment(address) payable public returns (bool) {
        revert();
    }

    /// @notice If promo token is sent back, set promo bonus for the _from address
    function onTransfer(address _from, address _to, uint256 _amount) public returns (bool) {
        if (!paused && _amount > 0 && crowdsale != address(0) && (_to == address(1) || _to == address(this) || _to == address(crowdsale))) {
            crowdsale.setPromoBonus(_from);
        }

        return !paused;
    }

    function onApprove(address, address, uint256) public returns (bool) {
        return !paused;
    }

    /// @notice Retrieve mistakenly sent tokens (other than the etheal token) from the token contract 
    function claimTokenTokens(address _token) public onlyOwner {
        require(_token != address(ethealPromoToken));

        ethealPromoToken.claimTokens(_token);
    }
}