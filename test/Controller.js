import ether from './helpers/ether'
import gwei from './helpers/gwei'
import {advanceBlock} from './helpers/advanceToBlock'
import {increaseTimeTo, duration} from './helpers/increaseTime'
import latestTime from './helpers/latestTime'
import EVMThrow from './helpers/EVMThrow'

const BigNumber = web3.BigNumber

const should = require('chai')
  .use(require('chai-as-promised'))
  .use(require('chai-bignumber')(BigNumber))
  .should()

const Factory = artifacts.require('MiniMeTokenFactory')
const Controller = artifacts.require('EthealController')
const Token = artifacts.require('EthealToken')
const Grant = artifacts.require('TokenVesting')
const Crowdsale = artifacts.require('EthealNormalSale')
const Hodler = artifacts.require('Hodler')

contract('Controller', function ([deployer, investor, wallet, advisor, purchaser, teammate]) {

  const rate = new BigNumber(1000)
  const bonuses = [new BigNumber(1.4), new BigNumber(1.2), new BigNumber(1.15), new BigNumber(1.1), new BigNumber(1.05)]
  
  const cap = ether(10)
  const softCap = ether(5)
  const softCapTime = duration.hours(120)
  const lessThanCap = ether(8)
  const lessThanSoftCap = ether(4)

  const minContribution = ether(0.1)
  const maxGasPrice = gwei(100)
  const aboveGasLimit = maxGasPrice.plus(1)
  const maxGasPenalty = new BigNumber(80)
  const maxGasFix = maxGasPenalty.div(100)

  const expectedTokenAmount = rate.mul(cap)

  before(async function() {
    //Advance to the next block to correctly read time in the solidity "now" function interpreted by testrpc
    await advanceBlock()
  })

  beforeEach(async function () {
    this.startTime = latestTime() + duration.weeks(1);
    this.endTime =   this.startTime + duration.weeks(4);
    this.afterEndTime = this.endTime + duration.seconds(1)

    this.factory = await Factory.new();
    this.controller = await Controller.new(wallet)
    this.token = await Token.new(this.controller.address, this.factory.address)
    await this.controller.setEthealToken(this.token.address, 0)
    this.hodler = Hodler.at(await this.controller.hodlerReward())
  })


  describe('new controller', function () {

    it('should fail to set new controller from other address than wallet', async function () {
      await this.controller.setNewController(1,{from:deployer}).should.be.rejectedWith(EVMThrow)
      await this.controller.setNewController(1,{from:investor}).should.be.rejectedWith(EVMThrow)
    })

    it('should fail to set new controller to 0x0', async function () {
      await this.controller.setNewController(0,{from:wallet}).should.be.rejectedWith(EVMThrow)
    })

    it('should set a new controller by wallet', async function () {
      // set controller to 0x3
      const preC = await this.token.balanceOf(this.controller.address)
      const preN = await this.token.balanceOf(3)
      await this.controller.setNewController(3,{from:wallet}).should.be.fulfilled
      const postC = await this.token.balanceOf(this.controller.address)
      const postN = await this.token.balanceOf(3)

      preC.should.be.bignumber.equal(postN.minus(preN))
      postC.should.be.bignumber.equal(new BigNumber(0))

      // token should change controller
      let owner = await this.token.controller()
      owner.should.equal('0x0000000000000000000000000000000000000003')

      // hodler should change controller
      owner = await this.hodler.owner()
      owner.should.equal('0x0000000000000000000000000000000000000003')      
    })

    it('should fail to set a new controller twice', async function () {
      await this.controller.setNewController(1,{from:wallet}).should.be.fulfilled
      await this.controller.setNewController(1,{from:wallet}).should.be.rejectedWith(EVMThrow)
    })

  })


  describe('new multisig', function () {

    it('should fail to set new multisig from other address than wallet', async function () {
      await this.controller.setNewMultisig(1,{from:deployer}).should.be.rejectedWith(EVMThrow)
      await this.controller.setNewMultisig(1,{from:investor}).should.be.rejectedWith(EVMThrow)
    })

    it('should fail to set new multisig to zero', async function () {
      await this.controller.setNewMultisig(0,{from:wallet}).should.be.rejectedWith(EVMThrow)
    })

    it('should set a new wallet by wallet', async function () {
      // set wallet to 0x3
      await this.controller.setNewMultisig(3,{from:wallet}).should.be.fulfilled

      const multisig = await this.controller.ethealMultisigWallet()
      multisig.should.equal('0x0000000000000000000000000000000000000003') 
    })

  })


  describe('burn', function () {

    it('should fail to burn from other address than wallet', async function () {
      await this.controller.burn(this.controller.address,1,{from:deployer}).should.be.rejectedWith(EVMThrow)
      await this.controller.burn(this.controller.address,1,{from:investor}).should.be.rejectedWith(EVMThrow)
    })

    it('should fail to burn tokens from other than controller or SALE address', async function () {
      await this.controller.burn(deployer,1,{from:wallet}).should.be.rejectedWith(EVMThrow)
    })

    it('should burn tokens from controller address', async function () {
      const pre = await this.token.balanceOf(this.controller.address)
      const preT = await this.token.totalSupply()
      await this.controller.burn(this.controller.address,ether(1),{from:wallet}).should.be.fulfilled
      const post = await this.token.balanceOf(this.controller.address)
      const postT = await this.token.totalSupply()

      pre.minus(post).should.be.bignumber.equal(ether(1))
      preT.minus(postT).should.be.bignumber.equal(ether(1))
    })

    it('should burn tokens from SALE address', async function () {
      const sale = await this.controller.SALE()
      const pre = await this.token.balanceOf(sale)
      const preT = await this.token.totalSupply()
      await this.controller.burn(sale,ether(1),{from:wallet}).should.be.fulfilled
      const post = await this.token.balanceOf(sale)
      const postT = await this.token.totalSupply()

      pre.minus(post).should.be.bignumber.equal(ether(1))
      preT.minus(postT).should.be.bignumber.equal(ether(1))
    })

  })


  describe('recover tokens', function () {

    it('should recover tokens from controller', async function () {
      // create new token
      await this.controller.unpause({from: deployer})
      let newController = await Controller.new(wallet)
      let newToken = await Token.new(newController.address, this.factory.address)
      await newController.setEthealToken(newToken.address, 0)

      // create grant
      await newController.unpause({from: deployer})
      await newController.createGrant(this.controller.address,this.startTime,ether(1),true,true,{from: deployer}).should.be.fulfilled
      const _grant = Grant.at(await newController.tokenGrants(0))

      // after duration we can get all the tokens
      await increaseTimeTo(this.startTime + duration.days(6*30+1))
      await _grant.release(newToken.address).should.be.fulfilled

      let amount = await newToken.balanceOf(this.controller.address)
      amount.should.be.bignumber.equal(ether(1))

      // recover the tokens
      amount = await newToken.balanceOf(investor)
      amount.should.be.bignumber.equal(ether(0))
      await this.controller.extractTokens(newToken.address, investor).should.be.fulfilled
      amount = await newToken.balanceOf(investor)
      amount.should.be.bignumber.equal(ether(1))
    })

    it('should recover tokens from token', async function () {
      // create new token
      await this.controller.unpause({from: deployer})
      let newController = await Controller.new(wallet)
      let newToken = await Token.new(newController.address, this.factory.address)
      await newController.setEthealToken(newToken.address, 0)

      // create grant
      await newController.unpause({from: deployer})
      await newController.createGrant(this.token.address,this.startTime,ether(1),true,true,{from: deployer}).should.be.fulfilled
      const _grant = Grant.at(await newController.tokenGrants(0))

      // after duration we can get all the tokens
      await increaseTimeTo(this.startTime + duration.days(6*30+1))
      await _grant.release(newToken.address).should.be.fulfilled

      let amount = await newToken.balanceOf(this.token.address)
      amount.should.be.bignumber.equal(ether(1))

      // recover the tokens: to the controller
      amount = await newToken.balanceOf(this.controller.address)
      amount.should.be.bignumber.equal(ether(0))
      await this.controller.claimTokenTokens(newToken.address).should.be.fulfilled
      amount = await newToken.balanceOf(this.controller.address)
      amount.should.be.bignumber.equal(ether(1))
    })

  })


  it('should fail to send eth to the token', async function () {
    await this.token.send(ether(1)).should.be.rejectedWith(EVMThrow)
  })

  
  describe('creating a valid crowdsale', function () {

    it('should fail with zero wallet', async function () {
      await Controller.new(0).should.be.rejectedWith(EVMThrow)
    })

  });


  describe('token distribution', function () {

    it('should create a total 100M tokens', async function () {
      const tokens = await this.token.totalSupply()
      tokens.should.be.bignumber.equal(ether(100000000))
    })

    it('should allocate 43M token to SALE address', async function () {
      const sale = await this.controller.SALE()
      const tokens = await this.token.balanceOf(sale)
      tokens.should.be.bignumber.equal(ether(43000000))
    })

    it('should allocate 20M token to wallet address', async function () {
      const tokens = await this.token.balanceOf(wallet)
      tokens.should.be.bignumber.equal(ether(20000000))
    })

    it('should allocate 10M token to HODL address', async function () {
      const tokens = await this.token.balanceOf(this.hodler.address)
      tokens.should.be.bignumber.equal(ether(10000000))
    })

    it('should allocate 20.5M token to controller address', async function () {
      const tokens = await this.token.balanceOf(this.controller.address)
      tokens.should.be.bignumber.equal(ether(20500000))
    })

    it('should allocate 3.5M token to deployer address', async function () {
      const tokens = await this.token.balanceOf(deployer)
      tokens.should.be.bignumber.equal(ether(3500000))
    })

    it('should allocate 3M token to investor address', async function () {
      let investor = await this.controller.INVESTOR1()
      let tokens = await this.token.balanceOf(investor)
      tokens.should.be.bignumber.equal(ether(2000000))
      investor = await this.controller.INVESTOR2()
      tokens = await this.token.balanceOf(investor)
      tokens.should.be.bignumber.equal(ether(1000000))
    })    

  });


  describe('grants', function () {

    it('should not be created by anybody else than deployer', async function () {
      await this.controller.createGrant(advisor,this.startTime,ether(1),true,true,{from: investor}).should.be.rejectedWith(EVMThrow)
      await this.controller.createGrant(advisor,this.startTime,ether(1),true,true,{from: purchaser}).should.be.rejectedWith(EVMThrow)
      await this.controller.createGrant(advisor,this.startTime,ether(1),true,true,{from: advisor}).should.be.rejectedWith(EVMThrow)
      await this.controller.createGrant(advisor,this.startTime,ether(1),true,true,{from: wallet}).should.be.rejectedWith(EVMThrow)
      await this.controller.createGrant(advisor,this.startTime,ether(1),true,true,{from: teammate}).should.be.rejectedWith(EVMThrow)
    })

    it('should be able to grant advisor tokens', async function () {
      // unpause controller
      await this.controller.unpause({from:deployer})

      // create an advisor grant with 1 ether
      await this.controller.createGrant(advisor,this.startTime,ether(1),true,true,{from: deployer}).should.be.fulfilled
      let _grant = Grant.at(await this.controller.tokenGrants(0))
      let _amount = await this.token.balanceOf(_grant.address)
      _amount.should.be.bignumber.equal(ether(1))

      // before vesting release should throw
      await increaseTimeTo(this.startTime)
      await _grant.release(this.token.address).should.be.rejectedWith(EVMThrow)

      // after cliff we can get tokens
      await increaseTimeTo(this.startTime + duration.days(3*30))

      let preG = await this.token.balanceOf(_grant.address)
      let preA = await this.token.balanceOf(advisor)
      await _grant.release(this.token.address).should.be.fulfilled
      let postG = await this.token.balanceOf(_grant.address)
      let postA = await this.token.balanceOf(advisor)

      preG.minus(postG).should.be.bignumber.above(ether(0))
      postA.minus(preA).should.be.bignumber.above(ether(0))

      // 3/4 of vesting time
      await increaseTimeTo(this.startTime + duration.days(9*15))

      preG = await this.token.balanceOf(_grant.address)
      preA = await this.token.balanceOf(advisor)
      await _grant.release(this.token.address).should.be.fulfilled
      postG = await this.token.balanceOf(_grant.address)
      postA = await this.token.balanceOf(advisor)

      preG.minus(postG).should.be.bignumber.above(ether(0))
      postA.minus(preA).should.be.bignumber.above(ether(0))

      // total vesting
      await increaseTimeTo(this.startTime + duration.days(6*30))

      preG = await this.token.balanceOf(_grant.address)
      preA = await this.token.balanceOf(advisor)
      await _grant.release(this.token.address).should.be.fulfilled
      postG = await this.token.balanceOf(_grant.address)
      postA = await this.token.balanceOf(advisor)

      preG.minus(postG).should.be.bignumber.above(ether(0))
      postA.minus(preA).should.be.bignumber.above(ether(0))

      // further vesting should throw
      await _grant.release(this.token.address).should.be.rejectedWith(EVMThrow)
    })

    it('should be able to grant teammate tokens', async function () {
      // unpause controller
      await this.controller.unpause({from:deployer})

      // create an advisor grant with 1 ether
      await this.controller.createGrant(teammate,this.startTime,ether(1),true,false,{from: deployer}).should.be.fulfilled
      let _grant = Grant.at(await this.controller.tokenGrants(0))
      let _amount = await this.token.balanceOf(_grant.address)
      _amount.should.be.bignumber.equal(ether(1))

      // before vesting release should throw
      await increaseTimeTo(this.startTime)
      await _grant.release(this.token.address).should.be.rejectedWith(EVMThrow)

      // after cliff we can get tokens
      await increaseTimeTo(this.startTime + duration.days(365))

      let preG = await this.token.balanceOf(_grant.address)
      let preA = await this.token.balanceOf(teammate)
      await _grant.release(this.token.address).should.be.fulfilled
      let postG = await this.token.balanceOf(_grant.address)
      let postA = await this.token.balanceOf(teammate)

      preG.minus(postG).should.be.bignumber.above(ether(0))
      postA.minus(preA).should.be.bignumber.above(ether(0))

      // 3/4 of vesting time
      await increaseTimeTo(this.startTime + duration.days(3*365))

      preG = await this.token.balanceOf(_grant.address)
      preA = await this.token.balanceOf(teammate)
      await _grant.release(this.token.address).should.be.fulfilled
      postG = await this.token.balanceOf(_grant.address)
      postA = await this.token.balanceOf(teammate)

      preG.minus(postG).should.be.bignumber.above(ether(0))
      postA.minus(preA).should.be.bignumber.above(ether(0))

      // total vesting
      await increaseTimeTo(this.startTime + duration.days(4*365))

      preG = await this.token.balanceOf(_grant.address)
      preA = await this.token.balanceOf(teammate)
      await _grant.release(this.token.address).should.be.fulfilled
      postG = await this.token.balanceOf(_grant.address)
      postA = await this.token.balanceOf(teammate)

      preG.minus(postG).should.be.bignumber.above(ether(0))
      postA.minus(preA).should.be.bignumber.above(ether(0))

      // further vesting should throw
      await _grant.release(this.token.address).should.be.rejectedWith(EVMThrow)
    })

    it('should be able to increase token grant', async function () {
      // create an advisor grant with 1 ether
      await this.controller.createGrant(teammate,this.startTime,ether(1),true,true,{from: deployer}).should.be.fulfilled
      let _grant = Grant.at(await this.controller.tokenGrants(0))
      await this.controller.transferToGrant(0,ether(1),{from: deployer}).should.be.fulfilled
      let _amount = await this.token.balanceOf(_grant.address)
      _amount.should.be.bignumber.equal(ether(2))

      // after start we can't add more tokens
      await increaseTimeTo(this.startTime+duration.seconds(1))
      await this.controller.transferToGrant(0,ether(1),{from: deployer}).should.be.rejectedWith(EVMThrow)
    })

    it('should not be able to revoke non-revokable grant', async function () {
      // create an advisor grant with 1 ether
      await this.controller.createGrant(teammate,this.startTime,ether(1),false,true,{from: deployer}).should.be.fulfilled
      await this.controller.revokeGrant(0).should.be.rejectedWith(EVMThrow)
    })

    it('should not be able to revoke an already revoked grant', async function () {
      // create an advisor grant with 1 ether
      await this.controller.createGrant(teammate,this.startTime,ether(1),true,true,{from: deployer}).should.be.fulfilled
      await this.controller.revokeGrant(0).should.be.fulfilled
      await this.controller.revokeGrant(0).should.be.rejectedWith(EVMThrow)
    })

    it('should be able to revoke before grant start', async function () {
      // create an advisor grant with 1 ether
      await this.controller.createGrant(teammate,this.startTime,ether(1),true,true,{from: deployer}).should.be.fulfilled
      await this.controller.revokeGrant(0).should.be.fulfilled
      let _grant = Grant.at(await this.controller.tokenGrants(0))
      let _amount = await this.token.balanceOf(_grant.address)
      _amount.should.be.bignumber.equal(ether(0))
    })

    it('should be able to revoke before cliff start', async function () {
      // create an advisor grant with 1 ether
      await this.controller.createGrant(teammate,this.startTime,ether(1),true,true,{from: deployer}).should.be.fulfilled
      await increaseTimeTo(this.startTime + duration.days(30))

      await this.controller.revokeGrant(0).should.be.fulfilled
      let _grant = Grant.at(await this.controller.tokenGrants(0))
      let _amount = await this.token.balanceOf(_grant.address)
      _amount.should.be.bignumber.equal(ether(0))
    })

    it('should be able to revoke after cliff', async function () {
      // create an advisor grant with 1 ether
      await this.controller.createGrant(teammate,this.startTime,ether(1),true,true,{from: deployer}).should.be.fulfilled
      await increaseTimeTo(this.startTime + duration.days(3*30))
      
      await this.controller.revokeGrant(0).should.be.fulfilled
      let _grant = Grant.at(await this.controller.tokenGrants(0))
      let _amount = await this.token.balanceOf(_grant.address)
      _amount.should.be.bignumber.below(ether(1))
      _amount.should.be.bignumber.above(ether(0))
    })

    it('should all tokens remain in vesting if revoked after vesting end', async function () {
      // create an advisor grant with 1 ether
      await this.controller.createGrant(teammate,this.startTime,ether(1),true,true,{from: deployer}).should.be.fulfilled
      await increaseTimeTo(this.startTime + duration.days(6*30+1))
      
      await this.controller.revokeGrant(0).should.be.fulfilled
      let _grant = Grant.at(await this.controller.tokenGrants(0))
      let _amount = await this.token.balanceOf(_grant.address)
      _amount.should.be.bignumber.equal(ether(1))
    })

  })

})