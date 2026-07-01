import { authenticate, CredentialsMissingError, printCredentialsSetupInstructions } from '../lib/auth';
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
    // When the credentials file is missing, print the setup instructions so
    // the user can fix it without a second guess about where to look.
    if (err instanceof CredentialsMissingError) {
      console.log('');
      printCredentialsSetupInstructions();
    }
    process.exit(1);
  }
}

export = authCommand;
