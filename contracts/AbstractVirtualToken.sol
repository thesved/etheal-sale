pragma solidity ^0.4.16;

import "./SafeMath.sol";

/*
 * ERC-20 Standard Token Smart Contract Interface.
 * Copyright © 2016–2017 by ABDK Consulting.
 * Author: Mikhail Vladimirov <mikhail.vladimirov@gmail.com>
 */

/**
 * ERC-20 standard token interface, as defined
 * <a href="http://github.com/ethereum/EIPs/issues/20">here</a>.
 */
contract Token {
    /**
     * Get total number of tokens in circulation.
     *
     * @return total number of tokens in circulation
     */
    function totalSupply () view returns (uint256 supply);

    /**
     * Get number of tokens currently belonging to given owner.
     *
     * @param _owner address to get number of tokens currently belonging to the
     *        owner of
     * @return number of tokens currently belonging to the owner of given address
     */
    function balanceOf (address _owner) view returns (uint256 balance);

    /**
     * Transfer given number of tokens from message sender to given recipient.
     *
     * @param _to address to transfer tokens to the owner of
     * @param _value number of tokens to transfer to the owner of given address
     * @return true if tokens were transferred successfully, false otherwise
     */
    function transfer (address _to, uint256 _value) returns (bool success);

    /**
     * Transfer given number of tokens from given owner to given recipient.
     *
     * @param _from address to transfer tokens from the owner of
     * @param _to address to transfer tokens to the owner of
     * @param _value number of tokens to transfer from given owner to given
     *        recipient
     * @return true if tokens were transferred successfully, false otherwise
     */
    function transferFrom (address _from, address _to, uint256 _value) returns (bool success);

    /**
     * Allow given spender to transfer given number of tokens from message sender.
     *
     * @param _spender address to allow the owner of to transfer tokens from
     *        message sender
     * @param _value number of tokens to allow to transfer
     * @return true if token transfer was successfully approved, false otherwise
     */
    function approve (address _spender, uint256 _value) returns (bool success);

    /**
     * Tell how many tokens given spender is currently allowed to transfer from
     * given owner.
     *
     * @param _owner address to get number of tokens allowed to be transferred
     *        from the owner of
     * @param _spender address to get number of tokens allowed to be transferred
     *        by the owner of
     * @return number of tokens given spender is currently allowed to transfer
     *         from given owner
     */
    function allowance (address _owner, address _spender) view returns (uint256 remaining);

    /**
     * Logged when tokens were transferred from one owner to another.
     *
     * @param _from address of the owner, tokens were transferred from
     * @param _to address of the owner, tokens were transferred to
     * @param _value number of tokens transferred
     */
    event Transfer (address indexed _from, address indexed _to, uint256 _value);

    /**
     * Logged when owner approved his tokens to be transferred by some spender.
     *
     * @param _owner owner who approved his tokens to be transferred
     * @param _spender spender who were allowed to transfer the tokens belonging
     *        to the owner
     * @param _value number of tokens belonging to the owner, approved to be
     *        transferred by the spender
     */
    event Approval (address indexed _owner, address indexed _spender, uint256 _value);
}

/*
 * Abstract Token Smart Contract.  Copyright © 2017 by ABDK Consulting.
 * Author: Mikhail Vladimirov <mikhail.vladimirov@gmail.com>
 * Modified to use SafeMath library by thesved
 */
/**
 * Abstract Token Smart Contract that could be used as a base contract for
 * ERC-20 token contracts.
 */
contract AbstractToken is Token {
    using SafeMath for uint;

    /**
     * Create new Abstract Token contract.
     */
    function AbstractToken () {
        // Do nothing
    }

    /**
     * Get number of tokens currently belonging to given owner.
     *
     * @param _owner address to get number of tokens currently belonging to the owner
     * @return number of tokens currently belonging to the owner of given address
     */
    function balanceOf (address _owner) view returns (uint256 balance) {
        return accounts[_owner];
    }

    /**
     * Transfer given number of tokens from message sender to given recipient.
     *
     * @param _to address to transfer tokens to the owner of
     * @param _value number of tokens to transfer to the owner of given address
     * @return true if tokens were transferred successfully, false otherwise
     */
    function transfer (address _to, uint256 _value) returns (bool success) {
        uint256 fromBalance = accounts[msg.sender];
        if (fromBalance < _value) return false;
        if (_value > 0 && msg.sender != _to) {
            accounts[msg.sender] = fromBalance.sub(_value);
            accounts[_to] = accounts[_to].add(_value);
            Transfer(msg.sender, _to, _value);
        }
        return true;
    }

    /**
     * Transfer given number of tokens from given owner to given recipient.
     *
     * @param _from address to transfer tokens from the owner of
     * @param _to address to transfer tokens to the owner of
     * @param _value number of tokens to transfer from given owner to given recipient
     * @return true if tokens were transferred successfully, false otherwise
     */
    function transferFrom (address _from, address _to, uint256 _value) returns (bool success) {
        uint256 spenderAllowance = allowances[_from][msg.sender];
        if (spenderAllowance < _value) return false;
        uint256 fromBalance = accounts[_from];
        if (fromBalance < _value) return false;

        allowances[_from][msg.sender] = spenderAllowance.sub(_value);

        if (_value > 0 && _from != _to) {
            accounts[_from] = fromBalance.sub(_value);
            accounts[_to] = accounts[_to].add(_value);
            Transfer(_from, _to, _value);
        }
        return true;
    }

    /**
     * Allow given spender to transfer given number of tokens from message sender.
     *
     * @param _spender address to allow the owner of to transfer tokens from
     *        message sender
     * @param _value number of tokens to allow to transfer
     * @return true if token transfer was successfully approved, false otherwise
     */
    function approve (address _spender, uint256 _value) returns (bool success) {
        allowances[msg.sender][_spender] = _value;
        Approval(msg.sender, _spender, _value);

        return true;
    }

    /**
     * Tell how many tokens given spender is currently allowed to transfer from
     * given owner.
     *
     * @param _owner address to get number of tokens allowed to be transferred from the owner
     * @param _spender address to get number of tokens allowed to be transferred by the owner
     * @return number of tokens given spender is currently allowed to transfer from given owner
     */
    function allowance (address _owner, address _spender) view returns (uint256 remaining) {
        return allowances[_owner][_spender];
    }

    /**
     * Mapping from addresses of token holders to the numbers of tokens belonging
     * to these token holders.
     */
    mapping (address => uint256) accounts;

    /**
     * Mapping from addresses of token holders to the mapping of addresses of
     * spenders to the allowances set by these token holders to these spenders.
     */
    mapping (address => mapping (address => uint256)) private allowances;
}


