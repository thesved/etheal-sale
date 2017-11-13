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
const Crowdsale = artifacts.require('EthealNormalSale')
const Hodler = artifacts.require('Hodler')

contract('NormalSale', function ([deployer, investor, wallet, purchaser, purchaser2, purchaser3, purchaser4]) {

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

    this.crowdsale = await Crowdsale.new(this.controller.address, this.startTime, this.endTime, minContribution, rate, softCap, softCapTime, cap, maxGasPrice, maxGasPenalty, wallet)

    await this.controller.setCrowdsaleTransfer(this.crowdsale.address, expectedTokenAmount)
  })

  
  describe('creating a valid crowdsale', function () {

    it('should fail with zero rate', async function () {
      await Crowdsale.new(this.controller.address, this.startTime, this.endTime, minContribution, 0, softCap, softCapTime, cap, maxGasPrice, maxGasPenalty, wallet).should.be.rejectedWith(EVMThrow);
    })

    it('should fail with zero cap', async function () {
      await Crowdsale.new(this.controller.address, this.startTime, this.endTime, minContribution, rate, softCap, softCapTime, 0, maxGasPrice, maxGasPenalty, wallet).should.be.rejectedWith(EVMThrow);
    })

    it('should fail with greater softCap than cap', async function () {
      await Crowdsale.new(this.controller.address, this.startTime, this.endTime, minContribution, rate, cap, softCapTime, softCap, maxGasPrice, maxGasPenalty, wallet).should.be.rejectedWith(EVMThrow);
    })

    it('should fail with zero controller', async function () {
      await Crowdsale.new(0, this.startTime, this.endTime, minContribution, rate, softCap, softCapTime, cap, maxGasPrice, maxGasPenalty, wallet).should.be.rejectedWith(EVMThrow);
    })

    it('should fail with zero wallet', async function () {
      await Crowdsale.new(this.controller.address, this.startTime, this.endTime, minContribution, rate, softCap, softCapTime, cap, maxGasPrice, maxGasPenalty, 0).should.be.rejectedWith(EVMThrow);
    })

  });


  describe('modify before sale', function () {

    it('should set valid caps', async function () {
      await this.crowdsale.setCaps(softCap, softCapTime, cap).should.be.fulfilled
    })

    it('should fail to set valid caps after start', async function () {
      await increaseTimeTo(this.afterEndTime)
      await this.crowdsale.setCaps(softCap, softCapTime, cap).should.be.rejectedWith(EVMThrow);
    })

    it('should fail setting zero cap', async function () {
      await this.crowdsale.setCaps(softCap, softCapTime, 0).should.be.rejectedWith(EVMThrow);
    })

    it('should fail setting greater softCap than cap', async function () {
      await this.crowdsale.setCaps(cap, softCapTime, softCap).should.be.rejectedWith(EVMThrow);
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
      await this.crowdsale.send(minContribution).should.be.fulfilled
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



  describe('bonus', function () {

    it('should fail to calc bonus before start', async function () {
      await this.crowdsale.getStakeMultiplyerNow().should.be.rejectedWith(EVMThrow)
    })

    it('should calc 40% bonus on first day', async function () {
      const bonus = await this.crowdsale.getStakeMultiplyer(this.startTime)
      bonus.should.be.bignumber.equal(bonuses[0].mul(100))
    })

    it('should calc 20% bonus on second day', async function () {
      const bonus = await this.crowdsale.getStakeMultiplyer(this.startTime+duration.days(1))
      bonus.should.be.bignumber.equal(bonuses[1].mul(100))
    })

    it('should calc 15% bonus on rest of the first week', async function () {
      let bonus =  0
      for (let i = 2; i < 7; i++) {
        bonus = await this.crowdsale.getStakeMultiplyer(this.startTime+duration.days(i))
        bonus.should.be.bignumber.equal(bonuses[2].mul(100))
      }
    })

    it('should calc 10% bonus during second week', async function () {
      let bonus =  0
      for (let i = 7; i < 14; i++) {
        bonus = await this.crowdsale.getStakeMultiplyer(this.startTime+duration.days(i))
        bonus.should.be.bignumber.equal(bonuses[3].mul(100))
      }
    })

    it('should calc 5% bonus during third week', async function () {
      let bonus =  0
      for (let i = 14; i < 21; i++) {
        bonus = await this.crowdsale.getStakeMultiplyer(this.startTime+duration.days(i))
        bonus.should.be.bignumber.equal(bonuses[4].mul(100))
      }
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
      event.args._stake.should.be.bignumber.equal(minContribution.mul(bonuses[0]))
    })

    it('should assign 40% bonus for first day', async function () {
      await this.crowdsale.sendTransaction({value: minContribution, from: investor})
      let balance = await this.crowdsale.stakes(investor);
      balance.should.be.bignumber.equal(minContribution.mul(bonuses[0]))
    })

    it('should assign lower stake to sender above max gas limit', async function () {
      await this.crowdsale.sendTransaction({value: minContribution, from: investor, gasPrice: aboveGasLimit})
      let balance = await this.crowdsale.stakes(investor);
      balance.should.be.bignumber.equal(minContribution.mul(maxGasFix).mul(bonuses[0]))
    })

    it('should assign 20% bonus for second day', async function () {
      await increaseTimeTo(this.startTime+duration.days(1))
      await this.crowdsale.sendTransaction({value: minContribution, from: investor})
      let balance = await this.crowdsale.stakes(investor);
      balance.should.be.bignumber.equal(minContribution.mul(bonuses[1]))
    })

    it('should assign 15% bonus for rest of the first week', async function () {
      await increaseTimeTo(this.startTime+duration.days(2))
      await this.crowdsale.sendTransaction({value: minContribution, from: investor})
      let balance = await this.crowdsale.stakes(investor);
      balance.should.be.bignumber.equal(minContribution.mul(bonuses[2]))
    })

    it('should assign 10% bonus for second week', async function () {
      await increaseTimeTo(this.startTime+duration.days(7))
      await this.crowdsale.sendTransaction({value: minContribution, from: investor})
      let balance = await this.crowdsale.stakes(investor);
      balance.should.be.bignumber.equal(minContribution.mul(bonuses[3]))
    })

    it('should assign 5% bonus for third week', async function () {
      await increaseTimeTo(this.startTime+duration.days(14))
      await this.crowdsale.sendTransaction({value: minContribution, from: investor})
      let balance = await this.crowdsale.stakes(investor);
      balance.should.be.bignumber.equal(minContribution.mul(bonuses[4]))
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
      event.args._stake.should.be.bignumber.equal(minContribution.mul(bonuses[0]))
    })
    
    it('should assign 40% bonus for first day', async function () {
      await this.crowdsale.buyTokens(investor, {value: minContribution, from: purchaser})
      const balance = await this.crowdsale.stakes(investor)
      balance.should.be.bignumber.equal(minContribution.mul(bonuses[0]))
    })

    it('should assign lower stake to sender above max gas limit', async function () {
      await this.crowdsale.buyTokens(investor, {value: minContribution, from: purchaser, gasPrice: aboveGasLimit})
      let balance = await this.crowdsale.stakes(investor);
      balance.should.be.bignumber.equal(minContribution.mul(maxGasFix).mul(bonuses[0]))
    })

    it('should assign 20% bonus for second day', async function () {
      await increaseTimeTo(this.startTime+duration.days(1))
      await this.crowdsale.buyTokens(investor, {value: minContribution, from: purchaser})
      let balance = await this.crowdsale.stakes(investor);
      balance.should.be.bignumber.equal(minContribution.mul(bonuses[1]))
    })

    it('should assign 15% bonus for rest of the first week', async function () {
      await increaseTimeTo(this.startTime+duration.days(2))
      await this.crowdsale.buyTokens(investor, {value: minContribution, from: purchaser})
      let balance = await this.crowdsale.stakes(investor);
      balance.should.be.bignumber.equal(minContribution.mul(bonuses[2]))
    })

    it('should assign 10% bonus for second week', async function () {
      await increaseTimeTo(this.startTime+duration.days(7))
      await this.crowdsale.buyTokens(investor, {value: minContribution, from: purchaser})
      let balance = await this.crowdsale.stakes(investor);
      balance.should.be.bignumber.equal(minContribution.mul(bonuses[3]))
    })

    it('should assign 5% bonus for third week', async function () {
      await increaseTimeTo(this.startTime+duration.days(14))
      await this.crowdsale.buyTokens(investor, {value: minContribution, from: purchaser})
      let balance = await this.crowdsale.stakes(investor);
      balance.should.be.bignumber.equal(minContribution.mul(bonuses[4]))
    })

  })


  describe('claim token', function () {
    
    it('should deny claim token before finish', async function () {
      await this.crowdsale.claimToken({from: investor}).should.be.rejectedWith(EVMThrow)
      await increaseTimeTo(this.startTime)
      await this.crowdsale.claimToken({from: investor}).should.be.rejectedWith(EVMThrow)
    })

    // below soft cap we sell for fixed price
    it('should allow claim token after finish below softCap', async function () {
      await increaseTimeTo(this.startTime)
      await this.crowdsale.sendTransaction({value: lessThanSoftCap, from: investor})
      await increaseTimeTo(this.afterEndTime)

      // no claim before finalize
      await this.crowdsale.claimToken({from: investor, gasPrice: 0}).should.be.rejectedWith(EVMThrow)

      // valid claim after finalize
      await this.crowdsale.finalize({from: deployer})
      const pre = await this.token.balanceOf(investor)
      await this.crowdsale.claimTokensFor([investor],{gasPrice: 0}).should.be.fulfilled
      const post = await this.token.balanceOf(investor)

      post.minus(pre).should.be.bignumber.equal(lessThanSoftCap.mul(bonuses[0]).mul(rate))

      // invalid claim after finalize
      await this.crowdsale.claimToken({from: purchaser, gasPrice: 0}).should.be.rejectedWith(EVMThrow)
    })

    // when reaching soft cap we distribute all tokens
    it('should allow claim token after finish reaching soft cap', async function () {
      await increaseTimeTo(this.startTime)
      await this.crowdsale.sendTransaction({value: softCap, from: investor})
      await increaseTimeTo(this.afterEndTime)

      // no claim before finalize
      await this.crowdsale.claimToken({from: investor, gasPrice: 0}).should.be.rejectedWith(EVMThrow)

      // valid claim after finalize
      await this.crowdsale.finalize({from: deployer})
      const pre = await this.token.balanceOf(investor)
      await this.crowdsale.claimTokensFor([investor],{gasPrice: 0}).should.be.fulfilled
      const post = await this.token.balanceOf(investor)

      post.minus(pre).should.be.bignumber.equal(cap.mul(rate))

      // invalid claim after finalize
      await this.crowdsale.claimToken({from: purchaser, gasPrice: 0}).should.be.rejectedWith(EVMThrow)
    })

    it('should correctly distribute among multiple participants when buying on separate days', async function () {
      await increaseTimeTo(this.startTime)
      await this.crowdsale.sendTransaction({value: cap.div(2), from: investor})

      await increaseTimeTo(this.startTime+duration.days(2))
      await this.crowdsale.sendTransaction({value: cap.div(2), from: purchaser})

      await increaseTimeTo(this.afterEndTime)

      // no claim before finalize
      await this.crowdsale.claimToken({from: investor, gasPrice: 0}).should.be.rejectedWith(EVMThrow)

      // valid claim after finalize
      await this.crowdsale.finalize({from: deployer})
      const preInvestor = await this.token.balanceOf(investor)
      const prePurchaser = await this.token.balanceOf(purchaser)
      await this.crowdsale.claimTokensFor([investor, purchaser],{gasPrice: 0}).should.be.fulfilled
      const postInvestor = await this.token.balanceOf(investor)
      const postPurchaser = await this.token.balanceOf(purchaser)

      const totalToken = cap.mul(rate)
      const stakeInvestor = cap.div(2).mul(bonuses[0])
      const stakePurchaser = cap.div(2).mul(bonuses[2])
      const stakeTotal = stakeInvestor.plus(stakePurchaser)
      postInvestor.minus(preInvestor).should.be.bignumber.equal(totalToken.mul(stakeInvestor).div(stakeTotal).floor())
      postPurchaser.minus(prePurchaser).should.be.bignumber.equal(totalToken.mul(stakePurchaser).div(stakeTotal).floor())

      // invalid claim after finalize
      await this.crowdsale.claimToken({from: purchaser, gasPrice: 0}).should.be.rejectedWith(EVMThrow)
    })

    it('should calculate with max gas penalty when claiming tokens', async function () {
      await increaseTimeTo(this.startTime)
      await this.crowdsale.sendTransaction({value: lessThanSoftCap, from: investor, gasPrice:aboveGasLimit})
      await increaseTimeTo(this.afterEndTime)

      // valid claim after finalize
      await this.crowdsale.finalize({from: deployer})
      const pre = await this.token.balanceOf(investor)
      await this.crowdsale.claimToken({from: investor, gasPrice: 0}).should.be.fulfilled
      const post = await this.token.balanceOf(investor)

      post.minus(pre).should.be.bignumber.equal(lessThanSoftCap.mul(bonuses[0]).mul(rate).mul(maxGasFix))
    })

    it('should send back excess tokens to controller\'s SALE address', async function () {
      await increaseTimeTo(this.startTime)
      await this.crowdsale.sendTransaction({value: lessThanSoftCap, from: investor})
      await increaseTimeTo(this.afterEndTime)

      // valid claim after finalize
      const sale = await this.controller.SALE()
      const pre = await this.token.balanceOf(sale)
      await this.crowdsale.finalize({from: deployer})
      const post = await this.token.balanceOf(sale)

      post.minus(pre).should.be.bignumber.equal(cap.mul(rate).minus(lessThanSoftCap.mul(bonuses[0]).mul(rate)))
    })

    it('should allow token transfer after controller unpaused', async function () {
      await increaseTimeTo(this.startTime)
      await this.crowdsale.sendTransaction({value: lessThanSoftCap, from: investor})
      await increaseTimeTo(this.afterEndTime)

      // valid claim after finalize
      await this.crowdsale.finalize({from: deployer})
      await this.crowdsale.claimToken({from: investor, gasPrice: 0}).should.be.fulfilled

      // invalid transfer until controller is paused
      await this.token.transfer(purchaser,1,{from: investor, gasPrice: 0}).should.be.rejectedWith(EVMThrow)

      // valid transfer after controller unpaused
      await this.controller.unpause({from:deployer})
      await this.token.transfer(purchaser,1,{from: investor, gasPrice: 0}).should.be.fulfilled
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

      let contribute = minContribution.mul(2).div(maxGasFix).div(bonuses[0]).floor()
      await this.crowdsale.sendTransaction({value: contribute, from: investor, gasPrice:aboveGasLimit}).should.be.fulfilled
      
      const stake = await this.crowdsale.stakes(investor)
      stake.should.be.bignumber.equal(contribute.mul(maxGasFix).mul(bonuses[0]).floor())
    })

    it('should refund excess contribution during whitelist period', async function () {
      await this.crowdsale.setWhitelist([investor],[],[minContribution.mul(2),minContribution.mul(3)]).should.be.fulfilled
      await increaseTimeTo(this.startTime)

      const pre = web3.eth.getBalance(investor)
      await this.crowdsale.sendTransaction({value: minContribution.mul(5), from: investor, gasPrice:0}).should.be.fulfilled
      const post = web3.eth.getBalance(investor)

      pre.minus(post).should.be.bignumber.equal(minContribution.mul(2).div(bonuses[0]).floor())
    })

    it('should deny contribution above whitelist limit during whitelist period', async function () {
      await this.crowdsale.setWhitelist([investor],[],[minContribution.mul(2),minContribution.mul(3)]).should.be.fulfilled
      await increaseTimeTo(this.startTime)

      await this.crowdsale.sendTransaction({value: minContribution.mul(2).div(bonuses[0]).floor(), from: investor}).should.be.fulfilled
      await this.crowdsale.sendTransaction({value: 1, from: investor}).should.be.rejectedWith(EVMThrow)
    })

  })


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
      await this.crowdsale.sendTransaction({value:softCap, from: investor, gasPrice:0}).should.be.fulfilled
      let hodl = await this.hodler.hodlerStakes(investor)
      hodl[0].should.be.bignumber.equal(new BigNumber(0)) // no stake before claiming tokens

      await increaseTimeTo(this.afterEndTime)
      await this.crowdsale.finalize({from: deployer})
      await this.crowdsale.claimToken({from: investor, gasPrice: 0}).should.be.fulfilled

      hodl = await this.hodler.hodlerStakes(investor)
      hodl[0].should.be.bignumber.equal(cap.mul(rate))
    })

    it('should set hodl stake based on multiple contributions', async function () {
      await increaseTimeTo(this.startTime)
      await this.crowdsale.sendTransaction({value:softCap.div(2), from: investor, gasPrice:0}).should.be.fulfilled
      await this.crowdsale.sendTransaction({value:softCap.div(2), from: investor, gasPrice:0}).should.be.fulfilled
      let hodl = await this.hodler.hodlerStakes(investor)
      hodl[0].should.be.bignumber.equal(new BigNumber(0)) // no stake before claiming tokens

      await increaseTimeTo(this.afterEndTime)
      await this.crowdsale.finalize({from: deployer})
      await this.crowdsale.claimToken({from: investor, gasPrice: 0}).should.be.fulfilled

      hodl = await this.hodler.hodlerStakes(investor)
      hodl[0].should.be.bignumber.equal(cap.mul(rate))
    })

    it('should set hodl stake and apply max gas penalty', async function () {
      await increaseTimeTo(this.startTime)
      await this.crowdsale.sendTransaction({value: softCap.div(2).floor(), from: investor, gasPrice: aboveGasLimit}).should.be.fulfilled
      let hodl = await this.hodler.hodlerStakes(investor)
      hodl[0].should.be.bignumber.equal(new BigNumber(0)) // no stake before claiming tokens

      await increaseTimeTo(this.afterEndTime)
      await this.crowdsale.finalize({from: deployer})
      await this.crowdsale.claimToken({from: investor, gasPrice: 0}).should.be.fulfilled

      hodl = await this.hodler.hodlerStakes(investor)
      hodl[0].should.be.bignumber.equal(softCap.div(2).mul(bonuses[0]).mul(rate).mul(maxGasFix).floor())
    })

    it('should invalidate hodl stake after transfer', async function () {
      await increaseTimeTo(this.startTime)
      await this.crowdsale.sendTransaction({value:softCap, from: investor, gasPrice:0}).should.be.fulfilled
      let hodl = await this.hodler.hodlerStakes(investor)
      hodl[0].should.be.bignumber.equal(new BigNumber(0)) // no stake before claiming tokens

      await increaseTimeTo(this.afterEndTime)
      await this.crowdsale.finalize({from: deployer})
      await this.controller.unpause({from: deployer})
      await this.crowdsale.claimToken({from: investor, gasPrice: 0}).should.be.fulfilled

      hodl = await this.hodler.hodlerStakes(investor)
      hodl[0].should.be.bignumber.equal(cap.mul(rate))
      hodl[1].should.equal(false)

      await this.token.transfer(purchaser,1,{from: investor, gasPrice:0}).should.be.fulfilled
      hodl = await this.hodler.hodlerStakes(investor)
      hodl[0].should.be.bignumber.equal(cap.mul(rate))
      hodl[1].should.equal(true)
    })

    // token transfer wont be enabled until end of normal sale, so buyers can't invalidate their stakes between pre and normal sale
    it('should not invalidate hodl stake if receiving transfer, too early claim for 3 month reward', async function () {
      await increaseTimeTo(this.startTime)
      await this.crowdsale.sendTransaction({value:softCap.div(2), from: investor, gasPrice:0}).should.be.fulfilled
      await this.crowdsale.sendTransaction({value:softCap.div(2), from: purchaser, gasPrice:0}).should.be.fulfilled

      // transfer tokens from investor to purchaser
      await increaseTimeTo(this.afterEndTime)
      await this.crowdsale.finalize({from: deployer})
      await this.controller.unpause({from: deployer})
      await this.crowdsale.claimTokensFor([investor, purchaser],{gasPrice: 0}).should.be.fulfilled
      await this.token.transfer(purchaser,1,{from: investor, gasPrice:0}).should.be.fulfilled

      // investor should be invalidated
      let hodl = await this.hodler.hodlerStakes(investor)
      hodl[0].should.be.bignumber.equal(cap.div(2).mul(rate))
      hodl[1].should.equal(true)

      // purchaser should not be invalidated
      hodl = await this.hodler.hodlerStakes(purchaser)
      hodl[0].should.be.bignumber.equal(cap.div(2).mul(rate))
      hodl[1].should.equal(false)
      
      // too early claiming
      await increaseTimeTo(this.afterEndTime+duration.weeks(2)+duration.days(89))
      let pre = await this.token.balanceOf(purchaser)
      await this.hodler.claimHodlRewardsFor([purchaser]).should.be.fulfilled
      let post = await this.token.balanceOf(purchaser)
      post.minus(pre).should.be.bignumber.equal(ether(0))
    })

    it('should not invalidate hodl stake if receiving transfer, distribute 3 month reward properly', async function () {
      await increaseTimeTo(this.startTime)
      await this.crowdsale.sendTransaction({value:softCap.div(2), from: investor, gasPrice:0}).should.be.fulfilled
      await this.crowdsale.sendTransaction({value:softCap.div(2), from: purchaser, gasPrice:0}).should.be.fulfilled

      // transfer tokens from investor to purchaser
      await increaseTimeTo(this.afterEndTime)
      await this.crowdsale.finalize({from: deployer})
      await this.controller.unpause({from: deployer})
      await this.crowdsale.claimTokensFor([investor, purchaser],{gasPrice: 0}).should.be.fulfilled
      await this.token.transfer(purchaser,1,{from: investor, gasPrice:0}).should.be.fulfilled

      // investor should be invalidated
      let hodl = await this.hodler.hodlerStakes(investor)
      hodl[0].should.be.bignumber.equal(cap.div(2).mul(rate))
      hodl[1].should.equal(true)

      // purchaser should not be invalidated
      hodl = await this.hodler.hodlerStakes(purchaser)
      hodl[0].should.be.bignumber.equal(cap.div(2).mul(rate))
      hodl[1].should.equal(false)

      // claim 3 month tokens
      const totalToken3m = await this.hodler.TOKEN_HODL_3M()
      await increaseTimeTo(this.afterEndTime+duration.weeks(2)+duration.days(91))
      let pre = await this.token.balanceOf(purchaser)
      await this.hodler.claimHodlRewardsFor([purchaser]).should.be.fulfilled
      let post = await this.token.balanceOf(purchaser)
      post.minus(pre).should.be.bignumber.equal(totalToken3m)
    })

    it('should not invalidate hodl stake if receiving transfer, distribute 6 month reward properly', async function () {
      await increaseTimeTo(this.startTime)
      await this.crowdsale.sendTransaction({value:softCap.div(2), from: investor, gasPrice:0}).should.be.fulfilled
      await this.crowdsale.sendTransaction({value:softCap.div(2), from: purchaser, gasPrice:0}).should.be.fulfilled

      // transfer tokens from investor to purchaser
      await increaseTimeTo(this.afterEndTime)
      await this.crowdsale.finalize({from: deployer})
      await this.controller.unpause({from: deployer})
      await this.crowdsale.claimTokensFor([investor, purchaser],{gasPrice: 0}).should.be.fulfilled
      await this.token.transfer(purchaser,1,{from: investor, gasPrice:0}).should.be.fulfilled

      // investor should be invalidated
      let hodl = await this.hodler.hodlerStakes(investor)
      hodl[0].should.be.bignumber.equal(cap.div(2).mul(rate))
      hodl[1].should.equal(true)

      // purchaser should not be invalidated
      hodl = await this.hodler.hodlerStakes(purchaser)
      hodl[0].should.be.bignumber.equal(cap.div(2).mul(rate))
      hodl[1].should.equal(false)

      // claim earlier hodl tokens
      await increaseTimeTo(this.afterEndTime+duration.weeks(2)+duration.days(91))
      await this.hodler.claimHodlRewardsFor([purchaser]).should.be.fulfilled

      // claim 6 month tokens
      const totalToken6m = await this.hodler.TOKEN_HODL_6M()
      await increaseTimeTo(this.afterEndTime+duration.weeks(2)+duration.days(181))
      let pre = await this.token.balanceOf(purchaser)
      await this.hodler.claimHodlRewardsFor([purchaser]).should.be.fulfilled
      let post = await this.token.balanceOf(purchaser)
      post.minus(pre).should.be.bignumber.equal(totalToken6m)
    })

    it('should not invalidate hodl stake if receiving transfer, distribute 9 month reward properly', async function () {
      await increaseTimeTo(this.startTime)
      await this.crowdsale.sendTransaction({value:softCap.div(2), from: investor, gasPrice:0}).should.be.fulfilled
      await this.crowdsale.sendTransaction({value:softCap.div(2), from: purchaser, gasPrice:0}).should.be.fulfilled

      // transfer tokens from investor to purchaser
      await increaseTimeTo(this.afterEndTime)
      await this.crowdsale.finalize({from: deployer})
      await this.controller.unpause({from: deployer})
      await this.crowdsale.claimTokensFor([investor, purchaser],{gasPrice: 0}).should.be.fulfilled
      await this.token.transfer(purchaser,1,{from: investor, gasPrice:0}).should.be.fulfilled

      // investor should be invalidated
      let hodl = await this.hodler.hodlerStakes(investor)
      hodl[0].should.be.bignumber.equal(cap.div(2).mul(rate))
      hodl[1].should.equal(true)

      // purchaser should not be invalidated
      hodl = await this.hodler.hodlerStakes(purchaser)
      hodl[0].should.be.bignumber.equal(cap.div(2).mul(rate))
      hodl[1].should.equal(false)

      // claim earlier hodl tokens
      await increaseTimeTo(this.afterEndTime+duration.weeks(2)+duration.days(181))
      await this.hodler.claimHodlRewardsFor([purchaser]).should.be.fulfilled

      // claim 9 month tokens
      const totalToken9m = await this.hodler.TOKEN_HODL_9M()
      await increaseTimeTo(this.afterEndTime+duration.weeks(2)+duration.days(271))
      let pre = await this.token.balanceOf(purchaser)
      await this.hodler.claimHodlRewardsFor([purchaser]).should.be.fulfilled
      let post = await this.token.balanceOf(purchaser)
      post.minus(pre).should.be.bignumber.equal(totalToken9m)
    })


    it('should not distribute hodl to two participants when called too early', async function () {
      await increaseTimeTo(this.startTime)
      await this.crowdsale.sendTransaction({value:softCap, from: investor, gasPrice:0}).should.be.fulfilled
      await this.crowdsale.sendTransaction({value:softCap.div(2), from: purchaser, gasPrice:0}).should.be.fulfilled

      // transfer tokens from investor to purchaser
      await increaseTimeTo(this.afterEndTime)
      await this.crowdsale.finalize({from: deployer})
      await this.controller.unpause({from: deployer})
      await this.crowdsale.claimTokensFor([investor, purchaser],{gasPrice: 0}).should.be.fulfilled

      // claiming too early
      await increaseTimeTo(this.afterEndTime+duration.weeks(2)+duration.days(89))
      let preI = await this.token.balanceOf(investor)
      let preP = await this.token.balanceOf(purchaser)
      await this.hodler.claimHodlRewardsFor([investor, purchaser]).should.be.fulfilled
      let postI = await this.token.balanceOf(investor)
      let postP = await this.token.balanceOf(purchaser)
      postI.minus(preI).should.be.bignumber.equal(new BigNumber(0))
      postP.minus(preP).should.be.bignumber.equal(new BigNumber(0))
    })

    it('should correctly distribute 3 month hodl reward to two participants', async function () {
      await increaseTimeTo(this.startTime)
      await this.crowdsale.sendTransaction({value:softCap, from: investor, gasPrice:0}).should.be.fulfilled
      await this.crowdsale.sendTransaction({value:softCap.div(2), from: purchaser, gasPrice:0}).should.be.fulfilled

      // transfer tokens from investor to purchaser
      await increaseTimeTo(this.afterEndTime)
      await this.crowdsale.finalize({from: deployer})
      await this.controller.unpause({from: deployer})
      await this.crowdsale.claimTokensFor([investor, purchaser],{gasPrice: 0}).should.be.fulfilled
      
      // claim 3 month tokens
      const totalToken3m = await this.hodler.TOKEN_HODL_3M()
      await increaseTimeTo(this.afterEndTime+duration.weeks(2)+duration.days(91))

      let preI = await this.token.balanceOf(investor)
      let preP = await this.token.balanceOf(purchaser)
      await this.hodler.claimHodlRewardsFor([investor, purchaser]).should.be.fulfilled
      let postI = await this.token.balanceOf(investor)
      let postP = await this.token.balanceOf(purchaser)

      postI.minus(preI).should.be.bignumber.equal(totalToken3m.mul(2).div(3).floor())
      postP.minus(preP).should.be.bignumber.equal(totalToken3m.div(3).floor())
    })

    it('should correctly distribute 6 month hodl reward to two participants', async function () {
      await increaseTimeTo(this.startTime)
      await this.crowdsale.sendTransaction({value:softCap, from: investor, gasPrice:0}).should.be.fulfilled
      await this.crowdsale.sendTransaction({value:softCap.div(2), from: purchaser, gasPrice:0}).should.be.fulfilled

      // transfer tokens from investor to purchaser
      await increaseTimeTo(this.afterEndTime)
      await this.crowdsale.finalize({from: deployer})
      await this.controller.unpause({from: deployer})
      await this.crowdsale.claimTokensFor([investor, purchaser],{gasPrice: 0}).should.be.fulfilled

      // claim earlier hodl tokens
      await increaseTimeTo(this.afterEndTime+duration.weeks(2)+duration.days(91))
      await this.hodler.claimHodlRewardsFor([investor, purchaser]).should.be.fulfilled
      
      // claim 6 month tokens
      const totalToken6m = await this.hodler.TOKEN_HODL_6M()
      await increaseTimeTo(this.afterEndTime+duration.weeks(2)+duration.days(181))

      let preI = await this.token.balanceOf(investor)
      let preP = await this.token.balanceOf(purchaser)
      await this.hodler.claimHodlRewardsFor([investor, purchaser]).should.be.fulfilled
      let postI = await this.token.balanceOf(investor)
      let postP = await this.token.balanceOf(purchaser)

      postI.minus(preI).should.be.bignumber.equal(totalToken6m.mul(2).div(3).floor())
      postP.minus(preP).should.be.bignumber.equal(totalToken6m.div(3).floor())
    })

    it('should correctly distribute 9 month hodl reward to two participants', async function () {
      await increaseTimeTo(this.startTime)
      await this.crowdsale.sendTransaction({value:softCap, from: investor, gasPrice:0}).should.be.fulfilled
      await this.crowdsale.sendTransaction({value:softCap.div(2), from: purchaser, gasPrice:0}).should.be.fulfilled

      // transfer tokens from investor to purchaser
      await increaseTimeTo(this.afterEndTime)
      await this.crowdsale.finalize({from: deployer})
      await this.controller.unpause({from: deployer})
      await this.crowdsale.claimTokensFor([investor, purchaser],{gasPrice: 0}).should.be.fulfilled

      // claim earlier hodl tokens
      await increaseTimeTo(this.afterEndTime+duration.weeks(2)+duration.days(181))
      await this.hodler.claimHodlRewardsFor([investor, purchaser]).should.be.fulfilled

      // claim 9 month tokens
      const totalToken9m = await this.hodler.TOKEN_HODL_9M()
      await increaseTimeTo(this.afterEndTime+duration.weeks(2)+duration.days(270)+1)

      let preI = await this.token.balanceOf(investor)
      let preP = await this.token.balanceOf(purchaser)
      await this.hodler.claimHodlRewardsFor([investor, purchaser]).should.be.fulfilled
      let postI = await this.token.balanceOf(investor)
      let postP = await this.token.balanceOf(purchaser)

      postI.minus(preI).should.be.bignumber.equal(totalToken9m.mul(2).div(3).floor())
      postP.minus(preP).should.be.bignumber.equal(totalToken9m.div(3).floor())
    })

  })

})