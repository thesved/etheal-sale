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
const PController = artifacts.require('EthealPromoTokenController')
const PToken = artifacts.require('EthealPromoToken')
const Whitelist = artifacts.require('EthealWhitelist')
const Deposit = artifacts.require('EthealDeposit')
const ECRecovery = artifacts.require('ECRecovery')

contract('NormalSale', function ([deployer, investor, wallet, purchaser, purchaser2, purchaser3, purchaser4]) {

    const hourBonuses = [130,125,125,125,125,120,120,120,118,118,118,118,118,118,118,118,118,118,118,118,118,118,118,118].map(function(v){return new BigNumber(v)})  // first: half hour, second 1.5 hour, ...
    const dayBonuses = [116,115,114,114,113,113,112,112,111,111,110,110,108,108,107,107,106,106,105,105,104,104,103,103,102,102,100,100].map(function(v){return new BigNumber(v)}) // first: 2.5 day, second: 3.5 day, ...
    const sizeBonus = [102,104].map(function(v){return new BigNumber(v)}) // above 10 eth: 2%, above 100 eth: 4%

    const rate = new BigNumber(700)
    const cap = ether(10)
    const softCap = ether(5)
    const softCapTime = duration.hours(120)
    const lessThanCap = ether(8)
    const lessThanSoftCap = ether(4)

    const minContribution = ether(0.1)
    const whitelistThreshold = ether(1)
    const whitelistAbove = ether(2)
    const whitelistBelow = ether(0.5)

    const bonusMax = 1.4  // 40% max bonus
    const expectedTokenAmount = rate.mul(bonusMax).mul(cap)
    const maxEtherWithDoubleBonus = expectedTokenAmount.div(2).div(rate)

    before(async function() {
        //Advance to the next block to correctly read time in the solidity "now" function interpreted by testrpc
        await advanceBlock()
    })

    beforeEach(async function () {
        this.signer = purchaser4
        this.startTime = latestTime() + duration.weeks(1)
        this.endTime =   this.startTime + duration.weeks(4)
        this.afterEndTime = this.endTime + duration.seconds(1)

        this.ecrecovery = await ECRecovery.new()
        Whitelist.link('ECRecovery',this.ecrecovery.address)

        this.factory = await Factory.new()
        this.controller = await Controller.new(wallet)
        this.token = await Token.new(this.controller.address, this.factory.address)
        await this.controller.setEthealToken(this.token.address, 0)
        this.hodler = Hodler.at(await this.controller.hodlerReward())
        this.pcontroller = await PController.new()
        this.ptoken = await PToken.new(this.pcontroller.address, this.factory.address)
        this.whitelist = await Whitelist.new(this.signer)

        this.crowdsale = await Crowdsale.new(this.controller.address, this.startTime, this.endTime, minContribution, rate, softCap, softCapTime, cap, wallet)
        await this.controller.setCrowdsaleTransfer(this.crowdsale.address, expectedTokenAmount)

        await this.crowdsale.setPromoTokenController(this.pcontroller.address)
        await this.crowdsale.setWhitelist(this.whitelist.address, whitelistThreshold)
        await this.pcontroller.setCrowdsale(this.crowdsale.address)
        await this.pcontroller.setPromoToken(this.ptoken.address)

        this.deposit = await Deposit.new(this.crowdsale.address, this.whitelist.address)
        await this.crowdsale.setDeposit(this.deposit.address)    
    })


    describe('creating a valid crowdsale', function () {

        it('should fail with zero rate', async function () {
            await Crowdsale.new(this.controller.address, this.startTime, this.endTime, minContribution, 0, softCap, softCapTime, cap, wallet).should.be.rejectedWith(EVMThrow);
        })

        it('should fail with zero cap', async function () {
            await Crowdsale.new(this.controller.address, this.startTime, this.endTime, minContribution, rate, softCap, softCapTime, 0, wallet).should.be.rejectedWith(EVMThrow);
        })

        it('should fail with greater softCap than cap', async function () {
            await Crowdsale.new(this.controller.address, this.startTime, this.endTime, minContribution, rate, cap, softCapTime, softCap, wallet).should.be.rejectedWith(EVMThrow);
        })

        it('should fail with zero controller', async function () {
            await Crowdsale.new(0, this.startTime, this.endTime, minContribution, rate, softCap, softCapTime, cap, wallet).should.be.rejectedWith(EVMThrow);
        })

        it('should fail with zero wallet', async function () {
            await Crowdsale.new(this.controller.address, this.startTime, this.endTime, minContribution, rate, softCap, softCapTime, cap, 0).should.be.rejectedWith(EVMThrow);
        })

    });


    describe('modify parameters', function () {
        // tests for min contribution
        it('should set valid mincontribution', async function () {
            await this.crowdsale.setMinContribution(0).should.be.fulfilled
            let _min = await this.crowdsale.minContribution()
            _min.should.be.bignumber.equal(0)
        })

        it('should fail to set mincintribution from other address than deployer', async function () {
            await this.crowdsale.setMinContribution(0, {from: purchaser}).should.be.rejectedWith(EVMThrow);
        })

        // tests for caps
        it('should set valid caps', async function () {
            await this.crowdsale.setCaps(softCap, softCapTime, cap).should.be.fulfilled
        })

        it('should fail setting zero cap', async function () {
            await this.crowdsale.setCaps(softCap, softCapTime, 0).should.be.rejectedWith(EVMThrow);
        })

        it('should fail setting greater softCap than cap', async function () {
            await this.crowdsale.setCaps(cap, softCapTime, softCap).should.be.rejectedWith(EVMThrow);
        })

        it('should fail setting cap by other than deployer', async function () {
            await this.crowdsale.setCaps(softCap, softCapTime, cap, {from: purchaser}).should.be.rejectedWith(EVMThrow);
        })

        // tests for times
        it('should set valid times', async function () {
            await this.crowdsale.setTimes(this.startTime, this.endTime).should.be.fulfilled
        })

        it('should fail to set invalid times', async function () {
            await this.crowdsale.setTimes(this.endTime+duration.seconds(1), this.endTime).should.be.rejectedWith(EVMThrow);
        })

        it('should fail to set times by other than deployer', async function () {
            await this.crowdsale.setTimes(this.endTime, this.endTime, {from: purchaser}).should.be.rejectedWith(EVMThrow);
        })

        // tests for rate
        it('should set valid rate', async function () {
            await this.crowdsale.setRate(rate.plus(1)).should.be.fulfilled
        })

        it('should fail to set invalid rate', async function () {
            await this.crowdsale.setRate(0).should.be.rejectedWith(EVMThrow)
        })

        it('should fail to set rate by other than deployer', async function () {
            await this.crowdsale.setRate(rate, {from: purchaser}).should.be.rejectedWith(EVMThrow)
        })

        // test for promo token
        it('should set valid promo token controller', async function () {
            await this.crowdsale.setPromoTokenController(1).should.be.fulfilled
        })

        it('should fail to set invalid promo token controller', async function () {
            await this.crowdsale.setPromoTokenController(0).should.be.rejectedWith(EVMThrow)
        })

        it('should fail to set promo token controller by other than deployer', async function () {
            await this.crowdsale.setPromoTokenController(1, {from: purchaser}).should.be.rejectedWith(EVMThrow)
        })

        // test for whitelist
        it('should set valid whitelist', async function () {
            await this.crowdsale.setWhitelist(purchaser,ether(2)).should.be.fulfilled
            let _whitelist = await this.crowdsale.whitelist()
            _whitelist.should.equal(purchaser)

            let _threshold = await this.crowdsale.whitelistThreshold()
            _threshold.should.be.bignumber.equal(ether(2))
        })

        it('should set threshold only for invalid whitelist address', async function () {
            let _whitelistOld = await this.crowdsale.whitelist()
            await this.crowdsale.setWhitelist(0, ether(2)).should.be.fulfilled
            let _whitelist = await this.crowdsale.whitelist()
            _whitelist.should.equal(_whitelistOld)

            let _threshold = await this.crowdsale.whitelistThreshold()
            _threshold.should.be.bignumber.equal(ether(2))
        })

        it('should fail to set whitelist by other than deployer', async function () {
            await this.crowdsale.setWhitelist(purchaser, ether(2), {from: purchaser}).should.be.rejectedWith(EVMThrow)
        })

        // test for deposit
        it('should set valid deposit', async function () {
            await this.crowdsale.setDeposit(purchaser).should.be.fulfilled
            let _deposit = await this.crowdsale.deposit()
            _deposit.should.equal(purchaser)
        })

        it('should fail to set deposit by other than deployer', async function () {
            await this.crowdsale.setDeposit(purchaser, {from: purchaser}).should.be.rejectedWith(EVMThrow)
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
            await this.whitelist.setWhitelist(deployer,true).should.be.fulfilled
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

        it('should be ended after cap reached', async function () {
            await increaseTimeTo(this.startTime)
            await this.whitelist.setWhitelist(deployer,true).should.be.fulfilled
            await this.crowdsale.send(cap).should.be.fulfilled
            let ended = await this.crowdsale.hasEnded()
            ended.should.equal(true)
        })

    })


    describe('whitelist', function () {
        // signer setting
        it('should fail for 0 initial signer', async function () {
            await Whitelist.new(0).should.be.rejectedWith(EVMThrow)
        })

        it('should be able to set new signer', async function () {
            await this.whitelist.setSigner(purchaser2).should.be.fulfilled
            let _signer = await this.whitelist.signer()
            _signer.should.equal(purchaser2)
        })

        it('should fail to set zero address signer', async function () {
            await this.whitelist.setSigner(0).should.be.rejectedWith(EVMThrow)
        })

        it('should fail to set new signer by other than deployer', async function () {
            await this.whitelist.setSigner(purchaser2, {from:purchaser}).should.be.rejectedWith(EVMThrow)
        })

        // whitelist
        it('should be able to set new whitelist', async function () {
            let _wl = await this.whitelist.isWhitelisted(purchaser2)
            _wl.should.equal(false)
            await this.whitelist.setWhitelist(purchaser2, true).should.be.fulfilled
            _wl = await this.whitelist.isWhitelisted(purchaser2)
            _wl.should.equal(true)
        })

        it('should be able to remove whitelist', async function () {
            await this.whitelist.setWhitelist(purchaser2, true).should.be.fulfilled
            let _wl = await this.whitelist.isWhitelisted(purchaser2)
            _wl.should.equal(true)
            await this.whitelist.setWhitelist(purchaser2, false).should.be.fulfilled
            _wl = await this.whitelist.isWhitelisted(purchaser2)
            _wl.should.equal(false)
        })

        it('should fail to set whitelist to address 0x0', async function () {
            await this.whitelist.setWhitelist(0, true).should.be.rejectedWith(EVMThrow)
        })

        it('should fail to set new whitelist by other than deployer', async function () {
            await this.whitelist.setWhitelist(purchaser2, true, {from:purchaser}).should.be.rejectedWith(EVMThrow)
        })

        it('should be able to set many new whitelist', async function () {
            let _wl1 = await this.whitelist.isWhitelisted(purchaser)
            let _wl2 = await this.whitelist.isWhitelisted(purchaser2)
            _wl1.should.equal(false)
            _wl2.should.equal(false)
            await this.whitelist.setManyWhitelist([purchaser, purchaser2], true).should.be.fulfilled
            _wl1 = await this.whitelist.isWhitelisted(purchaser)
            _wl2 = await this.whitelist.isWhitelisted(purchaser2)
            _wl1.should.equal(true)
            _wl2.should.equal(true)
        })

        it('should be able to set many new whitelist to false', async function () {
            await this.whitelist.setManyWhitelist([purchaser, purchaser2], true).should.be.fulfilled
            let _wl1 = await this.whitelist.isWhitelisted(purchaser)
            let _wl2 = await this.whitelist.isWhitelisted(purchaser2)
            _wl1.should.equal(true)
            _wl2.should.equal(true)
            await this.whitelist.setManyWhitelist([purchaser, purchaser2], false).should.be.fulfilled
            _wl1 = await this.whitelist.isWhitelisted(purchaser)
            _wl2 = await this.whitelist.isWhitelisted(purchaser2)
            _wl1.should.equal(false)
            _wl2.should.equal(false)
        })

        it('should fail to set many new whitelist by other than deployer', async function () {
            await this.whitelist.setManyWhitelist([purchaser, purchaser2], true, {from: purchaser}).should.be.rejectedWith(EVMThrow)
        })

        // offline signature
        it('should return false for checking offline signature for empty string', async function () {
            let _wl = await this.whitelist.isOffchainWhitelisted(purchaser, "")
            _wl.should.equal(false)
        })

        it('should return false for checking offline signature for invalid signature', async function () {
            let _wl = await this.whitelist.isOffchainWhitelisted(purchaser, "0x00112233")
            _wl.should.equal(false)
        })

        it('should return true for checking valid offline signature', async function () {
            let _sign = await web3.eth.sign(this.signer, purchaser)
            let _wl = await this.whitelist.isOffchainWhitelisted(purchaser, _sign)
            _wl.should.equal(true)
            // since this is offline, it shoudnt change storage value
            _wl = await this.whitelist.isWhitelisted(purchaser)
            _wl.should.equal(false)
        })

        it('should return true for checking valid offline signature by any account', async function () {
            let _sign = await web3.eth.sign(this.signer, purchaser)
            let _wl = await this.whitelist.isOffchainWhitelisted(purchaser, _sign, {from:purchaser})
            _wl.should.equal(true)
        })

        it('should return false for checking old offline signature after changing signer', async function () {
            await this.whitelist.setSigner(purchaser2).should.be.fulfilled
            let _sign = await web3.eth.sign(this.signer, purchaser)
            let _wl = await this.whitelist.isOffchainWhitelisted(purchaser, _sign)
            _wl.should.equal(false)
        })

        it('should return true for checking new offline signature after changing signer', async function () {
            await this.whitelist.setSigner(purchaser2).should.be.fulfilled
            let _sign = await web3.eth.sign(purchaser2, purchaser)
            let _wl = await this.whitelist.isOffchainWhitelisted(purchaser, _sign)
            _wl.should.equal(true)
        })
    })


    describe('bonus', function () {
        // hour based
        it('should give the biggest bonus before sale', async function () {
            let _bonus = await this.crowdsale.getBonus(0,0,this.startTime-duration.seconds(1))
            _bonus.should.be.bignumber.equal(hourBonuses[0])
        })

        it('should give the biggest bonus now', async function () {
            let _bonus = await this.crowdsale.getBonusNow(0,0)
            _bonus.should.be.bignumber.equal(hourBonuses[0])
        })

        it('should sale day now 0 before sale', async function () {
            let _bonus = await this.crowdsale.getSaleDayNow()
            _bonus.should.be.bignumber.equal(0)
        })

        it('should sale hour now 0 before sale', async function () {
            let _bonus = await this.crowdsale.getSaleHourNow()
            _bonus.should.be.bignumber.equal(0)
        })

        hourBonuses.map(function(v,i){
            it('should calculate bonus for first '+(i+0.5)+' hour: '+v, async function () {
                let _hour = duration.hours(0.5)+duration.hours(i)
                let _bonus = await this.crowdsale.getBonus(0,0,this.startTime+_hour)
                _bonus.should.be.bignumber.equal(v)
            })
        })

        dayBonuses.map(function(v,i){
            it('should calculate bonus for day '+(i+2.5)+': '+v, async function () {
                let _day = duration.days(1.5)+duration.days(i)
                let _bonus = await this.crowdsale.getBonus(0,0,this.startTime+_day)
                _bonus.should.be.bignumber.equal(v)
            })
        })

        // size based bonus
        it('should give no bonus above below 10 eth', async function () {
            let _bonus = await this.crowdsale.getBonus(0,ether(9),this.startTime+duration.days(30))
            _bonus.should.be.bignumber.equal(new BigNumber(100))
        })

        it('should give bonus above 10 eth', async function () {
            let _bonus = await this.crowdsale.getBonus(0,ether(10),this.startTime+duration.days(30))
            _bonus.should.be.bignumber.equal(sizeBonus[0])
        })

        it('should give bonus above 100 eth', async function () {
            let _bonus = await this.crowdsale.getBonus(0,ether(100),this.startTime+duration.days(30))
            _bonus.should.be.bignumber.equal(sizeBonus[1])
        })

        // individual bonus
        it('should give no individual bonus if its not set', async function () {
            let _bonus = await this.crowdsale.getBonus(purchaser,0,this.startTime+duration.days(30))
            _bonus.should.be.bignumber.equal(new BigNumber(100))
        })

        it('should fail setting extra bonus for address 0x0', async function () {
            await this.crowdsale.setBonusExtra(0,7).should.be.rejectedWith(EVMThrow)
        })

        it('should give individial bonus if set', async function () {
            await this.crowdsale.setBonusExtra(purchaser,7).should.be.fulfilled
            let _bonus = await this.crowdsale.getBonus(purchaser,0,this.startTime+duration.days(30))
            _bonus.should.be.bignumber.equal(new BigNumber(107))
        })

        it('should fail for setting individual bonus other than the deployer', async function () {
            await this.crowdsale.setBonusExtra(purchaser,7,{from:purchaser}).should.be.rejectedWith(EVMThrow)
        })

        it('should give multiple individial bonus if set', async function () {
            await this.crowdsale.setManyBonusExtra([purchaser,purchaser2],7).should.be.fulfilled
            let _bonus = await this.crowdsale.getBonus(purchaser,0,this.startTime+duration.days(30))
            let _bonus2 = await this.crowdsale.getBonus(purchaser2,0,this.startTime+duration.days(30))
            _bonus.should.be.bignumber.equal(new BigNumber(107))
            _bonus2.should.be.bignumber.equal(new BigNumber(107))
        })

        // combine
        it('should combine individual, time and size based bonuses', async function () {
            await this.crowdsale.setBonusExtra(purchaser,7).should.be.fulfilled
            let _bonus = await this.crowdsale.getBonus(purchaser,ether(10),this.startTime-duration.seconds(1))
            _bonus.should.be.bignumber.equal(hourBonuses[0].plus(sizeBonus[0]).plus(7).minus(100))
        })

    })

    
    describe('promo token', function () {
        // extract tokens
        it('should not be able to send ether to controller since no payable function', async function () {
            await this.pcontroller.sendTransaction({from:purchaser, value:ether(1)}).should.be.rejectedWith(EVMThrow)
        })

        it('should be able to extract token from controller by owner', async function () {
            // send heal
            await this.controller.unpause().should.be.fulfilled
            await this.token.transfer(this.pcontroller.address, ether(1)).should.be.fulfilled
            let _balance = await this.token.balanceOf(this.pcontroller.address)
            _balance.should.be.bignumber.equal(ether(1));

            // extract it
            let _before = await this.token.balanceOf(purchaser2)
            await this.pcontroller.extractTokens(this.token.address, purchaser2).should.be.fulfilled
            let _after = await this.token.balanceOf(purchaser2)
            _balance = await this.token.balanceOf(this.pcontroller.address)
            _after.minus(_before).should.be.bignumber.equal(ether(1)) // purchaser 2 should gain 1 heal
            _balance.should.be.bignumber.equal(0)  // controller should have 0 heal
        })

        it('should not be able to extract token from controller by other than owner', async function () {
            await this.controller.unpause().should.be.fulfilled
            await this.token.transfer(this.pcontroller.address, ether(1)).should.be.fulfilled
            await this.pcontroller.extractTokens(this.token.address, purchaser2, {from:purchaser}).should.be.rejectedWith(EVMThrow)
        })

        it('should not be able to send ether to promo token contract', async function () {
            await this.ptoken.sendTransaction({from:purchaser, value:ether(1)}).should.be.rejectedWith(EVMThrow)
        })

        it('should be able to extract token from promo token by owner', async function () {
            // send 1 HEAL token tok promo token address
            await this.controller.unpause().should.be.fulfilled
            await this.token.transfer(this.ptoken.address,ether(1)).should.be.fulfilled
            let _balance = await this.token.balanceOf(this.ptoken.address)
            _balance.should.be.bignumber.equal(ether(1));

            // extract it: it forwards to the controller
            let _before = await this.token.balanceOf(this.pcontroller.address)
            await this.pcontroller.claimTokenTokens(this.token.address).should.be.fulfilled
            let _after = await this.token.balanceOf(this.pcontroller.address)
            _balance = await this.token.balanceOf(this.ptoken.address)
            _after.minus(_before).should.be.bignumber.equal(ether(1)) // purchaser 2 should gain 1 HEAL token
            _balance.should.be.bignumber.equal(0)  // controller should have 0 heal token
        })

        it('should not be able to extract promo token from promo token', async function () {
            await this.pcontroller.claimTokenTokens(this.ptoken.address).should.be.rejectedWith(EVMThrow)
        })

        it('should not be able to extract token from promo token by other than owner', async function () {
            await this.controller.unpause().should.be.fulfilled
            await this.token.transfer(this.ptoken.address,ether(1)).should.be.fulfilled
            await this.pcontroller.claimTokenTokens(this.ptoken.address, {from: purchaser}).should.be.rejectedWith(EVMThrow)
        })


        // set new controller
        it('should be able to set new controller', async function () {
            let _controller = await PController.new()
            await this.pcontroller.setNewController(_controller.address).should.be.fulfilled
            // controller storage set
            let _new = await this.pcontroller.newController()
            _new.should.equal(_controller.address)

            // token has new controller
            _new = await this.ptoken.controller()
            _new.should.equal(_controller.address)            
        })

        it('should not be able to set new controller by other than owner', async function () {
            let _controller = await PController.new()
            await this.pcontroller.setNewController(_controller.address, {from: purchaser}).should.be.rejectedWith(EVMThrow)
        })

        it('should not be able to set zero new controller', async function () {
            await this.pcontroller.setNewController(0).should.be.rejectedWith(EVMThrow)
        })

        it('should not be able to set new controller when it is already done', async function () {
            let _controller = await PController.new()
            await this.pcontroller.setNewController(_controller.address).should.be.fulfilled
            await this.pcontroller.setNewController(_controller.address).should.be.rejectedWith(EVMThrow)
        })


        // set crowdsale
        it('should be able to set new crowdsale', async function () {
            await this.pcontroller.setCrowdsale(purchaser).should.be.fulfilled
        })

        it('should not be able to set zero as new crowdsale', async function () {
            await this.pcontroller.setCrowdsale(0).should.be.rejectedWith(EVMThrow)
        })

        it('should not be able to set new crowdsale by other than owner', async function () {
            await this.pcontroller.setCrowdsale(purchaser, {from: purchaser}).should.be.rejectedWith(EVMThrow)
        })


        // set crowdsale
        it('should be able to set new PromoToken', async function () {
            await this.pcontroller.setPromoToken(purchaser).should.be.fulfilled
        })

        it('should not be able to set new PromoToken by other than owner', async function () {
            await this.pcontroller.setPromoToken(purchaser, {from: purchaser}).should.be.rejectedWith(EVMThrow)
        })


        // distribution
        it('should be able to distribute', async function () {
            await this.pcontroller.distributeToken(purchaser,ether(1)).should.be.fulfilled
            let _balance = await this.ptoken.balanceOf(purchaser)
            _balance.should.be.bignumber.equal(ether(1))
        })

        it('should be able to distribute to many', async function () {
            await this.pcontroller.distributeManyToken([purchaser,purchaser2],ether(1)).should.be.fulfilled
            let _balance = await this.ptoken.balanceOf(purchaser)
            let _balance2 = await this.ptoken.balanceOf(purchaser2)
            _balance.should.be.bignumber.equal(ether(1))
            _balance2.should.be.bignumber.equal(ether(1))
        })

        it('should not be able to distribute by other than owner', async function () {
            await this.pcontroller.distributeToken(purchaser,ether(1),{from:purchaser}).should.be.rejectedWith(EVMThrow)
        })


        // bonus
        it('should be set bonus by owner', async function () {
            await this.crowdsale.setPromoBonus(purchaser).should.be.fulfilled
            let _bonus = await this.crowdsale.bonusExtra(purchaser)
            _bonus.should.be.bignumber.equal(5)
        })

        it('should be fail to set by any address than owner or PromoController', async function () {
            await this.crowdsale.setPromoBonus(purchaser,{from:purchaser}).should.be.rejectedWith(EVMThrow)
        })

        it('should be set bonus by sending to 0x1', async function () {
            await this.pcontroller.distributeToken(purchaser,ether(1)).should.be.fulfilled
            await this.ptoken.transfer(0x0000000000000000000000000000000000000001,ether(1),{from:purchaser}).should.be.fulfilled
            let _bonus = await this.crowdsale.bonusExtra(purchaser)
            _bonus.should.be.bignumber.equal(5)
        })

        it('should be set bonus by sending to PromoController', async function () {
            await this.pcontroller.distributeToken(purchaser,ether(1)).should.be.fulfilled
            await this.ptoken.transfer(this.pcontroller.address,ether(1),{from:purchaser}).should.be.fulfilled
            let _bonus = await this.crowdsale.bonusExtra(purchaser)
            _bonus.should.be.bignumber.equal(5)
        })

        it('should be set bonus by sending to Crowdsale', async function () {
            await this.pcontroller.distributeToken(purchaser,ether(1)).should.be.fulfilled
            await this.ptoken.transfer(this.crowdsale.address,ether(1),{from:purchaser}).should.be.fulfilled
            let _bonus = await this.crowdsale.bonusExtra(purchaser)
            _bonus.should.be.bignumber.equal(5)
        })

        it('should be set bonus only once even though sent twice', async function () {
            await this.pcontroller.distributeToken(purchaser,ether(1)).should.be.fulfilled
            await this.ptoken.transfer(this.crowdsale.address,ether(0.2),{from:purchaser}).should.be.fulfilled
            await this.ptoken.transfer(this.crowdsale.address,ether(0.2),{from:purchaser}).should.be.fulfilled
            let _bonus = await this.crowdsale.bonusExtra(purchaser)
            _bonus.should.be.bignumber.equal(5)
        })

        it('should override smaller extra bonus', async function () {
            await this.crowdsale.setBonusExtra(purchaser,2).should.be.fulfilled
            await this.pcontroller.distributeToken(purchaser,ether(1)).should.be.fulfilled
            await this.ptoken.transfer(this.crowdsale.address,ether(0.2),{from:purchaser}).should.be.fulfilled
            let _bonus = await this.crowdsale.bonusExtra(purchaser)
            _bonus.should.be.bignumber.equal(5)
        })

        it('should not override larger extra bonus', async function () {
            await this.crowdsale.setBonusExtra(purchaser,7).should.be.fulfilled
            await this.pcontroller.distributeToken(purchaser,ether(1)).should.be.fulfilled
            await this.ptoken.transfer(this.crowdsale.address,ether(0.2),{from:purchaser}).should.be.fulfilled
            let _bonus = await this.crowdsale.bonusExtra(purchaser)
            _bonus.should.be.bignumber.equal(7)
        })


        // burn
        it('should not be able to burn what is not there', async function () {
            await this.pcontroller.burnToken(purchaser,ether(0.7)).should.be.rejectedWith(EVMThrow)
        })

        it('should be able to burn', async function () {
            await this.pcontroller.distributeToken(purchaser,ether(1)).should.be.fulfilled
            await this.pcontroller.burnToken(purchaser,ether(0.7)).should.be.fulfilled
            let _balance = await this.ptoken.balanceOf(purchaser)
            _balance.should.be.bignumber.equal(ether(0.3))
        })

        it('should be able to burn at many addresses', async function () {
            await this.pcontroller.distributeManyToken([purchaser,purchaser2],ether(1)).should.be.fulfilled
            await this.pcontroller.burnManyToken([purchaser,purchaser2],ether(0.7)).should.be.fulfilled
            let _balance = await this.ptoken.balanceOf(purchaser)
            let _balance2 = await this.ptoken.balanceOf(purchaser2)
            _balance.should.be.bignumber.equal(ether(0.3))
            _balance2.should.be.bignumber.equal(ether(0.3))
        })

        it('should not be able to burn by other than owner', async function () {
            await this.pcontroller.distributeToken(purchaser,ether(1)).should.be.fulfilled
            await this.pcontroller.burnToken(purchaser,ether(0.7),{from:purchaser}).should.be.rejectedWith(EVMThrow)
        })



        // onapprove
        it('should approve if not paused', async function () {
            await this.ptoken.approve(purchaser,0).should.be.fulfilled
        })

        it('should disapprove if paused', async function () {
            await this.pcontroller.pause().should.be.fulfilled
            await this.ptoken.approve(purchaser,0).should.be.rejectedWith(EVMThrow)
        })

        it('should not be paused by other than owner', async function () {
            await this.pcontroller.pause({from: purchaser}).should.be.rejectedWith(EVMThrow)
        })
    })


    describe('deposit', function () {
        // fail cases
        it('should fail for initiating with 0x0 sale address', async function () {
            await Deposit.new(0,0).should.be.rejectedWith(EVMThrow)
        })

        it('should fail deposit without whitelist', async function () {
            let _depo = await Deposit.new(purchaser,0).should.be.fulfilled
            await _depo.deposit(purchaser,"test",{value:minContribution}).should.be.rejectedWith(EVMThrow)
        })

        it('should fail deposit after sale end', async function () {
            await increaseTimeTo(this.afterEndTime)
            await this.deposit.deposit(purchaser,"test",{value:minContribution}).should.be.rejectedWith(EVMThrow)
        })

        it('should fail deposit for zero address', async function () {
            await this.deposit.deposit(0,"test",{value:minContribution}).should.be.rejectedWith(EVMThrow)
        })

        it('should fail deposit with zero value', async function () {
            await this.deposit.deposit(purchaser,"test").should.be.rejectedWith(EVMThrow)
        })

        // set sale
        it('should set new sale address', async function () {
            await this.deposit.setSale(purchaser).should.be.fulfilled
        })

        it('should fail to set new sale address by other than owner', async function () {
            await this.deposit.setSale(purchaser,{from:purchaser}).should.be.rejectedWith(EVMThrow)
        })


        // set whitelist
        it('should set new whitelist address', async function () {
            await this.deposit.setWhitelist(purchaser).should.be.fulfilled
        })

        it('should fail to set new whitelist address by other than owner', async function () {
            await this.deposit.setWhitelist(purchaser,{from:purchaser}).should.be.rejectedWith(EVMThrow)
        })


        // extract tokens
        it('should be able to extract token', async function () {
            await increaseTimeTo(this.afterEndTime)
            // send heal
            await this.controller.unpause().should.be.fulfilled
            await this.token.transfer(this.deposit.address, ether(1)).should.be.fulfilled
            let _balance = await this.token.balanceOf(this.deposit.address)
            _balance.should.be.bignumber.equal(ether(1));

            // extract it
            let _before = await this.token.balanceOf(purchaser2)
            await this.deposit.extractTokens(this.token.address, purchaser2).should.be.fulfilled
            let _after = await this.token.balanceOf(purchaser2)
            _balance = await this.token.balanceOf(this.deposit.address)
            _after.minus(_before).should.be.bignumber.equal(ether(1)) // purchaser 2 should gain 1 heal
            _balance.should.be.bignumber.equal(0)  // controller should have 0 heal
        })

        it('should not be able to extract token before end', async function () {
            // send heal
            await this.controller.unpause().should.be.fulfilled
            await this.token.transfer(this.deposit.address, ether(1)).should.be.fulfilled

            // extract it
            await this.deposit.extractTokens(this.token.address, purchaser2).should.be.rejectedWith(EVMThrow)
        })

        it('should not be able to extract token after end if there are pending transactions', async function () {
            // send pending transaction
            await this.deposit.send(whitelistAbove, {from:purchaser}).should.be.fulfilled

            // increase to the end
            await increaseTimeTo(this.afterEndTime)

            // send heal
            await this.controller.unpause().should.be.fulfilled
            await this.token.transfer(this.deposit.address, ether(1)).should.be.fulfilled

            // extract it
            await this.deposit.extractTokens(this.token.address, purchaser2).should.be.rejectedWith(EVMThrow)
        })

        it('should not be able to extract token from controller by other than owner', async function () {
            await increaseTimeTo(this.afterEndTime)
            await this.controller.unpause().should.be.fulfilled
            await this.token.transfer(this.pcontroller.address, ether(1)).should.be.fulfilled
            await this.deposit.extractTokens(this.token.address, purchaser2, {from:purchaser}).should.be.rejectedWith(EVMThrow)
        })


        // deposit payable
        it('should be able to deposit through payable fallback', async function () {
            await this.deposit.sendTransaction({value:whitelistAbove, from:purchaser}).should.be.fulfilled
            let _amount = await this.deposit.transactions(0)
            _amount[0].should.be.bignumber.equal(whitelistAbove)
            _amount[3].should.equal(false)
        })        

        it('should forward fallback deposit if whitelisted', async function () {
            // whitelist
            await this.whitelist.setWhitelist(purchaser,true).should.be.fulfilled

            // deposit
            await this.deposit.sendTransaction({from:purchaser,value:whitelistAbove}).should.be.fulfilled

            // checks
            let _amount = await this.deposit.transactions(0)
            _amount[3].should.equal(true)
            let _stake = await this.crowdsale.stakes(purchaser)
            _stake.should.be.bignumber.equal(whitelistAbove.mul(rate).mul(hourBonuses[0]).div(100))
        })

        it('should forward fallback deposit if below the limit', async function () {
            await this.deposit.sendTransaction({from:purchaser, value:whitelistBelow}).should.be.fulfilled
            let _amount = await this.deposit.transactions(0)
            _amount[3].should.equal(true)
            let _stake = await this.crowdsale.stakes(purchaser)
            _stake.should.be.bignumber.equal(whitelistBelow.mul(rate).mul(hourBonuses[0]).div(100))
        })

        it('should get the same bonus for fallback deposit if forwarded later', async function () {
            // deposit
            await this.deposit.sendTransaction({from:purchaser, value:whitelistAbove}).should.be.fulfilled

            // forward 5 days into sale
            await increaseTimeTo(this.startTime+duration.days(5))

            // whitelist and forward
            await this.whitelist.setWhitelist(purchaser,true).should.be.fulfilled
            await this.deposit.forwardTransaction(0,"").should.be.fulfilled
            
            let _stake = await this.crowdsale.stakes(purchaser)
            _stake.should.be.bignumber.equal(whitelistAbove.mul(rate).mul(hourBonuses[0]).div(100))
        })

        // deposit deposit
        it('should be able to deposit', async function () {
            await this.deposit.deposit(purchaser, "", {value:whitelistAbove, from:purchaser}).should.be.fulfilled
            let _amount = await this.deposit.transactions(0)
            _amount[0].should.be.bignumber.equal(whitelistAbove)
            _amount[3].should.equal(false)
        })        

        it('should forward deposit if whitelisted', async function () {
            // whitelist
            await this.whitelist.setWhitelist(purchaser,true).should.be.fulfilled

            // deposit
            await this.deposit.deposit(purchaser, "", {value:whitelistAbove, from:purchaser}).should.be.fulfilled

            // checks
            let _amount = await this.deposit.transactions(0)
            _amount[3].should.equal(true)
            let _stake = await this.crowdsale.stakes(purchaser)
            _stake.should.be.bignumber.equal(whitelistAbove.mul(rate).mul(hourBonuses[0]).div(100))
        })

        it('should forward deposit if below the limit', async function () {
            await this.deposit.deposit(purchaser, "", {value:whitelistBelow, from:purchaser}).should.be.fulfilled
            let _amount = await this.deposit.transactions(0)
            _amount[3].should.equal(true)
            let _stake = await this.crowdsale.stakes(purchaser)
            _stake.should.be.bignumber.equal(whitelistBelow.mul(rate).mul(hourBonuses[0]).div(100))
        })

        it('should forward deposit if offchain signed', async function () {
            let _sign = await web3.eth.sign(this.signer, purchaser)
            await this.deposit.deposit(purchaser, _sign, {value:whitelistAbove, from:purchaser}).should.be.fulfilled
            let _amount = await this.deposit.transactions(0)
            _amount[3].should.equal(true)
            let _stake = await this.crowdsale.stakes(purchaser)
            _stake.should.be.bignumber.equal(whitelistAbove.mul(rate).mul(hourBonuses[0]).div(100))
        })

        it('should fail to forward if cleared', async function () {
            await this.deposit.deposit(purchaser, "", {value:whitelistBelow, from:purchaser}).should.be.fulfilled
            await this.deposit.forwardTransaction(0,"").should.be.rejectedWith(EVMThrow)
        })

        it('should fail to forward non existent transaction', async function () {
            await this.deposit.forwardTransaction(0,"").should.be.rejectedWith(EVMThrow)
        })

        it('should fail to forward transaction without signature', async function () {
            await this.deposit.deposit(purchaser, "", {value:whitelistAbove, from:purchaser}).should.be.fulfilled
            await this.deposit.forwardTransaction(0,"").should.be.rejectedWith(EVMThrow)
        })

        it('should get the same bonus for deposit if forwarded later', async function () {
            // deposit
            await this.deposit.deposit(purchaser, "", {value:whitelistAbove}).should.be.fulfilled

            // forward 5 days into sale
            await increaseTimeTo(this.startTime+duration.days(5))

            // whitelist and forward
            await this.whitelist.setWhitelist(purchaser,true).should.be.fulfilled
            await this.deposit.forwardTransaction(0,"").should.be.fulfilled
            
            let _stake = await this.crowdsale.stakes(purchaser)
            _stake.should.be.bignumber.equal(whitelistAbove.mul(rate).mul(hourBonuses[0]).div(100))
        })
        

        // forward tx
        it('should forward many transactions', async function () {
            // deposit
            await this.deposit.deposit(purchaser, "", {value:whitelistAbove, from:purchaser}).should.be.fulfilled
            await this.deposit.deposit(purchaser, "", {value:whitelistAbove, from:purchaser}).should.be.fulfilled

            // whitelist
            await this.whitelist.setWhitelist(purchaser,true).should.be.fulfilled
            await this.deposit.forwardManyTransaction([0,1]).should.be.fulfilled

            // checks
            let _amount = await this.deposit.transactions(0)
            let _amount2 = await this.deposit.transactions(1)
            _amount[3].should.equal(true)
            _amount2[3].should.equal(true)
            let _stake = await this.crowdsale.stakes(purchaser)
            _stake.should.be.bignumber.equal(whitelistAbove.mul(2).mul(rate).mul(hourBonuses[0]).div(100))
        })

        it('should forward investor transactions if whitelisted', async function () {
            // deposit
            await this.deposit.deposit(purchaser, "", {value:whitelistAbove, from:purchaser}).should.be.fulfilled
            await this.deposit.deposit(purchaser, "", {value:whitelistAbove, from:purchaser}).should.be.fulfilled

            // whitelist
            await this.whitelist.setWhitelist(purchaser,true).should.be.fulfilled
            await this.deposit.forwardInvestorTransaction(purchaser, "").should.be.fulfilled

            // checks
            let _amount = await this.deposit.transactions(0)
            let _amount2 = await this.deposit.transactions(1)
            _amount[3].should.equal(true)
            _amount2[3].should.equal(true)
            let _stake = await this.crowdsale.stakes(purchaser)
            _stake.should.be.bignumber.equal(whitelistAbove.mul(2).mul(rate).mul(hourBonuses[0]).div(100))
        })

        it('should forward investor transactions if offchain signed', async function () {
            // deposit
            await this.deposit.deposit(purchaser, "", {value:whitelistAbove, from:purchaser}).should.be.fulfilled
            await this.deposit.deposit(purchaser, "", {value:whitelistAbove, from:purchaser}).should.be.fulfilled

            // whitelist
            let _sign = await web3.eth.sign(this.signer, purchaser)
            await this.deposit.forwardInvestorTransaction(purchaser, _sign).should.be.fulfilled

            // checks
            let _amount = await this.deposit.transactions(0)
            let _amount2 = await this.deposit.transactions(1)
            _amount[3].should.equal(true)
            _amount2[3].should.equal(true)
            let _stake = await this.crowdsale.stakes(purchaser)
            _stake.should.be.bignumber.equal(whitelistAbove.mul(2).mul(rate).mul(hourBonuses[0]).div(100))
        })


        // refund tx
        it('should fail for non existent transaction', async function () {
            await this.deposit.refundTransaction(0).should.be.rejectedWith(EVMThrow)
        })

        it('should refund transaction after end', async function () {
            // deposit
            await this.deposit.deposit(purchaser, "", {value:whitelistAbove, from:purchaser}).should.be.fulfilled

            // forward at the end of sale
            await increaseTimeTo(this.afterEndTime)

            // refund
            let _before = await web3.eth.getBalance(purchaser)
            await this.deposit.refundTransaction(0).should.be.fulfilled
            let _after = await web3.eth.getBalance(purchaser)
            _after.minus(_before).should.be.bignumber.equal(whitelistAbove)
        })

        it('should fail to refund an already forwarded item', async function () {
            // deposit
            let _sign = await web3.eth.sign(this.signer, purchaser)
            await this.deposit.deposit(purchaser, "", {value:whitelistAbove, from:purchaser}).should.be.fulfilled

            // refund
            await this.deposit.refundTransaction(0).should.be.rejectedWith(EVMThrow)
        })

        it('should fail to refund an already refunded item', async function () {
            // deposit
            await this.deposit.deposit(purchaser, "", {value:whitelistAbove, from:purchaser}).should.be.fulfilled

            // forward at the end of sale
            await increaseTimeTo(this.afterEndTime)

            // refund
            let _before = await web3.eth.getBalance(purchaser)
            await this.deposit.refundTransaction(0).should.be.fulfilled
            await this.deposit.refundTransaction(0).should.be.rejectedWith(EVMThrow)
        })

        it('should refund many transactions after end', async function () {
            // deposit
            await this.deposit.deposit(purchaser, "", {value:whitelistAbove, from:purchaser}).should.be.fulfilled
            await this.deposit.deposit(purchaser, "", {value:whitelistAbove, from:purchaser}).should.be.fulfilled

            // forward at the end of sale
            await increaseTimeTo(this.afterEndTime)

            // refund
            let _before = await web3.eth.getBalance(purchaser)
            await this.deposit.refundManyTransaction([0,1]).should.be.fulfilled
            let _after = await web3.eth.getBalance(purchaser)
            _after.minus(_before).should.be.bignumber.equal(whitelistAbove.mul(2))
        })

        it('should refund investor transactions after end', async function () {
            // deposit
            await this.deposit.deposit(purchaser, "", {value:whitelistAbove, from:purchaser}).should.be.fulfilled
            await this.deposit.deposit(purchaser, "", {value:whitelistAbove, from:purchaser}).should.be.fulfilled

            // forward at the end of sale
            await increaseTimeTo(this.afterEndTime)

            // refund
            let _before = await web3.eth.getBalance(purchaser)
            await this.deposit.refundInvestor(purchaser).should.be.fulfilled
            let _after = await web3.eth.getBalance(purchaser)
            _after.minus(_before).should.be.bignumber.equal(whitelistAbove.mul(2))
        })


        // misc get tx ids
        it('should list both cleared and non-cleared transactions', async function () {
            // deposit
            await this.deposit.deposit(purchaser, "", {value:whitelistAbove, from:purchaser}).should.be.fulfilled
            await this.whitelist.setWhitelist(purchaser,true).should.be.fulfilled
            await this.deposit.deposit(purchaser, "", {value:whitelistAbove, from:purchaser}).should.be.fulfilled
            let _res = await this.deposit.getTransactionIds(0,2,true,true)
            _res[0].should.be.bignumber.equal(0)
            _res[1].should.be.bignumber.equal(1)
        })

        it('should list cleared transactions', async function () {
            // deposit
            await this.deposit.deposit(purchaser, "", {value:whitelistAbove, from:purchaser}).should.be.fulfilled
            await this.whitelist.setWhitelist(purchaser,true).should.be.fulfilled
            await this.deposit.deposit(purchaser, "", {value:whitelistAbove, from:purchaser}).should.be.fulfilled
            let _res = await this.deposit.getTransactionIds(0,2,true,false)
            _res[0].should.be.bignumber.equal(1)
        })

        it('should list non-cleared transactions', async function () {
            // deposit
            await this.deposit.deposit(purchaser, "", {value:whitelistAbove, from:purchaser}).should.be.fulfilled
            await this.whitelist.setWhitelist(purchaser,true).should.be.fulfilled
            await this.deposit.deposit(purchaser, "", {value:whitelistAbove, from:purchaser}).should.be.fulfilled
            let _res = await this.deposit.getTransactionIds(0,2,false,true)
            _res[0].should.be.bignumber.equal(0)
        })

        it('should list no transactions', async function () {
            // deposit
            await this.deposit.deposit(purchaser, "", {value:whitelistAbove, from:purchaser}).should.be.fulfilled
            await this.whitelist.setWhitelist(purchaser,true).should.be.fulfilled
            await this.deposit.deposit(purchaser, "", {value:whitelistAbove, from:purchaser}).should.be.fulfilled
            let _res = await this.deposit.getTransactionIds(0,2,false,false)
            _res.length.should.equal(0)
        })
    })



    describe('payments to crowdsale', function () {
        it('should reject payments smaller than min contribution', async function () {
            await this.crowdsale.send(minContribution.minus(1)).should.be.rejectedWith(EVMThrow)
            await this.crowdsale.buyTokens(investor, {value: minContribution.minus(1), from: purchaser}).should.be.rejectedWith(EVMThrow)
        })

        it('should reject zero payments', async function () {
            await this.crowdsale.buyTokens(investor).should.be.rejectedWith(EVMThrow)
        })


        it('should reject payments for 0x0 address', async function () {
            await this.crowdsale.buyTokens(0,{value: minContribution}).should.be.rejectedWith(EVMThrow)
        })

        // we can't debug this from truffle https://github.com/ethereum/web3.js/issues/1043
        /*it('should reject zero payments', async function () {
            await this.crowdsale.buyTokens(investor, "sign").should.be.rejectedWith(EVMThrow)
            //let _calldata = '0x'+web3.sha3('buyTokens(address,bytes)').slice(2,10)+Array(25).join('0')+investor.slice(2)+Array(63).join('0')+'4055'
            //await this.crowdsale.sendTransaction({data:_calldata}).should.be.rejectedWith(EVMThrow)
        })

        it('should reject purchase for 0x0 address', async function () {
            await this.crowdsale.buyTokens(0,"sign", {value: minContribution, from: purchaser}).should.be.rejectedWith(EVMThrow)
        })*/

        it('should fail to call depositEth if not deposit address', async function () {
            await this.crowdsale.depositEth(0,0,"sign", {value: minContribution, from: purchaser}).should.be.rejectedWith(EVMThrow)
        })

        it('should accept payments before start', async function () {
            await this.crowdsale.send(minContribution).should.be.fulfilled
            await this.crowdsale.buyTokens(investor, {value: minContribution, from: purchaser}).should.be.fulfilled
        })

        it('should accept payments after start', async function () {
            await increaseTimeTo(this.startTime)
            await this.crowdsale.send(minContribution).should.be.fulfilled
            await this.crowdsale.buyTokens(investor, {value: minContribution, from: purchaser}).should.be.fulfilled
        })

        it('should measure buyTokens tx costs', async function () {
            let tx = await this.crowdsale.buyTokens(investor, {value: minContribution, from: purchaser}).should.be.fulfilled
            console.log("*** BUY TOKENS: " + tx.receipt.gasUsed + " gas used.");
        })

        it('should reject payments after end', async function () {
            await increaseTimeTo(this.afterEndTime)
            await this.crowdsale.send(minContribution).should.be.rejectedWith(EVMThrow)
            await this.crowdsale.buyTokens(investor, {value: minContribution, from: purchaser}).should.be.rejectedWith(EVMThrow)
        })

        it('should reject payments outside cap', async function () {
            await this.whitelist.setWhitelist(purchaser2,true).should.be.fulfilled
            await this.crowdsale.sendTransaction({value: cap, from: purchaser2}).should.be.fulfilled
            await this.crowdsale.send(1).should.be.rejectedWith(EVMThrow)
        })

        it('should refund payments that exceed cap', async function () {
            await this.whitelist.setManyWhitelist([purchaser3,purchaser4],true).should.be.fulfilled
            const pre = web3.eth.getBalance(purchaser4)

            await this.crowdsale.sendTransaction({value: lessThanCap, from: purchaser3}).should.be.fulfilled
            await this.crowdsale.sendTransaction({value: cap, from: purchaser4, gasPrice:0}).should.be.fulfilled

            const post = web3.eth.getBalance(purchaser4)

            pre.minus(post).should.be.bignumber.equal(cap.minus(lessThanCap))
        })

        // deposit offchain
        it('should reject depositOffchain other initiated by owner', async function () {
            await this.crowdsale.depositOffchain(purchaser, ether(1), 0, "sign", {from:purchaser}).should.be.rejectedWith(EVMThrow)
        })

        it('should reject depositOffchain with 0x0 address', async function () {
            await this.crowdsale.depositOffchain(0, ether(1), 0, "sign").should.be.rejectedWith(EVMThrow)
        })

        it('should depositOffchain', async function () {
            await this.crowdsale.depositOffchain(purchaser, whitelistBelow, 0, "sign").should.be.fulfilled
            let _amount = await this.crowdsale.stakes(purchaser)
            _amount.should.be.bignumber.equal(whitelistBelow.mul(rate).mul(hourBonuses[0]).div(100))
        })

    })



    describe('low-level purchase', function () {

        it('should log purchase', async function () {
            const {logs} = await this.crowdsale.sendTransaction({value: minContribution, from: investor})

            const event = logs.find(e => e.event === 'TokenPurchase')

            should.exist(event)
            event.args._purchaser.should.equal(investor)
            event.args._beneficiary.should.equal(investor)
            event.args._value.should.be.bignumber.equal(minContribution)
            event.args._amount.should.be.bignumber.equal(minContribution.mul(rate).mul(hourBonuses[0]).div(100))
        })

    })


    describe('hight-level purchase', function () {

        it('should log purchase', async function () {
            const {logs} = await this.crowdsale.buyTokens(investor, {value: minContribution, from: purchaser})

            const event = logs.find(e => e.event === 'TokenPurchase')

            should.exist(event)
            event.args._purchaser.should.equal(purchaser)
            event.args._beneficiary.should.equal(investor)
            event.args._value.should.be.bignumber.equal(minContribution)
            event.args._amount.should.be.bignumber.equal(minContribution.mul(rate).mul(hourBonuses[0]).div(100))
        })

        // misc get contributor data
        it('should give back how much one can contribute', async function () {
            let _res = await this.crowdsale.howMuchCanIContributeNow()
            _res.should.be.bignumber.equal(cap)
        })

        it('should fail when contribution amount is queried for 0x0', async function () {
            let _res = await this.crowdsale.howMuchCanXContributeNow(0).should.be.rejectedWith(EVMThrow)
        })

        it('should give proper contributor count for zero', async function () {
            let _res = await this.crowdsale.getContributorsCount()
            _res.should.be.bignumber.equal(0)
        })

        it('should give proper contributor count for two', async function () {
            await this.crowdsale.buyTokens(investor, {value: minContribution, from: purchaser})
            await this.crowdsale.buyTokens(purchaser, {value: minContribution, from: purchaser})
            let _res = await this.crowdsale.getContributorsCount()
            _res.should.be.bignumber.equal(2)
        })

        it('should list both pending and claimed contributors', async function () {
            await this.crowdsale.buyTokens(investor, {value: minContribution, from: purchaser})
            await this.crowdsale.buyTokens(purchaser, {value: minContribution, from: purchaser})
            let _res = await this.crowdsale.getContributors(true,true)
            _res[0].should.equal(investor)
            _res[1].should.equal(purchaser)
        })

        it('should list pending contributors', async function () {
            await this.crowdsale.buyTokens(investor, {value: minContribution, from: purchaser})
            await this.crowdsale.buyTokens(purchaser, {value: minContribution, from: purchaser})
            await increaseTimeTo(this.afterEndTime)
            await this.crowdsale.finalize().should.be.fulfilled
            await this.crowdsale.claimManyTokenFor([investor]).should.be.fulfilled
            let _res = await this.crowdsale.getContributors(true,false)
            _res[0].should.equal(purchaser)
        })

        it('should list claimed contributors', async function () {
            await this.crowdsale.buyTokens(investor, {value: minContribution, from: purchaser})
            await this.crowdsale.buyTokens(purchaser, {value: minContribution, from: purchaser})
            await increaseTimeTo(this.afterEndTime)
            await this.crowdsale.finalize().should.be.fulfilled
            await this.crowdsale.claimManyTokenFor([investor]).should.be.fulfilled
            let _res = await this.crowdsale.getContributors(false,true)
            _res[0].should.equal(investor)
        })

        it('should list no contributors', async function () {
            await this.crowdsale.buyTokens(investor, {value: minContribution, from: purchaser})
            await this.crowdsale.buyTokens(purchaser, {value: minContribution, from: purchaser})
            await increaseTimeTo(this.afterEndTime)
            await this.crowdsale.finalize().should.be.fulfilled
            await this.crowdsale.claimManyTokenFor([investor]).should.be.fulfilled
            let _res = await this.crowdsale.getContributors(false,false)
            _res.length.should.equal(0)
        })

    })


    describe('claim token', function () {

        it('should deny claim token before finish', async function () {
            await this.crowdsale.claimToken({from: investor}).should.be.rejectedWith(EVMThrow)
            await increaseTimeTo(this.startTime)
            await this.crowdsale.claimToken({from: investor}).should.be.rejectedWith(EVMThrow)
        })

        // below soft cap
        it('should allow claim token after finish below softCap', async function () {
            await this.whitelist.setWhitelist(investor,true).should.be.fulfilled
            await this.crowdsale.sendTransaction({value: lessThanSoftCap, from: investor})
            await increaseTimeTo(this.afterEndTime)

            // no claim before finalize
            await this.crowdsale.claimToken({from: investor, gasPrice: 0}).should.be.rejectedWith(EVMThrow)

            // valid claim after finalize
            await this.crowdsale.finalize({from: deployer})
            const pre = await this.token.balanceOf(investor)
            await this.crowdsale.claimManyTokenFor([investor],{gasPrice: 0}).should.be.fulfilled
            const post = await this.token.balanceOf(investor)

            post.minus(pre).should.be.bignumber.equal(lessThanSoftCap.mul(hourBonuses[0]).div(100).mul(rate))

            // invalid claim after finalize
            await this.crowdsale.claimToken({from: purchaser, gasPrice: 0}).should.be.rejectedWith(EVMThrow)
        })

        // when reaching soft cap we distribute all tokens
        it('should allow claim token after finish reaching soft cap', async function () {
            await this.whitelist.setWhitelist(investor,true).should.be.fulfilled
            await this.crowdsale.sendTransaction({value: softCap, from: investor})
            await increaseTimeTo(this.afterEndTime)

            // valid claim after finalize
            await this.crowdsale.finalize({from: deployer})
            const pre = await this.token.balanceOf(investor)
            await this.crowdsale.claimManyTokenFor([investor],{gasPrice: 0}).should.be.fulfilled
            const post = await this.token.balanceOf(investor)

            post.minus(pre).should.be.bignumber.equal(softCap.mul(rate).mul(hourBonuses[0]).div(100))

            // invalid claim after finalize
            await this.crowdsale.claimToken({from: purchaser, gasPrice: 0}).should.be.rejectedWith(EVMThrow)
        })

        it('should correctly distribute among multiple participants when buying on separate days', async function () {
            await increaseTimeTo(this.startTime)
            await this.whitelist.setManyWhitelist([investor,purchaser],true).should.be.fulfilled
            await this.crowdsale.sendTransaction({value: cap.div(2), from: investor}).should.be.fulfilled

            await increaseTimeTo(this.startTime+duration.days(2.5))
            await this.crowdsale.sendTransaction({value: cap.div(2), from: purchaser}).should.be.fulfilled

            await increaseTimeTo(this.afterEndTime)

            // valid claim after finalize
            await this.crowdsale.finalize()
            const preInvestor = await this.token.balanceOf(investor)
            const prePurchaser = await this.token.balanceOf(purchaser)
            await this.crowdsale.claimManyTokenFor([investor, purchaser],{gasPrice: 0}).should.be.fulfilled
            const postInvestor = await this.token.balanceOf(investor)
            const postPurchaser = await this.token.balanceOf(purchaser)

            postInvestor.minus(preInvestor).should.be.bignumber.equal(cap.div(2).mul(rate).mul(hourBonuses[0]).div(100))
            postPurchaser.minus(prePurchaser).should.be.bignumber.equal(cap.div(2).mul(rate).mul(dayBonuses[1]).div(100))
        })

        it('should send back excess tokens to controllers SALE address', async function () {
            await this.whitelist.setWhitelist(investor,true).should.be.fulfilled
            await this.crowdsale.sendTransaction({value: lessThanSoftCap, from: investor})
            await increaseTimeTo(this.afterEndTime)

            // valid claim after finalize
            const pre = await this.token.balanceOf(this.crowdsale.address)
            await this.crowdsale.finalize({from: deployer})
            const post = await this.token.balanceOf(this.crowdsale.address)

            pre.minus(post).should.be.bignumber.equal(expectedTokenAmount.minus(lessThanSoftCap.mul(hourBonuses[0]).div(100).mul(rate)))
        })

        it('should allow token transfer after controller unpaused', async function () {
            await this.whitelist.setWhitelist(investor,true).should.be.fulfilled
            await this.crowdsale.sendTransaction({value: lessThanSoftCap, from: investor})
            await increaseTimeTo(this.afterEndTime)

            // valid claim after finalize
            await this.crowdsale.finalize({from: deployer})
            await this.crowdsale.claimToken({from: investor, gasPrice: 0}).should.be.fulfilled

            // invalid transfer until controller is paused
            await this.token.transfer(purchaser,1,{from: investor, gasPrice: 0}).should.be.rejectedWith(EVMThrow)

            // valid transfer after controller unpaused
            await this.controller.unpause()
            await this.token.transfer(purchaser,1,{from: investor, gasPrice: 0}).should.be.fulfilled
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
            await this.whitelist.setWhitelist(investor,true).should.be.fulfilled

            await increaseTimeTo(this.startTime)
            await this.crowdsale.sendTransaction({value:softCap, from: investor, gasPrice:0}).should.be.fulfilled
            let hodl = await this.hodler.hodlerStakes(investor)
            hodl[0].should.be.bignumber.equal(new BigNumber(0)) // no stake before claiming tokens

            await increaseTimeTo(this.afterEndTime)
            await this.crowdsale.finalize()
            await this.crowdsale.claimToken({from: investor, gasPrice: 0}).should.be.fulfilled

            hodl = await this.hodler.hodlerStakes(investor)
            hodl[0].should.be.bignumber.equal(softCap.mul(rate).mul(hourBonuses[0]).div(100))
        })

        it('should set hodl stake based on multiple contributions', async function () {
            await this.whitelist.setWhitelist(investor,true).should.be.fulfilled

            await increaseTimeTo(this.startTime)
            await this.crowdsale.sendTransaction({value:softCap.div(2), from: investor, gasPrice:0}).should.be.fulfilled
            await this.crowdsale.sendTransaction({value:softCap.div(2), from: investor, gasPrice:0}).should.be.fulfilled
            let hodl = await this.hodler.hodlerStakes(investor)
            hodl[0].should.be.bignumber.equal(new BigNumber(0)) // no stake before claiming tokens

            await increaseTimeTo(this.afterEndTime)
            await this.crowdsale.finalize()
            await this.crowdsale.claimToken({from: investor, gasPrice: 0}).should.be.fulfilled

            hodl = await this.hodler.hodlerStakes(investor)
            hodl[0].should.be.bignumber.equal(softCap.mul(rate).mul(hourBonuses[0]).div(100))
        })

        it('should invalidate hodl stake after transfer', async function () {
            await this.whitelist.setWhitelist(investor,true).should.be.fulfilled

            await increaseTimeTo(this.startTime)
            await this.crowdsale.sendTransaction({value:softCap, from: investor, gasPrice:0}).should.be.fulfilled
            let hodl = await this.hodler.hodlerStakes(investor)
            hodl[0].should.be.bignumber.equal(new BigNumber(0)) // no stake before claiming tokens

            await increaseTimeTo(this.afterEndTime)
            await this.crowdsale.finalize({from: deployer})
            await this.controller.unpause({from: deployer})
            await this.crowdsale.claimToken({from: investor, gasPrice: 0}).should.be.fulfilled

            hodl = await this.hodler.hodlerStakes(investor)
            hodl[0].should.be.bignumber.equal(softCap.mul(rate).mul(hourBonuses[0]).div(100))
            hodl[1].should.equal(false)

            await this.token.transfer(purchaser,1,{from: investor, gasPrice:0}).should.be.fulfilled
            hodl = await this.hodler.hodlerStakes(investor)
            hodl[0].should.be.bignumber.equal(softCap.mul(rate).mul(hourBonuses[0]).div(100))
            hodl[1].should.equal(true)
        })

        // token transfer wont be enabled until end of normal sale, so buyers can't invalidate their stakes between pre and normal sale
        it('should not invalidate hodl stake if receiving transfer, too early claim for 3 month reward', async function () {
            await this.whitelist.setManyWhitelist([investor,purchaser],true).should.be.fulfilled

            await increaseTimeTo(this.startTime)
            await this.crowdsale.sendTransaction({value:softCap.div(2), from: investor, gasPrice:0}).should.be.fulfilled
            await this.crowdsale.sendTransaction({value:softCap.div(2), from: purchaser, gasPrice:0}).should.be.fulfilled

            // transfer tokens from investor to purchaser
            await increaseTimeTo(this.afterEndTime)
            await this.crowdsale.finalize({from: deployer})
            await this.controller.unpause({from: deployer})
            await this.crowdsale.claimManyTokenFor([investor, purchaser],{gasPrice: 0}).should.be.fulfilled
            await this.token.transfer(purchaser,1,{from: investor, gasPrice:0}).should.be.fulfilled

            // investor should be invalidated
            let hodl = await this.hodler.hodlerStakes(investor)
            hodl[0].should.be.bignumber.equal(softCap.div(2).mul(rate).mul(hourBonuses[0]).div(100))
            hodl[1].should.equal(true)

            // purchaser should not be invalidated
            hodl = await this.hodler.hodlerStakes(purchaser)
            hodl[0].should.be.bignumber.equal(softCap.div(2).mul(rate).mul(hourBonuses[0]).div(100))
            hodl[1].should.equal(false)

            // too early claiming
            await increaseTimeTo(this.afterEndTime+duration.weeks(2)+duration.days(89))
            let pre = await this.token.balanceOf(purchaser)
            await this.hodler.claimHodlRewardsFor([purchaser]).should.be.fulfilled
            let post = await this.token.balanceOf(purchaser)
            post.minus(pre).should.be.bignumber.equal(ether(0))
        })

        it('should not invalidate hodl stake if receiving transfer, distribute 3 month reward properly', async function () {
            await this.whitelist.setManyWhitelist([investor,purchaser],true).should.be.fulfilled

            await increaseTimeTo(this.startTime)
            await this.crowdsale.sendTransaction({value:softCap.div(2), from: investor, gasPrice:0}).should.be.fulfilled
            await this.crowdsale.sendTransaction({value:softCap.div(2), from: purchaser, gasPrice:0}).should.be.fulfilled

            // transfer tokens from investor to purchaser
            await increaseTimeTo(this.afterEndTime)
            await this.crowdsale.finalize({from: deployer})
            await this.controller.unpause({from: deployer})
            await this.crowdsale.claimManyTokenFor([investor, purchaser],{gasPrice: 0}).should.be.fulfilled
            await this.token.transfer(purchaser,1,{from: investor, gasPrice:0}).should.be.fulfilled

            // investor should be invalidated
            let hodl = await this.hodler.hodlerStakes(investor)
            hodl[0].should.be.bignumber.equal(softCap.div(2).mul(rate).mul(hourBonuses[0]).div(100))
            hodl[1].should.equal(true)

            // purchaser should not be invalidated
            hodl = await this.hodler.hodlerStakes(purchaser)
            hodl[0].should.be.bignumber.equal(softCap.div(2).mul(rate).mul(hourBonuses[0]).div(100))
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
            await this.whitelist.setManyWhitelist([investor,purchaser],true).should.be.fulfilled

            await increaseTimeTo(this.startTime)
            await this.crowdsale.sendTransaction({value:softCap.div(2), from: investor, gasPrice:0}).should.be.fulfilled
            await this.crowdsale.sendTransaction({value:softCap.div(2), from: purchaser, gasPrice:0}).should.be.fulfilled

            // transfer tokens from investor to purchaser
            await increaseTimeTo(this.afterEndTime)
            await this.crowdsale.finalize({from: deployer})
            await this.controller.unpause({from: deployer})
            await this.crowdsale.claimManyTokenFor([investor, purchaser],{gasPrice: 0}).should.be.fulfilled
            await this.token.transfer(purchaser,1,{from: investor, gasPrice:0}).should.be.fulfilled

            // investor should be invalidated
            let hodl = await this.hodler.hodlerStakes(investor)
            hodl[0].should.be.bignumber.equal(softCap.div(2).mul(rate).mul(hourBonuses[0]).div(100))
            hodl[1].should.equal(true)

            // purchaser should not be invalidated
            hodl = await this.hodler.hodlerStakes(purchaser)
            hodl[0].should.be.bignumber.equal(softCap.div(2).mul(rate).mul(hourBonuses[0]).div(100))
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
            await this.whitelist.setManyWhitelist([investor,purchaser],true).should.be.fulfilled

            await increaseTimeTo(this.startTime)
            await this.crowdsale.sendTransaction({value:softCap.div(2), from: investor, gasPrice:0}).should.be.fulfilled
            await this.crowdsale.sendTransaction({value:softCap.div(2), from: purchaser, gasPrice:0}).should.be.fulfilled

            // transfer tokens from investor to purchaser
            await increaseTimeTo(this.afterEndTime)
            await this.crowdsale.finalize({from: deployer})
            await this.controller.unpause({from: deployer})
            await this.crowdsale.claimManyTokenFor([investor, purchaser],{gasPrice: 0}).should.be.fulfilled
            await this.token.transfer(purchaser,1,{from: investor, gasPrice:0}).should.be.fulfilled

            // investor should be invalidated
            let hodl = await this.hodler.hodlerStakes(investor)
            hodl[0].should.be.bignumber.equal(softCap.div(2).mul(rate).mul(hourBonuses[0]).div(100))
            hodl[1].should.equal(true)

            // purchaser should not be invalidated
            hodl = await this.hodler.hodlerStakes(purchaser)
            hodl[0].should.be.bignumber.equal(softCap.div(2).mul(rate).mul(hourBonuses[0]).div(100))
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
            await this.whitelist.setManyWhitelist([investor,purchaser],true).should.be.fulfilled

            await increaseTimeTo(this.startTime)
            await this.crowdsale.sendTransaction({value:softCap, from: investor, gasPrice:0}).should.be.fulfilled
            await this.crowdsale.sendTransaction({value:softCap.div(2), from: purchaser, gasPrice:0}).should.be.fulfilled

            // transfer tokens from investor to purchaser
            await increaseTimeTo(this.afterEndTime)
            await this.crowdsale.finalize({from: deployer})
            await this.controller.unpause({from: deployer})
            await this.crowdsale.claimManyTokenFor([investor, purchaser],{gasPrice: 0}).should.be.fulfilled

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
            await this.whitelist.setManyWhitelist([investor,purchaser],true).should.be.fulfilled

            await increaseTimeTo(this.startTime)
            await this.crowdsale.sendTransaction({value:softCap, from: investor, gasPrice:0}).should.be.fulfilled
            await this.crowdsale.sendTransaction({value:softCap.div(2), from: purchaser, gasPrice:0}).should.be.fulfilled

            // transfer tokens from investor to purchaser
            await increaseTimeTo(this.afterEndTime)
            await this.crowdsale.finalize({from: deployer})
            await this.controller.unpause({from: deployer})
            await this.crowdsale.claimManyTokenFor([investor, purchaser],{gasPrice: 0}).should.be.fulfilled

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
            await this.whitelist.setManyWhitelist([investor,purchaser],true).should.be.fulfilled

            await increaseTimeTo(this.startTime)
            await this.crowdsale.sendTransaction({value:softCap, from: investor, gasPrice:0}).should.be.fulfilled
            await this.crowdsale.sendTransaction({value:softCap.div(2), from: purchaser, gasPrice:0}).should.be.fulfilled

            // transfer tokens from investor to purchaser
            await increaseTimeTo(this.afterEndTime)
            await this.crowdsale.finalize({from: deployer})
            await this.controller.unpause({from: deployer})
            await this.crowdsale.claimManyTokenFor([investor, purchaser],{gasPrice: 0}).should.be.fulfilled

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
            await this.whitelist.setManyWhitelist([investor,purchaser],true).should.be.fulfilled

            await increaseTimeTo(this.startTime)
            await this.crowdsale.sendTransaction({value:softCap, from: investor, gasPrice:0}).should.be.fulfilled
            await this.crowdsale.sendTransaction({value:softCap.div(2), from: purchaser, gasPrice:0}).should.be.fulfilled

            // transfer tokens from investor to purchaser
            await increaseTimeTo(this.afterEndTime)
            await this.crowdsale.finalize({from: deployer})
            await this.controller.unpause({from: deployer})
            await this.crowdsale.claimManyTokenFor([investor, purchaser],{gasPrice: 0}).should.be.fulfilled

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

        it('should correctly distribute 9 month hodl reward to two participants if it has excess token', async function () {
            await this.whitelist.setManyWhitelist([investor,purchaser],true).should.be.fulfilled
            
            await increaseTimeTo(this.startTime)
            await this.crowdsale.sendTransaction({value:softCap, from: investor, gasPrice:0}).should.be.fulfilled
            await this.crowdsale.sendTransaction({value:softCap.div(2), from: purchaser, gasPrice:0}).should.be.fulfilled

            // transfer tokens from investor to purchaser
            await increaseTimeTo(this.afterEndTime)
            await this.crowdsale.finalize()
            await this.controller.unpause()
            await this.crowdsale.claimManyTokenFor([investor, purchaser],{gasPrice: 0}).should.be.fulfilled

            // send excess token
            await this.token.transfer(this.hodler.address, ether(6))

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

            postI.minus(preI).should.be.bignumber.equal(totalToken9m.add(ether(6)).mul(2).div(3).floor())
            postP.minus(preP).should.be.bignumber.equal(totalToken9m.add(ether(6)).div(3).floor())
        })

    })

})