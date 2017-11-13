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
const Crowdsale = artifacts.require('EthealPreSale')
const Hodler = artifacts.require('Hodler')
const Vault = artifacts.require('RefundVault')

contract('PreSale', function ([deployer, investor, wallet, purchaser, purchaser2, purchaser3, purchaser4]) {

  const rate = new BigNumber(1000)
  
  const cap = ether(15)
  const softCap = ether(10)
  const softCapTime = duration.hours(120)
  const goal = ether(5)
  const lessThanCap = ether(10)
  const lessThanSoftCap = ether(5)
  const lessThanGoal = ether(2)

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
    this.endTime =   this.startTime + duration.weeks(1);
    this.afterEndTime = this.endTime + duration.seconds(1)

    this.factory = await Factory.new();
    this.controller = await Controller.new(wallet)
    this.token = await Token.new(this.controller.address, this.factory.address)
    await this.controller.setEthealToken(this.token.address, 0)
    this.hodler = Hodler.at(await this.controller.hodlerReward())

    this.crowdsale = await Crowdsale.new(this.controller.address, this.startTime, this.endTime, minContribution, rate, goal, softCap, softCapTime, cap, maxGasPrice, maxGasPenalty, wallet)
    this.vault = Vault.at(await this.crowdsale.vault())

    await this.controller.setCrowdsaleTransfer(this.crowdsale.address, expectedTokenAmount)
  })


  describe('creating a valid crowdsale', function () {

    it('should fail with zero rate', async function () {
      await Crowdsale.new(this.controller.address, this.startTime, this.endTime, minContribution, 0, goal, softCap, softCapTime, cap, maxGasPrice, maxGasPenalty, wallet).should.be.rejectedWith(EVMThrow);
    })

    it('should fail with zero goal', async function () {
      await Crowdsale.new(this.controller.address, this.startTime, this.endTime, minContribution, rate, 0, softCap, softCapTime, cap, maxGasPrice, maxGasPenalty, wallet).should.be.rejectedWith(EVMThrow);
    })

    it('should fail with zero softCap', async function () {
      await Crowdsale.new(this.controller.address, this.startTime, this.endTime, minContribution, rate, goal, 0, softCapTime, cap, maxGasPrice, maxGasPenalty, wallet).should.be.rejectedWith(EVMThrow);
    })

    it('should fail with zero cap', async function () {
      await Crowdsale.new(this.controller.address, this.startTime, this.endTime, minContribution, rate, goal, softCap, softCapTime, 0, maxGasPrice, maxGasPenalty, wallet).should.be.rejectedWith(EVMThrow);
    })

    it('should fail with greater goal than softCap', async function () {
      await Crowdsale.new(this.controller.address, this.startTime, this.endTime, minContribution, rate, cap, softCap, softCapTime, goal, maxGasPrice, maxGasPenalty, wallet).should.be.rejectedWith(EVMThrow);
    })

    it('should fail with greater softCap than cap', async function () {
      await Crowdsale.new(this.controller.address, this.startTime, this.endTime, minContribution, rate, goal, cap, softCapTime, softCap, maxGasPrice, maxGasPenalty, wallet).should.be.rejectedWith(EVMThrow);
    })

    it('should fail with zero controller', async function () {
      await Crowdsale.new(0, this.startTime, this.endTime, minContribution, rate, goal, softCap, softCapTime, cap, maxGasPrice, maxGasPenalty, wallet).should.be.rejectedWith(EVMThrow);
    })

    it('should fail with zero wallet', async function () {
      await Crowdsale.new(this.controller.address, this.startTime, this.endTime, minContribution, rate, goal, softCap, softCapTime, cap, maxGasPrice, maxGasPenalty, 0).should.be.rejectedWith(EVMThrow);
    })

  });


  describe('modify before sale', function () {

    it('should set valid caps', async function () {
      await this.crowdsale.setCaps(goal, softCap, softCapTime, cap).should.be.fulfilled
    })

    it('should fail to set valid caps after start', async function () {
      await increaseTimeTo(this.afterEndTime)
      await this.crowdsale.setCaps(goal, softCap, softCapTime, cap).should.be.rejectedWith(EVMThrow);
    })

    it('should fail setting zero goal', async function () {
      await this.crowdsale.setCaps(0, softCap, softCapTime, cap).should.be.rejectedWith(EVMThrow);
    })

    it('should fail setting zero softCap', async function () {
      await this.crowdsale.setCaps(goal, 0, softCapTime, cap).should.be.rejectedWith(EVMThrow);
    })

    it('should fail setting zero cap', async function () {
      await this.crowdsale.setCaps(goal, softCap, softCapTime, 0).should.be.rejectedWith(EVMThrow);
    })

    it('should fail setting greater goal than softCap', async function () {
      await this.crowdsale.setCaps(softCap, goal, softCapTime, cap).should.be.rejectedWith(EVMThrow);
    })

    it('should fail setting greater softCap than cap', async function () {
      await this.crowdsale.setCaps(goal, cap, softCapTime, softCap).should.be.rejectedWith(EVMThrow);
    })

    it('should set valid times', async function () {
      await this.crowdsale.setTimes(this.startTime, this.endTime).should.be.fulfilled
    })

    it('should fail to set valid times after start', async function () {
      await increaseTimeTo(this.afterEndTime)
      await this.crowdsale.setTimes(this.startTime, this.endTime).should.be.rejectedWith(EVMThrow);
    })

    it('should fail to set invalid times', async function () {
      await this.crowdsale.setTimes(this.endTime, this.endTime).should.be.rejectedWith(EVMThrow);
      await this.crowdsale.setTimes(latestTime(), this.endTime).should.be.rejectedWith(EVMThrow);
    })

    it('should set valid rate', async function () {
      await this.crowdsale.setRate(rate.plus(1)).should.be.fulfilled
    })

    it('should fail to set valid rate after start', async function () {
      await increaseTimeTo(this.afterEndTime)
      await this.crowdsale.setRate(rate.plus(1)).should.be.rejectedWith(EVMThrow);
    })

    it('should fail to set invalid rate', async function () {
      await this.crowdsale.setRate(0).should.be.rejectedWith(EVMThrow);
    })

  })

  
  it('should own vault', async function () {
    const owner = await this.vault.owner()
    owner.should.equal(this.crowdsale.address)
  })


  describe('ending', function () {

    it('should be ended after end time', async function () {
      let ended = await this.crowdsale.hasEnded()
      ended.should.equal(false)
      await increaseTimeTo(this.afterEndTime)
      ended = await this.crowdsale.hasEnded()
      ended.should.equal(true)
    })

    it('should be ended after soft cap reached', async function () {
      await increaseTimeTo(this.startTime)
      await this.crowdsale.send(softCap).should.be.fulfilled
      let ended = await this.crowdsale.hasEnded()
      ended.should.equal(false)

      let newEndTime = latestTime() + softCapTime + duration.seconds(1)
      await increaseTimeTo(newEndTime)
      ended = await this.crowdsale.hasEnded()
      ended.should.equal(true)
    })

    it('should not end sooner if softCap is not reached', async function () {
      await increaseTimeTo(this.startTime)
      await this.crowdsale.send(goal).should.be.fulfilled
      let ended = await this.crowdsale.hasEnded()
      ended.should.equal(false)

      let newEndTime = latestTime() + softCapTime + duration.seconds(1)
      await increaseTimeTo(newEndTime)
      ended = await this.crowdsale.hasEnded()
      ended.should.equal(false)

      await increaseTimeTo(this.afterEndTime)
      ended = await this.crowdsale.hasEnded()
      ended.should.equal(true)
    })

  })


  describe('accepting payments', function () {

    it('should reject payments before start', async function () {
      await this.crowdsale.send(minContribution).should.be.rejectedWith(EVMThrow)
      await this.crowdsale.buyTokens(investor, {from: purchaser, value: minContribution}).should.be.rejectedWith(EVMThrow)
    })

    it('should reject payments smaller than min contribution', async function () {
      await increaseTimeTo(this.startTime)
      await this.crowdsale.send(minContribution.minus(1)).should.be.rejectedWith(EVMThrow)
      await this.crowdsale.buyTokens(investor, {value: minContribution.minus(1), from: purchaser}).should.be.rejectedWith(EVMThrow)
    })

    it('should accept payments after start', async function () {
      await increaseTimeTo(this.startTime)
      await this.crowdsale.send(minContribution).should.be.fulfilled
      await this.crowdsale.buyTokens(investor, {value: minContribution, from: purchaser}).should.be.fulfilled
    })

    it('should measure buyTokens tx costs', async function () {
        await increaseTimeTo(this.startTime)
        let tx = await this.crowdsale.buyTokens(investor, {value: minContribution, from: purchaser}).should.be.fulfilled
        console.log("*** BUY TOKENS: " + tx.receipt.gasUsed + " gas used.");
    })

    it('should reject payments after end', async function () {
      await increaseTimeTo(this.afterEndTime)
      await this.crowdsale.send(minContribution).should.be.rejectedWith(EVMThrow)
      await this.crowdsale.buyTokens(investor, {value: minContribution, from: purchaser}).should.be.rejectedWith(EVMThrow)
    })

    it('should reject payments outside cap', async function () {
      await increaseTimeTo(this.startTime)

      await this.crowdsale.sendTransaction({value: cap, from: purchaser2}).should.be.fulfilled
      await this.crowdsale.send(1).should.be.rejectedWith(EVMThrow)
    })

    it('should refund payments that exceed cap', async function () {
      await increaseTimeTo(this.startTime)
      const pre = web3.eth.getBalance(purchaser4)

      await this.crowdsale.sendTransaction({value: lessThanCap, from: purchaser3}).should.be.fulfilled
      await this.crowdsale.sendTransaction({value: cap, from: purchaser4, gasPrice:0}).should.be.fulfilled
      
      const post = web3.eth.getBalance(purchaser4)

      pre.minus(post).should.be.bignumber.equal(cap.minus(lessThanCap))
    })

  })

  describe('high-level purchase', function () {

    beforeEach(async function() {
      await increaseTimeTo(this.startTime)
    })

    it('should log purchase', async function () {
      const {logs} = await this.crowdsale.sendTransaction({value: minContribution, from: investor})

      const event = logs.find(e => e.event === 'TokenPurchase')

      should.exist(event)
      event.args._purchaser.should.equal(investor)
      event.args._beneficiary.should.equal(investor)
      event.args._value.should.be.bignumber.equal(minContribution)
      event.args._amount.should.be.bignumber.equal(minContribution.mul(rate))
    })

    it('should assign stake to sender', async function () {
      await this.crowdsale.sendTransaction({value: minContribution, from: investor})
      let balance = await this.crowdsale.stakes(investor);
      balance.should.be.bignumber.equal(minContribution)
    })

    it('should assign lower stake to sender above max gas limit', async function () {
      await this.crowdsale.sendTransaction({value: minContribution, from: investor, gasPrice: aboveGasLimit})
      let balance = await this.crowdsale.stakes(investor);
      balance.should.be.bignumber.equal(minContribution.mul(maxGasFix))
    })

    it('should forward funds to vault', async function () {
      const pre = web3.eth.getBalance(this.vault.address)
      await this.crowdsale.sendTransaction({value: minContribution, from: investor})
      const post = web3.eth.getBalance(this.vault.address)
      post.minus(pre).should.be.bignumber.equal(minContribution)
    })

  })

  describe('low-level purchase', function () {

    beforeEach(async function() {
      await increaseTimeTo(this.startTime)
    })
    
    it('should log purchase', async function () {
      const {logs} = await this.crowdsale.buyTokens(investor, {value: minContribution, from: purchaser})
    
      const event = logs.find(e => e.event === 'TokenPurchase')

      should.exist(event)
      event.args._purchaser.should.equal(purchaser)
      event.args._beneficiary.should.equal(investor)
      event.args._value.should.be.bignumber.equal(minContribution)
      event.args._amount.should.be.bignumber.equal(minContribution.mul(rate))
    })
    
    it('should assign stakes to beneficiary', async function () {
      await this.crowdsale.buyTokens(investor, {value: minContribution, from: purchaser})
      const balance = await this.crowdsale.stakes(investor)
      balance.should.be.bignumber.equal(minContribution)
    })

    it('should assign lower stake to sender above max gas limit', async function () {
      await this.crowdsale.buyTokens(investor, {value: minContribution, from: purchaser, gasPrice: aboveGasLimit})
      let balance = await this.crowdsale.stakes(investor);
      balance.should.be.bignumber.equal(minContribution.mul(maxGasFix))
    })
    
    it('should forward funds to vault', async function () {
      const pre = web3.eth.getBalance(this.vault.address)
      await this.crowdsale.buyTokens(investor, {value: minContribution, from: purchaser})
      const post = web3.eth.getBalance(this.vault.address)
      post.minus(pre).should.be.bignumber.equal(minContribution)
    })

  })


  describe('refund', function () {
    
    it('should deny refunds before end', async function () {
      await this.crowdsale.claimRefund({from: investor}).should.be.rejectedWith(EVMThrow)
      await increaseTimeTo(this.startTime)
      await this.crowdsale.claimRefund({from: investor}).should.be.rejectedWith(EVMThrow)
    })

    it('should deny refunds after end if goal was reached', async function () {
      await increaseTimeTo(this.startTime)
      await this.crowdsale.sendTransaction({value: goal, from: investor})
      await increaseTimeTo(this.afterEndTime)
      await this.crowdsale.claimRefund({from: investor}).should.be.rejectedWith(EVMThrow)
    })

    it('should allow refunds after end if goal was not reached', async function () {
      await increaseTimeTo(this.startTime)
      await this.crowdsale.sendTransaction({value: lessThanGoal, from: investor})
      await increaseTimeTo(this.afterEndTime)

      await this.crowdsale.finalize({from: deployer})

      const pre = web3.eth.getBalance(investor)
      await this.crowdsale.claimRefund({from: investor, gasPrice: 0}).should.be.fulfilled
      const post = web3.eth.getBalance(investor)

      post.minus(pre).should.be.bignumber.equal(lessThanGoal)
    })

    it('should get full refund even when max gas penalty was applied', async function () {
      await increaseTimeTo(this.startTime)
      await this.crowdsale.sendTransaction({value: lessThanGoal, from: investor, gasPrice:aboveGasLimit})
      await increaseTimeTo(this.afterEndTime)

      await this.crowdsale.finalize({from: deployer})

      const pre = web3.eth.getBalance(investor)
      await this.crowdsale.claimRefundsFor([investor],{gasPrice: 0}).should.be.fulfilled
      const post = web3.eth.getBalance(investor)

      post.minus(pre).should.be.bignumber.equal(lessThanGoal)
    })

    it('should forward funds to wallet after end if goal was reached', async function () {
      const pre = web3.eth.getBalance(wallet)

      await increaseTimeTo(this.startTime)
      await this.crowdsale.sendTransaction({value: goal, from: investor})
      await increaseTimeTo(this.afterEndTime)
      
      await this.crowdsale.finalize({from: deployer})
      const post = web3.eth.getBalance(wallet)

      post.minus(pre).should.be.bignumber.equal(goal)
    })

    it('should forward funds to wallet when getting at least goal amount of funds', async function () {
      const pre = web3.eth.getBalance(wallet)

      await increaseTimeTo(this.startTime)
      await this.crowdsale.sendTransaction({value: goal, from: investor})
      
      const post = web3.eth.getBalance(wallet)

      post.minus(pre).should.be.bignumber.equal(goal)
    })

    it('should not forward funds until getting goal amount of funds', async function () {
      const pre = web3.eth.getBalance(wallet)
      const preVault = web3.eth.getBalance(this.vault.address)

      await increaseTimeTo(this.startTime)
      await this.crowdsale.sendTransaction({value: goal.minus(1), from: investor})
      
      const post = web3.eth.getBalance(wallet)
      const postVault = web3.eth.getBalance(this.vault.address)

      post.minus(pre).should.be.bignumber.equal(0)
      postVault.minus(preVault).should.be.bignumber.equal(goal.minus(1))
    })
    
    it('should be able to extract tokens from vault after sale', async function () {
      await increaseTimeTo(this.startTime)
      // cant withdraw before sale end
      await this.crowdsale.extractVaultTokens(this.token.address, wallet).should.be.rejectedWith(EVMThrow)

      // contribute, finalize, unpause, transfer to vault and retrieve it
      await this.crowdsale.sendTransaction({value: goal, from: investor}).should.be.fulfilled
      await increaseTimeTo(this.afterEndTime)
      await this.crowdsale.finalize({from: deployer})
      await this.controller.unpause({from: deployer})
      await this.crowdsale.claimTokensFor([investor],{gasPrice: 0}).should.be.fulfilled
      await this.token.transfer(this.vault.address,1,{from: investor, gasPrice: 0}).should.be.fulfilled

      const preV = await this.token.balanceOf(this.vault.address)
      const preW = await this.token.balanceOf(wallet)
      await this.crowdsale.extractVaultTokens(this.token.address, wallet, {from: deployer}).should.be.fulfilled
      const postV = await this.token.balanceOf(this.vault.address)
      const postW = await this.token.balanceOf(wallet)

      preV.minus(postV).should.be.bignumber.equal(new BigNumber(1))
      postW.minus(preW).should.be.bignumber.equal(new BigNumber(1))
    })

  })


  describe('claim token', function () {
    
    it('should deny claim token before end', async function () {
      await this.crowdsale.claimToken({from: investor}).should.be.rejectedWith(EVMThrow)
      await increaseTimeTo(this.startTime)
      await this.crowdsale.claimToken({from: investor}).should.be.rejectedWith(EVMThrow)
    })

    it('should deny claim token after end if goal was not reached', async function () {
      await increaseTimeTo(this.startTime)
      await this.crowdsale.sendTransaction({value: lessThanGoal, from: investor})
      await increaseTimeTo(this.afterEndTime)
      await this.crowdsale.claimToken({from: investor}).should.be.rejectedWith(EVMThrow)
    })

    it('should allow claim token after end if goal was reached', async function () {
      await increaseTimeTo(this.startTime)
      await this.crowdsale.sendTransaction({value: goal, from: investor})
      await increaseTimeTo(this.afterEndTime)

      // no claim before finalize
      await this.crowdsale.claimToken({from: investor, gasPrice: 0}).should.be.rejectedWith(EVMThrow)

      // valid claim after finalize
      await this.crowdsale.finalize({from: deployer})
      const pre = await this.token.balanceOf(investor)
      await this.crowdsale.claimTokensFor([investor],{gasPrice: 0}).should.be.fulfilled
      const post = await this.token.balanceOf(investor)

      post.minus(pre).should.be.bignumber.equal(goal.mul(rate))

      // invalid claim after finalize
      await this.crowdsale.claimToken({from: purchaser, gasPrice: 0}).should.be.rejectedWith(EVMThrow)
    })

    it('should calculate with max gas penalty when claiming tokens', async function () {
      await increaseTimeTo(this.startTime)
      await this.crowdsale.sendTransaction({value: goal, from: investor, gasPrice:aboveGasLimit})
      await increaseTimeTo(this.afterEndTime)

      // valid claim after finalize
      await this.crowdsale.finalize({from: deployer})
      const pre = await this.token.balanceOf(investor)
      await this.crowdsale.claimToken({from: investor, gasPrice: 0}).should.be.fulfilled
      const post = await this.token.balanceOf(investor)

      post.minus(pre).should.be.bignumber.equal(goal.mul(rate).mul(maxGasFix))
    })

    it('should send back excess tokens to controller\'s SALE address', async function () {
      await increaseTimeTo(this.startTime)
      await this.crowdsale.sendTransaction({value: goal, from: investor})
      await increaseTimeTo(this.afterEndTime)

      // valid claim after finalize
      const sale = await this.controller.SALE()
      const pre = await this.token.balanceOf(sale)
      await this.crowdsale.finalize({from: deployer})
      const post = await this.token.balanceOf(sale)

      post.minus(pre).should.be.bignumber.equal(cap.minus(goal).mul(rate))
    })

    it('should allow token transfer after controller unpaused', async function () {
      await increaseTimeTo(this.startTime)
      await this.crowdsale.sendTransaction({value: goal, from: investor})
      await increaseTimeTo(this.afterEndTime)

      // valid claim after finalize
      await this.crowdsale.finalize({from: deployer})
      await this.crowdsale.claimToken({from: investor, gasPrice: 0}).should.be.fulfilled

      // invalid transfer until controller is paused
      await this.token.transfer(purchaser,goal.mul(rate),{from: investor, gasPrice: 0}).should.be.rejectedWith(EVMThrow)

      // valid transfer after controller unpaused
      await this.controller.unpause({from:deployer})
      await this.token.transfer(purchaser,goal.mul(rate),{from: investor, gasPrice: 0}).should.be.fulfilled
    })

  })


  describe('whitelist', function () {

    it('should allow to set whitelist until start', async function () {
      await this.crowdsale.setWhitelist([investor,purchaser],[],[ether(1),ether(2)]).should.be.fulfilled
    })

    it('should not allow to set whitelist after start', async function () {
      await this.crowdsale.setWhitelist([investor,purchaser],[],[ether(1),ether(2)]).should.be.fulfilled
      await increaseTimeTo(this.startTime)
      await this.crowdsale.setWhitelist([investor,purchaser],[],[ether(1),ether(2)]).should.be.rejectedWith(EVMThrow)
    })

    it('should allow to delete from the whitelist', async function () {
      // add
      await this.crowdsale.setWhitelist([investor,purchaser],[],[ether(1),ether(2)]).should.be.fulfilled

      let ok = await this.crowdsale.whitelist(investor)
      ok.should.equal(true)

      ok = await this.crowdsale.whitelist(purchaser)
      ok.should.equal(true)

      let wlDays = await this.crowdsale.whitelistDayCount()
      wlDays.should.be.bignumber.equal(new BigNumber(2))

      // remove
      await this.crowdsale.setWhitelist([],[purchaser],[]).should.be.fulfilled

      ok = await this.crowdsale.whitelist(investor)
      ok.should.equal(true)

      ok = await this.crowdsale.whitelist(purchaser)
      ok.should.equal(false)

      wlDays = await this.crowdsale.whitelistDayCount()
      wlDays.should.be.bignumber.equal(new BigNumber(2))
    })

    it('should allow to modify whitelist days', async function () {
      // set to 2 days with 1 and 2 ether stake limits
      await this.crowdsale.setWhitelist([investor],[],[ether(1),ether(2)]).should.be.fulfilled

      let ok = await this.crowdsale.whitelist(investor)
      ok.should.equal(true)

      let wlDays = await this.crowdsale.whitelistDayCount()
      wlDays.should.be.bignumber.equal(new BigNumber(2))

      let limit = await this.crowdsale.whitelistDayMaxStake(0)
      limit.should.be.bignumber.equal(ether(0))
      
      limit = await this.crowdsale.whitelistDayMaxStake(1)
      limit.should.be.bignumber.equal(ether(1))
      
      limit = await this.crowdsale.whitelistDayMaxStake(2)
      limit.should.be.bignumber.equal(ether(2))

      // set to 1 day with 2 ether stake limit
      await this.crowdsale.setWhitelist([],[],[ether(2)]).should.be.fulfilled

      ok = await this.crowdsale.whitelist(investor)
      ok.should.equal(true)

      wlDays = await this.crowdsale.whitelistDayCount()
      wlDays.should.be.bignumber.equal(new BigNumber(1))

      limit = await this.crowdsale.whitelistDayMaxStake(0)
      limit.should.be.bignumber.equal(ether(0))
      
      limit = await this.crowdsale.whitelistDayMaxStake(1)
      limit.should.be.bignumber.equal(ether(2))
      
      // should be 2 ether, since it is overwriting till the new length
      limit = await this.crowdsale.whitelistDayMaxStake(2)
      limit.should.be.bignumber.equal(ether(2))
    })

    it('should not allow unwhitelisted contribution during whitelist period', async function () {
      await this.crowdsale.setWhitelist([investor],[],[minContribution.mul(2),minContribution.mul(3)]).should.be.fulfilled
      await increaseTimeTo(this.startTime)

      await this.crowdsale.sendTransaction({value: minContribution, from: purchaser3}).should.be.rejectedWith(EVMThrow)
    })

    it('should allow contribution during whitelist period for whitelist addresses', async function () {
      await this.crowdsale.setWhitelist([investor],[],[minContribution.mul(2),minContribution.mul(3)]).should.be.fulfilled
      await increaseTimeTo(this.startTime)

      await this.crowdsale.sendTransaction({value: minContribution, from: investor}).should.be.fulfilled
      await this.crowdsale.sendTransaction({value: minContribution, from: purchaser}).should.be.rejectedWith(EVMThrow)

      await increaseTimeTo(this.startTime+duration.days(2))
      await this.crowdsale.sendTransaction({value: minContribution, from: purchaser}).should.be.fulfilled
    })

    it('should apply max gas price penalty during whitelist period', async function () {
      await this.crowdsale.setWhitelist([investor],[],[minContribution.mul(2),minContribution.mul(3)]).should.be.fulfilled
      await increaseTimeTo(this.startTime)

      await this.crowdsale.sendTransaction({value: minContribution.mul(2).div(maxGasFix), from: investor, gasPrice:aboveGasLimit}).should.be.fulfilled
      
      const stake = await this.crowdsale.stakes(investor)

      stake.should.be.bignumber.equal(minContribution.mul(2))
    })

    it('should refund excess contribution during whitelist period', async function () {
      await this.crowdsale.setWhitelist([investor],[],[minContribution.mul(2),minContribution.mul(3)]).should.be.fulfilled
      await increaseTimeTo(this.startTime)

      const pre = web3.eth.getBalance(investor)
      await this.crowdsale.sendTransaction({value: minContribution.mul(5), from: investor, gasPrice:0}).should.be.fulfilled
      const post = web3.eth.getBalance(investor)

      pre.minus(post).should.be.bignumber.equal(minContribution.mul(2))
    })

    it('should deny contribution above whitelist limit during whitelist period', async function () {
      await this.crowdsale.setWhitelist([investor],[],[minContribution.mul(2),minContribution.mul(3)]).should.be.fulfilled
      await increaseTimeTo(this.startTime)

      await this.crowdsale.sendTransaction({value: minContribution.mul(2), from: investor}).should.be.fulfilled
      await this.crowdsale.sendTransaction({value: 1, from: investor}).should.be.rejectedWith(EVMThrow)
    })

  })


  // the normale sale contract starts the hodl contract, so we can't test withdrawal with presale contract
  describe('hodl', function () {

    it('controller should own hodler', async function () {
      const owner = await this.hodler.owner()
      owner.should.equal(this.controller.address)
    })

    it('should not allow to add hodler stake for anyone', async function () {
      await this.hodler.addHodlerStake(investor,1,{from: investor}).should.be.rejectedWith(EVMThrow)
      await this.hodler.addHodlerStake(investor,1,{from: wallet}).should.be.rejectedWith(EVMThrow)
      await this.hodler.addHodlerStake(investor,1,{from: deployer}).should.be.rejectedWith(EVMThrow)
    })

    it('should set hodl stake based on contribution', async function () {
      await increaseTimeTo(this.startTime)
      await this.crowdsale.sendTransaction({value:goal, from: investor, gasPrice:0}).should.be.fulfilled
      let hodl = await this.hodler.hodlerStakes(investor)
      hodl[0].should.be.bignumber.equal(new BigNumber(0)) // no stake before claiming tokens

      await increaseTimeTo(this.afterEndTime)
      await this.crowdsale.finalize({from: deployer})
      await this.crowdsale.claimToken({from: investor, gasPrice: 0}).should.be.fulfilled

      hodl = await this.hodler.hodlerStakes(investor)
      hodl[0].should.be.bignumber.equal(goal.mul(rate))
    })

    it('should set hodl stake based on multiple contributions', async function () {
      await increaseTimeTo(this.startTime)
      await this.crowdsale.sendTransaction({value:goal.div(2), from: investor, gasPrice:0}).should.be.fulfilled
      await this.crowdsale.sendTransaction({value:goal.div(2), from: investor, gasPrice:0}).should.be.fulfilled
      let hodl = await this.hodler.hodlerStakes(investor)
      hodl[0].should.be.bignumber.equal(new BigNumber(0)) // no stake before claiming tokens

      await increaseTimeTo(this.afterEndTime)
      await this.crowdsale.finalize({from: deployer})
      await this.crowdsale.claimToken({from: investor, gasPrice: 0}).should.be.fulfilled

      hodl = await this.hodler.hodlerStakes(investor)
      hodl[0].should.be.bignumber.equal(goal.mul(rate))
    })

    it('should set hodl stake and apply max gas penalty', async function () {
      await increaseTimeTo(this.startTime)
      await this.crowdsale.sendTransaction({value: goal, from: investor, gasPrice: aboveGasLimit}).should.be.fulfilled
      let hodl = await this.hodler.hodlerStakes(investor)
      hodl[0].should.be.bignumber.equal(new BigNumber(0)) // no stake before claiming tokens

      await increaseTimeTo(this.afterEndTime)
      await this.crowdsale.finalize({from: deployer})
      await this.crowdsale.claimToken({from: investor, gasPrice: 0}).should.be.fulfilled

      hodl = await this.hodler.hodlerStakes(investor)
      hodl[0].should.be.bignumber.equal(goal.mul(rate).mul(maxGasFix))
    })

    it('should invalidate hodl stake after transfer', async function () {
      await increaseTimeTo(this.startTime)
      await this.crowdsale.sendTransaction({value:goal, from: investor, gasPrice:0}).should.be.fulfilled
      let hodl = await this.hodler.hodlerStakes(investor)
      hodl[0].should.be.bignumber.equal(new BigNumber(0)) // no stake before claiming tokens

      await increaseTimeTo(this.afterEndTime)
      await this.crowdsale.finalize({from: deployer})
      await this.controller.unpause({from: deployer})
      await this.crowdsale.claimToken({from: investor, gasPrice: 0}).should.be.fulfilled

      hodl = await this.hodler.hodlerStakes(investor)
      hodl[0].should.be.bignumber.equal(goal.mul(rate))
      hodl[1].should.equal(false)

      await this.token.transfer(purchaser,1,{from: investor, gasPrice:0}).should.be.fulfilled
      hodl = await this.hodler.hodlerStakes(investor)
      hodl[0].should.be.bignumber.equal(goal.mul(rate))
      hodl[1].should.equal(true)
    })

    // token transfer wont be enabled until end of normal sale, so buyers can't invalidate their stakes between pre and normal sale
    it('should not invalidate hodl stake if receiving transfer and stake should remain unchanged', async function () {
      await increaseTimeTo(this.startTime)
      await this.crowdsale.sendTransaction({value:goal.div(2), from: investor, gasPrice:0}).should.be.fulfilled
      await this.crowdsale.sendTransaction({value:goal.div(2), from: purchaser, gasPrice:0}).should.be.fulfilled

      // transfer tokens from investor to purchaser
      await increaseTimeTo(this.afterEndTime)
      await this.crowdsale.finalize({from: deployer})
      await this.controller.unpause({from: deployer})
      await this.crowdsale.claimTokensFor([investor, purchaser],{gasPrice: 0}).should.be.fulfilled
      await this.token.transfer(purchaser,1,{from: investor, gasPrice:0}).should.be.fulfilled

      // investor should be invalidated
      let hodl = await this.hodler.hodlerStakes(investor)
      hodl[0].should.be.bignumber.equal(goal.div(2).mul(rate))
      hodl[1].should.equal(true)

      // purchaser should not be invalidated
      hodl = await this.hodler.hodlerStakes(purchaser)
      hodl[0].should.be.bignumber.equal(goal.div(2).mul(rate))
      hodl[1].should.equal(false)
    })

  })

})