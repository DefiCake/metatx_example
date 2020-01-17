const MetaTx = artifacts.require('MetaTx.sol');
const GeoToken = artifacts.require('GeoToken.sol');
const USDT = artifacts.require('USDT.sol');

const { soliditySha3, toWei, BN } = require('web3-utils');

const {
  singletons,
  time,
  expectRevert
} = require('@openzeppelin/test-helpers');

contract('MetaTx', ([erc1820funder, alice, bob, ...accounts]) => {
  let metatx, geotoken, usdt; // Contratos desplegados

  const tradeAmounts = toWei(new BN('10'), 'ether'); // Tokens que se van a intercambiar

  before('Fund ERC1820 account and deploy ERC1820 registry', async () => {
    erc1820 = await singletons.ERC1820Registry(erc1820funder);
  });

  beforeEach('Deploy the contracts', async () => {
    // Deploy de los contratos
    metatx = await MetaTx.new({ from: alice });
    geotoken = await GeoToken.new([metatx.address], { from: alice });
    usdt = await USDT.new([metatx.address], { from: alice });

    // Minteamos 10G para Alice y 10USD para Boib
    await geotoken.mint(tradeAmounts, { from: alice }); // Mint 10 Geos for Alice
    await usdt.mint(tradeAmounts, { from: bob }); // Mint 10$ for Bob

    // Comprobamos que las cantidades se han minteado correctamente:
    (await geotoken.balanceOf(alice)).should.be.bignumber.equal(tradeAmounts);
    (await usdt.balanceOf(alice)).should.be.bignumber.equal(new BN('0'));
    (await usdt.balanceOf(bob)).should.be.bignumber.equal(tradeAmounts);
    (await geotoken.balanceOf(bob)).should.be.bignumber.equal(new BN('0'));
  });

  // Comprobación básica de firmas:
  it('isSignedBy', async () => {
    // Sacamos un hash del contenido que queremos firmar
    const msgHash = await soliditySha3('Hello world!');

    // ignorar: Esto es lo mismo que la función `ethSignedHash` del contrato
    // Lo dejo para futuras referencias
    // const ethHash = await web3.eth.accounts.hashMessage(msgHash);

    // Se firma el hash del contenido. Se tiene que firmar el hash del contenido
    // y no el contenido en si mismo porque los tíos que hacen esto son un poco hdps
    let signature = await web3.eth.sign(msgHash, alice);
    signature =
      signature.substr(0, 130) + (signature.substr(130) == '00' ? '1b' : '1c'); // v: 0,1 => 27,28, esto solo para ganache

    // Finalmente, comprobamos que signature es msgHash firmado por Alice
    (await metatx.isSignedBy(alice, msgHash, signature)).should.be.equal(true);
  });

  // Ponemos en práctica lo anterior con un atomic swap:
  // Alice tiene 10Geos que quiere cambiar por 10USDTs.
  // Alice publica un mensaje firmado que tiene una fecha de caducidad
  // Quien meta ese mensaje firmado en la función atomicSwap,
  // recogerá los 10Geos si aporta 10USDTs a cambio.
  // Alice no necesita gastar gas: el que ejecute la transacción (Bob) sí
  describe('Atomic Swap: Alice trades GEO for USDT without paying for gas', () => {
    it('allows to make an atomic swap', async () => {
      // Generamos el deadline: la firma tiene una validez de un día
      const deadline =
        (await time.latest()).toNumber() +
        (await time.duration.days(1).toNumber());
      // Generamos el hash del contenido
      const msgHash = await soliditySha3(
        geotoken.address,
        tradeAmounts,
        usdt.address,
        tradeAmounts,
        deadline
      );

      // Firmamos el hash
      let signature = await web3.eth.sign(msgHash, alice);
      signature =
        signature.substr(0, 130) +
        (signature.substr(130) == '00' ? '1b' : '1c'); // v: 0,1 => 27,28

      // Bob recibe los parámetros por otros medios (por ejemplo, email).
      await metatx.atomicSwap(
        msgHash,
        geotoken.address,
        tradeAmounts,
        usdt.address,
        tradeAmounts,
        deadline,
        signature,
        { from: bob }
      );

      // Si el intercambio se ha efectuado correctamente,
      // ahora Bob tiene 10Geos y Alice 10USDTs
      (await geotoken.balanceOf(bob)).should.be.bignumber.equal(tradeAmounts);
      (await usdt.balanceOf(bob)).should.be.bignumber.equal(new BN('0'));

      (await usdt.balanceOf(alice)).should.be.bignumber.equal(tradeAmounts);
      (await geotoken.balanceOf(alice)).should.be.bignumber.equal(new BN('0'));
    });

    // Vamos a intentar putear al contrato

    // Si Bob intenta ejecutar la transacción después de que haya caducado:
    it('reverts if deadline has passed', async () => {
      const deadline =
        (await time.latest()).toNumber() +
        (await time.duration.days(1).toNumber());
      const msgHash = await soliditySha3(
        geotoken.address,
        tradeAmounts,
        usdt.address,
        tradeAmounts,
        deadline
      );

      let signature = await web3.eth.sign(msgHash, alice);
      signature =
        signature.substr(0, 130) +
        (signature.substr(130) == '00' ? '1b' : '1c'); // v: 0,1 => 27,28

      await time.increase(
        (await time.duration.days(1)) + (await time.duration.minutes(1))
      ); // Incrementamos el reloj un día + 1 minuto

      await expectRevert(
        metatx.atomicSwap(
          msgHash,
          geotoken.address,
          tradeAmounts,
          usdt.address,
          tradeAmounts,
          deadline,
          signature,
          { from: bob }
        ),
        'This swap is outdated'
      );
    });

    // Si Bob intenta ejecutar la tx con parámertros distintos a lo solicitado
    // por Alice, por ejemplo poniendo menos USDTs para el intercambio, falla
    it('reverts if Bob tries to manipulate the input signed by Alice', async () => {
      const deadline =
        (await time.latest()).toNumber() +
        (await time.duration.days(1).toNumber());
      const msgHash = await soliditySha3(
        geotoken.address,
        tradeAmounts,
        usdt.address,
        tradeAmounts,
        deadline
      );

      let signature = await web3.eth.sign(msgHash, alice);
      signature =
        signature.substr(0, 130) +
        (signature.substr(130) == '00' ? '1b' : '1c'); // v: 0,1 => 27,28

      await expectRevert(
        metatx.atomicSwap(
          msgHash,
          geotoken.address,
          tradeAmounts,
          usdt.address,
          tradeAmounts.sub(new BN('1')),
          deadline,
          signature,
          { from: bob }
        ),
        'Hash computation did not succeed'
      );
    });

    // Si Bob intenta ejecutar la transacción firmada varias veces, para intentar
    // intercambiar 20 Geos de Alice por 20 USDT, falla
    it('reverts if Bob tries to transact multiple times with the same signature', async () => {
      const deadline =
        (await time.latest()).toNumber() +
        (await time.duration.days(1).toNumber());
      const msgHash = await soliditySha3(
        geotoken.address,
        tradeAmounts,
        usdt.address,
        tradeAmounts,
        deadline
      );

      let signature = await web3.eth.sign(msgHash, alice);
      signature =
        signature.substr(0, 130) +
        (signature.substr(130) == '00' ? '1b' : '1c'); // v: 0,1 => 27,28

      await metatx.atomicSwap(
        msgHash,
        geotoken.address,
        tradeAmounts,
        usdt.address,
        tradeAmounts,
        deadline,
        signature,
        { from: bob }
      );

      await expectRevert(
        metatx.atomicSwap(
          msgHash,
          geotoken.address,
          tradeAmounts,
          usdt.address,
          tradeAmounts,
          deadline,
          signature,
          { from: bob }
        ),
        'This swap was already used'
      );
    });
  });
});
