import 'dotenv/config';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'node:crypto';
import { Pool, PoolClient } from 'pg';
import * as readline from 'node:readline';

function createDatabasePool(): Pool {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not configured.');
  }

  return new Pool({
    connectionString: databaseUrl,
  });
}

function createInterface(): readline.Interface {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

function ask(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer.trim());
    });
  });
}

function askHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    const stdout = process.stdout;

    stdout.write(question);

    stdin.resume();
    stdin.setRawMode?.(true);
    stdin.setEncoding('utf8');

    let password = '';

    const onData = (character: string) => {
      if (character === '\u0003') {
        stdin.setRawMode?.(false);
        stdin.pause();
        stdout.write('\n');
        process.exit(1);
      }

      if (character === '\r' || character === '\n') {
        stdin.setRawMode?.(false);
        stdin.pause();
        stdin.removeListener('data', onData);
        stdout.write('\n');
        resolve(password);
        return;
      }

      if (character === '\u007f') {
        if (password.length > 0) {
          password = password.slice(0, -1);
        }

        return;
      }

      password += character;
    };

    stdin.on('data', onData);
  });
}

function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function findExistingAdmin(
  client: PoolClient,
): Promise<{ id: string; email: string } | null> {
  const result = await client.query<{
    id: string;
    email: string;
  }>(
    `
      SELECT "id", "email"
      FROM "HrOfficer"
      WHERE "role" = 'ADMIN'
      LIMIT 1
    `,
  );

  return result.rows[0] ?? null;
}

async function main(): Promise<void> {
  const pool = createDatabasePool();
  const rl = createInterface();

  try {
    console.log('\nHR WhatsApp Admin Bootstrap');
    console.log('============================\n');

    const connection = await pool.connect();

    try {
      const existingAdmin = await findExistingAdmin(connection);

      if (existingAdmin) {
        throw new Error(
          `An ADMIN account already exists (${existingAdmin.email}). Bootstrap is disabled.`,
        );
      }
    } finally {
      connection.release();
    }

    const fullName = await ask(rl, 'Full name: ');
    const email = (await ask(rl, 'Email: ')).toLowerCase();

    if (!fullName || fullName.length < 2) {
      throw new Error('Full name must contain at least 2 characters.');
    }

    if (!validateEmail(email)) {
      throw new Error('Please provide a valid email address.');
    }

    const password = await askHidden('Password: ');
    const confirmPassword = await askHidden('Confirm password: ');

    if (password.length < 8) {
      throw new Error('Password must contain at least 8 characters.');
    }

    if (password.length > 128) {
      throw new Error('Password must not exceed 128 characters.');
    }

    if (password !== confirmPassword) {
      throw new Error('Passwords do not match.');
    }

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      /*
       * Re-check inside the transaction so that two bootstrap
       * processes cannot both pass the initial ADMIN check.
       */
      const existingAdmin = await findExistingAdmin(client);

      if (existingAdmin) {
        throw new Error(
          `An ADMIN account already exists (${existingAdmin.email}). Bootstrap is disabled.`,
        );
      }

      const existingOfficer = await client.query<{
        id: string;
      }>(
        `
          SELECT "id"
          FROM "HrOfficer"
          WHERE LOWER("email") = LOWER($1)
          LIMIT 1
        `,
        [email],
      );

      if (existingOfficer.rowCount && existingOfficer.rowCount > 0) {
        throw new Error('An HR account with this email already exists.');
      }

      const passwordHash = await bcrypt.hash(password, 12);
      const officerId = randomUUID();

      await client.query(
        `
          INSERT INTO "HrOfficer" (
            "id",
            "fullName",
            "email",
            "passwordHash",
            "role",
            "status",
            "createdAt",
            "updatedAt"
          )
          VALUES (
            $1,
            $2,
            $3,
            $4,
            'ADMIN',
            'ACTIVE',
            NOW(),
            NOW()
          )
        `,
        [officerId, fullName, email, passwordHash],
      );

      await client.query(
        `
          INSERT INTO "AuditLog" (
            "id",
            "actorType",
            "action",
            "entityType",
            "entityId",
            "metadata",
            "createdAt"
          )
          VALUES (
            $1,
            'SYSTEM',
            'HR_ADMIN_BOOTSTRAPPED',
            'HR_OFFICER',
            $2,
            $3::jsonb,
            NOW()
          )
        `,
        [
          randomUUID(),
          officerId,
          JSON.stringify({
            role: 'ADMIN',
            email,
          }),
        ],
      );

      await client.query('COMMIT');

      console.log('\nADMIN account created successfully.');
      console.log(`Name: ${fullName}`);
      console.log(`Email: ${email}`);
      console.log('Role: ADMIN');
      console.log('\nThe initial ADMIN bootstrap is now locked.');
      console.log(
        'Additional HR accounts must be created by an authenticated ADMIN.',
      );
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } finally {
    rl.close();
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(
    `\nBootstrap failed: ${
      error instanceof Error ? error.message : String(error)
    }`,
  );

  process.exitCode = 1;
});
