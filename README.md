# etheal-sale
Solidity contract for [etheal](https://etheal.com) token and sale rounds

## Contract Structure 

### Basics
* SafeMath: basic OpenZeppelin SafeMath for safe math functions
* Wallet: basic consensys multisig wallet
* Ownable: basic OpenZeppelin Ownable contract
* Pausable: basic OpenZeppelin Pausable contract

### MiniMe
* ERC20: basic ERC20 interface
* ERC20MiniMe: is an ERC20 interface for MiniMe token
* Controlled: basic Controlled contract needed for MiniMe
* MiniMeToken: basic 0.2 version of MiniMe token
* TokenController: token controller interface needed to controll the Etheal MiniMe token
* EthealToken: is a very basic MiniMe token instanciation

### Crowdsale basics
* HasNoTokens: basic token to implement extraction of mistakenly sent tokens
* Crowdsale: basic OpenZeppelin Crowdsale with 3 small modifications
  * ERC20 token replaced with ERC20MiniMe token
  * Distinct tokenTransfer function to make it extensible
  * hasStarted function to know whether the crowdsale is started
* CappedCrowdsale: basic OpenZeppelin CappedCrowdsale contract
  * implementing partial refund (https://github.com/OpenZeppelin/zeppelin-solidity/pull/499)
* FinalizableCrowdsale: basic OpenZeppelin FinalizableCrowdsale contract
* RefundableCrowdsale: basic OpenZeppelin RefundableCrowdsale contract
  * with a modification to forward funds to multisig wallet after reaching the cap, thus securing the funds as soon as it makes sense
* RefundVault: basic OpenZeppelin RefunVault contract
  * with extension of HasNoTokens, to recover mistakenly sent tokens
* TokenVesting: basic OpenZeppelin TokenVesting contract

### EthealController
Controlls the EthealToken contract, the initial HEAL token distribution, handles Grants (vesting tokens for team and advisors), hodler reward and crowdsale.

It is a pausable contract, which is paused at initialization. While paused only this contract and crowdsale contracts can move funds of HEAL token.

It implements HasNoTokens to recover mistakenly sent tokens to this contract.

All the tokens it holds can be used to create and revoke grants, transfer tokens to existing but not started grants.

Tokens for future crowdsales are held at the address of 0x1, which can be only moved to a crowdsale contract. Crowdsale contracts send excess HEAL tokens back to address 0x1. If there is no active crowdsale (which has started but not ended), then it can set a new crowdsale contract and transfer tokens to it.

We have decided to handle crowdsales in separate contract to the EthealController, because there will be several rounds of sales, and the exact timing of round 2 and 3 is unknown yet.

![Token Distribution](https://etheal.com/img/illustrations/sales_chart.svg "Token Distribution")

Token distribution:
* SALE address (0x1): 43M HEAL tokens for future sales rounds
* HODLER reward contract: 10M HEAL tokens
* Deployer of contracts: 3.5M HEAL tokens for referral + bounty tokens
  * excess tokens will be sent to the HODLER reward contract
* Multisig Wallet: 20M HEAL tokens for Community Fund
* EthealController: 20.5M HEAL tokens for team, founders, advisors
  * it can be only withdrawn through grants
    * team: 4 years vesting with one year cliff
    * advisors: 6 months vesting with three months cliff
* 2 investor addresses: 3M HEAL tokens

Only the multisig wallet can burn tokens of the EthealController (which belongs to the team and advisors), or burn not yet assigned crowdsale tokens. In the future the controller may be used to burn some of its own profit.

Also the multisig wallet can replace the EthealController with a new one, which can be used for future updates. This transfers the controller rights of EthealToken and hodler reward contract to the new controller, and transfers all eth and HEAL tokens to the new controller. Previously issued and revoced grants will transfer excess HEAL tokens to the old controller, which can be retrieved after a newController is set.

It also implements proxy functions to hodler reward, which enables crowdsale contracts to set hodler stakes.

It implements proxy functions to EthealToken (MiniMe), which stops transfering HEAL tokens when EthealController is stopped, refuses ETH transfers to the EthealToken contract, invalidates hodler stakes whenever any amount of heal token is moved from an address, and helps to recover accidentally sent tokens (other than the EthealToken) to the EthealToken contract.


### Hodler
Only crowdsale contracts can interract with it, and it accepts modifications until its start time.

Implements hodler reward logic:
Keep tokens intact (can’t move any portion of it) on your wallet for 3/6/9 months after two weeks of ending the normal sale, and 10M HEAL token HODLER reward will be distributed among presale and sale HODLERs in the ratio of their intact stakes to the total amount.

* HODLER lot 3 months: 1,000,000 HEAL
* HODLER lot 6 months: 2,000,000 HEAL
* HODLER lot 9 months: 7,000,000 HEAL

Moving any portion of HEAL tokens from an address invalidates its stakes within the hodler reward.

Remaining HEAL tokens from Referral reward will be moved to hodler lot 9 months.


### EthealPreSale
It is pausable, when paused no contribution is accepted.

It is capped, reaching the cap stops the sale immediately.

It is refundable, when not reaching the goal everyone gets back their full contribution in ETH and all the HEAL tokens is transferred back to the EthealController.

It implements a softcap logic, which means after reaching the soft cap the crowdsale is closed in 120 hours.

Sending funds below the minimum contribution amount (0.1ETH) is rejected.

Sending funds above the maximum gas price (100gwei), calculates stakes on 80%. If you send 5eth with 101gwei gas price results in calculating your funds as 4eth. In case of not reaching minimum goal, 5eth is refunded. In case of reaching the goal you get 4eth * 1250 = 5000 HEAL tokens.

It implements partial refunding for the last contributor, so the user don't have to be smart, the contract is smart instead. If there is only 1 eth remained, and the last contributor send 5 eth, then 4 eth is refunded.

Before token sale start parameters can be changed: max gas price and penalty, minimum contribution, minimum goal and soft and hard caps, starting and end times, and rate.


It implements **whitelist** logic as follows: 
* Whitelisted days can be defined with corresponding max stakes, and whitelisted addresses can contribute until they have stakes no bigger than the max stake defined for that day.
* After whitelist period everyone can contribute until reaching the maximum cap.
* It takes into account the max gas price penalty, eg:
  * if 10eth is the max stake for day 2 of whitelist, and you already have 6eth stakes
  * then either you can send 4eth with gas price less than or equal to 100gwei
  * or 5eth with more than 100gwei gas price, since then 5*80%=4eth stake will be credited to you
* The smartcontract is ***smart***, so the user doesn't have to. Sending excess funds results in partial refund.
  * Eg. in the previous case if you send 10 eth with lower than 100gwei gas price results in crediting 4eth stake to you and refunding 6eth.


### EthealNormalSale
Almost identical to EthealPreSale, except is has no minimum goal thus no refund. Until reaching softcap it sells tokens for 1000 HEAL/ETH, and above the softcap is sells all the 20M HEAL tokens, and everyone get HEAL tokens in proportion of their stakes to the total stakes.

There is a bonus structure, when contributing on the first day people get +40% stakes, on the second day +20% stakes, on the rest of the first week +15% stakes, on the second week +10% stakes and on the third week +5% stakes.
![Normal Sale bonus](https://etheal.com/img/illustrations/tokenbonus.svg "Normal Sale bonus")

## Deployment

### Initial deployment
1) deploy multisig wallet
2) deploy MiniMeTokenFactory
3) deploy EthealController
4) deploy EthealToken with EthealController address and MiniMeTokenFactory address
5) EthealController -> setEthealToken(EthealToken.address, 0)
  * 0 is for the Hodler reward contract address, it means the controller will create and assign to itself a new hodler contract
6) deploy PreSale -> EthealController.address
7) EthealController -> setCrowdsaleTransfer PreSale.address

### Deploying a new crowdsale
*only when no active crowdsale is present*
1) deploy Crowdsale with the address of EthealController
2) send funds and set address with EthealController.setCrowdsaleTransfer

### Deploying a new EthealToken fork
1) EthealToken -> createCloneToken
2) EthealController -> setEthealToken(new EthealToken.address, 0)

### Deploying a new EthealController
*multisig wallet is needed*
1) deploy new EthealController
2) new EthealController -> setEthealToken(EthealToken.address, Hodler.address)
3) old EthealController -> setNewController(new EthealController.address)
