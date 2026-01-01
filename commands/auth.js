const { authenticate } = require('../lib/auth');
const { success, error } = require('../lib/utils');

async function authCommand() {
  try {
    console.log('Starting authentication process...\n');
    await authenticate();
    console.log('');
    success('Authentication successful!');
    console.log('You can now use all staqan-yt commands.');
  } catch (err) {
    console.log('');
    error(`Authentication failed: ${err.message}`);
    process.exit(1);
  }
}

module.exports = authCommand;
