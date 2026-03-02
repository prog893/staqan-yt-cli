import { authenticate } from '../lib/auth';
import { success, error } from '../lib/utils';

async function authCommand(): Promise<void> {
  try {
    console.log('Starting authentication process...\n');
    await authenticate();
    console.log('');
    success('Authentication successful!');
    console.log('You can now use all staqan-yt commands.');
    process.exit(0);
  } catch (err) {
    console.log('');
    error(`Authentication failed: ${(err as Error).message}`);
    process.exit(1);
  }
}

export = authCommand;
