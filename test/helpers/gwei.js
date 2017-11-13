export default function gwei(n) {
  return new web3.BigNumber(web3.toWei(n, 'gwei'))
}