/*
 * Abstract Virtual Token Smart Contract.  Copyright © 2017 by ABDK Consulting.
 * Author: Mikhail Vladimirov <mikhail.vladimirov@gmail.com>
 * Modified to use SafeMath library by thesved
 */

/**
 * Abstract Token Smart Contract that could be used as a base contract for
 * ERC-20 token contracts supporting virtual balance.
 */
contract AbstractVirtualToken is AbstractToken {
    using SafeMath for uint;

    /**
     * Maximum number of real (i.e. non-virtual) tokens in circulation (2^255-1).
     */
    uint256 constant MAXIMUM_TOKENS_COUNT = 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF;

    /**
     * Mask used to extract real balance of an account (2^255-1).
     */
    uint256 constant BALANCE_MASK = 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF;

    /**
     * Mask used to extract "materialized" flag of an account (2^255).
     */
    uint256 constant MATERIALIZED_FLAG_MASK = 0x8000000000000000000000000000000000000000000000000000000000000000;

    /**
     * Create new Abstract Virtual Token contract.
     */
    function AbstractVirtualToken () {
        // Do nothing
    }

    /**
     * Get total number of tokens in circulation.
     *
     * @return total number of tokens in circulation
     */
    function totalSupply () view returns (uint256 supply) {
        return tokensCount;
    }

    /**
     * Get number of tokens currently belonging to given owner.
     *
     * @param _owner address to get number of tokens currently belonging to the owner
     * @return number of tokens currently belonging to the owner of given address
    */
    function balanceOf (address _owner) constant returns (uint256 balance) { 
        return (accounts[_owner] & BALANCE_MASK).add(getVirtualBalance(_owner));
    }

    /**
     * Transfer given number of tokens from message sender to given recipient.
     *
     * @param _to address to transfer tokens to the owner of
     * @param _value number of tokens to transfer to the owner of given address
     * @return true if tokens were transferred successfully, false otherwise
     */
    function transfer (address _to, uint256 _value) returns (bool success) {
        if (_value > balanceOf(msg.sender)) return false;
        else {
            materializeBalanceIfNeeded(msg.sender, _value);
            return AbstractToken.transfer(_to, _value);
        }
    }

    /**
     * Transfer given number of tokens from given owner to given recipient.
     *
     * @param _from address to transfer tokens from the owner of
     * @param _to address to transfer tokens to the owner of
     * @param _value number of tokens to transfer from given owner to given
     *        recipient
     * @return true if tokens were transferred successfully, false otherwise
     */
    function transferFrom (address _from, address _to, uint256 _value) returns (bool success) {
        if (_value > allowance(_from, msg.sender)) return false;
        if (_value > balanceOf(_from)) return false;
        else {
            materializeBalanceIfNeeded(_from, _value);
            return AbstractToken.transferFrom(_from, _to, _value);
        }
    }

    /**
     * Get virtual balance of the owner of given address.
     *
     * @param _owner address to get virtual balance for the owner of
     * @return virtual balance of the owner of given address
     */
    function virtualBalanceOf (address _owner) internal view returns (uint256 _virtualBalance);

    /**
     * Calculate virtual balance of the owner of given address taking into account
     * materialized flag and total number of real tokens already in circulation.
     */
    function getVirtualBalance (address _owner) private view returns (uint256 _virtualBalance) {
        if (accounts [_owner] & MATERIALIZED_FLAG_MASK != 0) return 0;
        else {
            _virtualBalance = virtualBalanceOf(_owner);
            uint256 maxVirtualBalance = MAXIMUM_TOKENS_COUNT.sub(tokensCount);
            if (_virtualBalance > maxVirtualBalance)
                _virtualBalance = maxVirtualBalance;
        }
    }

    /**
     * Materialize virtual balance of the owner of given address if this will help
     * to transfer given number of tokens from it.
     *
     * @param _owner address to materialize virtual balance of
     * @param _value number of tokens to be transferred
     */
    function materializeBalanceIfNeeded (address _owner, uint256 _value) private {
        uint256 storedBalance = accounts[_owner];
        if (storedBalance & MATERIALIZED_FLAG_MASK == 0) {
            // Virtual balance is not materialized yet
            if (_value > storedBalance) {
                // Real balance is not enough
                uint256 virtualBalance = getVirtualBalance(_owner);
                require (_value.sub(storedBalance) <= virtualBalance);
                accounts[_owner] = MATERIALIZED_FLAG_MASK | storedBalance.add(virtualBalance);
                tokensCount = tokensCount.add(virtualBalance);
            }
        }
    }

    /**
    * Number of real (i.e. non-virtual) tokens in circulation.
    */
    uint256 tokensCount;
}