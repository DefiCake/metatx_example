/**
 * To use this, just do `gulp watch` or `CONTRACT=<contract> gulp watch`
 * (e.g. `CONTRACT=MetaTx gulp watch`)
 */

const gulp = require('gulp');
const watch = require('gulp-watch');
const { exec, spawn } = require('child_process');
const path = require('path');
const fs = require('fs-extra');

const contractToTest = (process.env.CONTRACT || '*').trim();

gulp.task('default', async () => {
  console.log('Options: ', 'test');
});

gulp.task('watch', async cb => {
  compileContractsAndRunTest();

  watch([`./contracts/**/${contractToTest}.sol`], cb => {
    compileContractsAndRunTest(cb);
  });

  watch([`./test/**/*.js`], cb => {
    test(cb);
  });
});

const compileContractsAndRunTest = cb => {
  console.log('\n===============\nCompiling\n===============\n');

  exec(`truffle compile`, function(err, stdout, stderr) {
    console.log(stdout);

    if (err) {
      console.log('Error running UNIX commands');
      console.error(err);
    }

    if (stderr) {
      console.error(stderr);
    }

    if (!err & !stderr) {
      test(cb);
    }
  });
};

const test = cb => {
  console.log('\n===============\nTesting\n===============\n');

  if (contractToTest !== '*') {
    runOneTest(`${contractToTest}`);
  } else if (cb && cb.history && cb.history[0]) {
    const contracts = fs.readdirSync('./contracts');

    for (let i = 0; i < contracts.length; i++) {
      contracts[i] = contracts[i].replace('.sol', '');
    }

    let fileName = path
      .basename(cb.history[0])
      .replace('.sol', '')
      .replace('.js', '');

    if (contracts.includes(fileName)) {
      runOneTest(`${fileName}`);
    } else {
      runAllTests();
    }
  } else {
    runAllTests();
  }
};

const runAllTests = () => {
  const cmd = spawn('truffle', ['test']).on('error', error => {
    console.log('Error running UNIX command');
    console.error(error);
  });

  cmd.stdout.on('data', data => process.stdout.write(`${data}`));

  cmd.stderr.on('data', data => console.error(`${data}`));

  cmd.on('close', () =>
    console.log('\n===============\nFinished\n===============\n')
  );
};

const runOneTest = test => {
  const cmd = spawn('truffle', ['test', `./test/${test}.js`]).on(
    'error',
    error => {
      console.log('Error running UNIX command');
      console.error(error);
    }
  );

  cmd.stdout.on('data', data => process.stdout.write(`${data}`));

  cmd.stderr.on('data', data => console.error(`${data}`));

  cmd.on('close', () =>
    console.log('\n===============\nFinished\n===============\n')
  );
};
