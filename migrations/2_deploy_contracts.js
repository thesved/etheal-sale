var MiniMeTokenFactory = artifacts.require("MiniMeTokenFactory");
var EthealToken = artifacts.require("EthealToken");
var Wallet = artifacts.require("MultiSigWallet");
var PreSale = artifacts.require("EthealPreSale");
var NormalSale = artifacts.require("EthealNormalSale");
var SafeMath = artifacts.require("SafeMath");
var EthealController = artifacts.require("EthealController");
var RefundVault = artifacts.require("RefundVault");
var Hodler = artifacts.require("Hodler");
var TokenVesting = artifacts.require("TokenVesting");

var dateStart = Math.floor(new Date().getTime()/1000)+5*60*60*24; // starts in 5 days
var dateEnd = dateStart + 10*24*60*60; // lasts 10 days

module.exports = function(deployer) {
	return deployer.then(function(){
		// deploy SafeMath first
		return deployer.deploy(SafeMath);
	}).then(function(){
		// link SafeMath
		return deployer.link(SafeMath, [PreSale, NormalSale, RefundVault, EthealController, Hodler, TokenVesting]);
	}).then(function(){
		// then Wallet
		return deployer.deploy(Wallet,[web3.eth.accounts[0],web3.eth.accounts[1],web3.eth.accounts[2]],2);
	}).then(function(){
		// then Factory
		return deployer.deploy(MiniMeTokenFactory);
	}).then(function(){
		// then Controller
		return deployer.deploy(EthealController,Wallet.address);
	}).then(function(){
		// then EthealToken
		return deployer.deploy(EthealToken,EthealController.address,MiniMeTokenFactory.address);
	}).then(function(){
		// set Token for Crowdsale
		return (EthealController.at(EthealController.address)).setEthealToken(EthealToken.address,0);
	}).then(function(){
		// then PreSale
		return deployer.deploy(PreSale,EthealController.address,dateStart,dateEnd,web3.toWei(0.1, "ether"),1000,web3.toWei(10, "ether"),web3.toWei(50, "ether"),120*60*60,web3.toWei(100, "ether"),web3.toWei(100, "gwei"),80,Wallet.address);
	}).then(function(){
		// then NormalSale
		return deployer.deploy(NormalSale,EthealController.address,dateStart,dateEnd,web3.toWei(0.1, "ether"),1000,web3.toWei(50, "ether"),120*60*60,web3.toWei(100, "ether"),web3.toWei(100, "gwei"),80,Wallet.address);
	}).then(function(){
		// set crowdsale
		return (EthealController.at(EthealController.address)).setCrowdsaleTransfer(PreSale.address,web3.toBigNumber(web3.toWei(100,"ether")).mul(1000));
	});	
};